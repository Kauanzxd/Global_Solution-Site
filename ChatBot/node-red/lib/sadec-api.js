/* SADEC — núcleo da API usada pelo Node-RED (endpoints e chatbot).
   Responsabilidades: Python calcula distância/bateria, Java decide a atribuição (CentralOperacao),
   o SQLite é a única fonte de verdade e este módulo orquestra tudo em transações.
   Não há regra de despacho aqui: a escolha do drone vem sempre da CentralOperacao Java. */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const CONFIG = {
  banco: process.env.SADEC_DB || path.join(RAIZ, 'ChatBot', 'SADEC_Chatbot.db'),
  python: process.env.SADEC_PYTHON || 'python',
  scriptPython: path.join(RAIZ, 'Python', 'sadec_integracao.py'),
  java: process.env.SADEC_JAVA || 'java',
  classpathJava: path.join(RAIZ, 'Java', 'SADEC', 'out')
};

const TIPOS_CARGA = ['orgao', 'remedio', 'kit_emergencia', 'exame', 'encomenda'];
const PRIORIDADE_DA_CARGA = { orgao: 1, kit_emergencia: 2, remedio: 3, exame: 3, encomenda: 4 };
/* Autorização dos pedidos críticos: quem pode solicitar cada prioridade. */
const AUTORIZADOS = {
  1: ['hospital', 'central_transplantes'],
  2: ['defesa_civil', 'municipio'],
  3: ['cidadao', 'ubs', 'farmacia', 'hospital', 'central_transplantes', 'defesa_civil', 'municipio'],
  4: ['cliente', 'comercio']
};
const ESTADOS_RECEBIMENTO = ['integra', 'avariada', 'temperatura', 'recusada'];

class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes || null;
  }
}

/* ---------- chamadas aos componentes ---------- */
function chamarJson(executavel, args, entrada, nome) {
  let saida;
  try {
    saida = execFileSync(executavel, args, { input: JSON.stringify(entrada), encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    // códigos 2 e 3 = entrada inválida / regra recusada: o stdout ainda tem o JSON
    if (e.stdout && String(e.stdout).trim()) saida = String(e.stdout);
    else throw new ErroApi(502, nome + ' indisponível: ' + (e.code === 'ENOENT' ? 'executável não encontrado' : 'falha na execução'));
  }
  const linhas = String(saida).trim().split(/\r?\n/);
  try {
    return JSON.parse(linhas[linhas.length - 1]);
  } catch {
    throw new ErroApi(502, nome + ' devolveu uma resposta inválida.');
  }
}
const python = (dados) => chamarJson(CONFIG.python, [CONFIG.scriptPython], dados, 'Python');
const java = (dados) => chamarJson(CONFIG.java, ['-cp', CONFIG.classpathJava, 'br.com.fiap.sadec.integracao.IntegracaoCLI'], dados, 'Java');

/* ---------- banco ---------- */
function abrir() {
  const db = new DatabaseSync(CONFIG.banco);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  return db;
}

function transacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const agora = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
};

function evento(db, codigo, drone, anterior, novo, descricao, responsavel) {
  db.prepare('INSERT INTO tbl_evento (CD_Rastreio, CD_Drone, ST_Anterior, ST_Novo, DS_Evento, NM_Responsavel, DT_Evento) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(codigo, drone || null, anterior || null, novo, descricao, responsavel, agora());
}

function proximoCodigo(db) {
  const r = db.prepare("SELECT MAX(CAST(SUBSTR(CD_Rastreio, 3) AS INTEGER)) AS n FROM tbl_entrega WHERE CD_Rastreio GLOB 'SD[0-9]*'").get();
  return 'SD' + Math.max(1001, (r.n || 1000) + 1);
}

/* ---------- formato do contrato ---------- */
function pedidoJson(l) {
  return {
    codigo: l.CD_Rastreio, prioridade: l.NR_Prioridade, tipo_carga: l.TP_Carga,
    origem: l.NM_Origem || null, destino: l.NM_Destino, distancia_km: l.NR_Distancia_Km,
    peso_kg: l.NR_Peso_Kg, status: l.ST_Status, drone_codigo: l.CD_Drone || null,
    data_hora: l.DT_Pedido, solicitante: l.DS_Solicitante || null, motivo: l.DS_Motivo || null, periodo: l.DS_Periodo || null
  };
}
function droneJson(d) {
  return { codigo: d.CD_Drone, modelo: d.NM_Modelo, bateria_pct: d.NR_Bateria_Pct, autonomia_km: d.NR_Autonomia_Km, status: d.ST_Status, filial: d.NM_Filial };
}
function eventoJson(e) {
  return { pedido_codigo: e.CD_Rastreio, drone_codigo: e.CD_Drone, status_anterior: e.ST_Anterior, status_novo: e.ST_Novo, descricao: e.DS_Evento, responsavel: e.NM_Responsavel, data_hora: e.DT_Evento };
}

function dronesParaJava(db) {
  return db.prepare('SELECT CD_Drone, NR_Bateria_Pct, NR_Autonomia_Km, ST_Status FROM tbl_drone').all()
    .map((d) => ({ codigo: d.CD_Drone, bateria_pct: d.NR_Bateria_Pct, autonomia_km: d.NR_Autonomia_Km, status: d.ST_Status }));
}
function comerciaisAguardando(db) {
  return db.prepare("SELECT e.CD_Rastreio, e.CD_Drone FROM tbl_entrega e JOIN tbl_drone d ON d.CD_Drone = e.CD_Drone WHERE e.NR_Prioridade = 4 AND e.ST_Status IN ('aguardando', 'atribuida') AND d.ST_Status = 'aguardando_comercial'").all()
    .map((c) => ({ codigo: c.CD_Rastreio, drone_codigo: c.CD_Drone }));
}

/* Aplica a decisão da Java para um pedido já gravado (dentro de uma transação). */
function despachar(db, linha, responsavel) {
  const decisao = java({
    operacao: 'atribuir',
    pedido: { codigo: linha.CD_Rastreio, prioridade: linha.NR_Prioridade, tipo_carga: linha.TP_Carga, distancia_km: linha.NR_Distancia_Km, origem: linha.NM_Origem || '' },
    drones: dronesParaJava(db),
    comerciais_aguardando: comerciaisAguardando(db)
  });
  if (!decisao.ok) throw new ErroApi(422, 'A Central Java recusou o pedido.', decisao.erros);

  for (const cod of decisao.reagendadas || []) {
    db.prepare("UPDATE tbl_entrega SET ST_Status = 'reagendada', CD_Drone = NULL WHERE CD_Rastreio = ?").run(cod);
    evento(db, cod, null, 'aguardando', 'reagendada', 'Drone cedido ao pedido ' + linha.CD_Rastreio + ' (P' + linha.NR_Prioridade + ') antes da decolagem.', 'Central Java');
  }
  if (!decisao.atribuido) {
    db.prepare("UPDATE tbl_entrega SET ST_Status = 'outro_meio', DS_Motivo = ? WHERE CD_Rastreio = ?").run(decisao.motivo, linha.CD_Rastreio);
    evento(db, linha.CD_Rastreio, null, linha.ST_Status, 'outro_meio', decisao.motivo, 'Central Java');
    return decisao;
  }
  // Trava contra despacho duplo: só reserva se o drone ainda estiver livre/aguardando comercial.
  const reserva = db.prepare("UPDATE tbl_drone SET ST_Status = ? WHERE CD_Drone = ? AND ST_Status IN ('livre', 'aguardando_comercial')")
    .run(decisao.status_drone, decisao.drone_codigo);
  if (reserva.changes !== 1) throw new ErroApi(409, 'O drone ' + decisao.drone_codigo + ' foi reservado por outro pedido. Tente novamente.');
  db.prepare("UPDATE tbl_entrega SET ST_Status = 'atribuida', CD_Drone = ?, DS_Motivo = NULL WHERE CD_Rastreio = ?").run(decisao.drone_codigo, linha.CD_Rastreio);
  evento(db, linha.CD_Rastreio, decisao.drone_codigo, linha.ST_Status, 'atribuida',
    'Drone ' + decisao.drone_codigo + ' reservado pela Central Java (ida e volta ' + decisao.distancia_ida_volta_km + ' km × ' + decisao.fator_seguranca + '). Aguarda decolagem.', responsavel);
  return decisao;
}

/* ---------- casos de uso ---------- */
function criarPedido(entrada) {
  const e = entrada || {};
  const erros = [];
  if (!TIPOS_CARGA.includes(e.tipo_carga)) erros.push('tipo_carga precisa ser um de: ' + TIPOS_CARGA.join(', ') + '.');
  const prioridade = PRIORIDADE_DA_CARGA[e.tipo_carga];
  const sol = e.solicitante || {};
  if (!sol.tipo) erros.push('solicitante.tipo é obrigatório.');
  if (typeof e.destino !== 'string' || !e.destino.trim()) erros.push('destino é obrigatório.');
  if (e.peso_kg !== undefined && (typeof e.peso_kg !== 'number' || e.peso_kg <= 0 || e.peso_kg > 50)) erros.push('peso_kg precisa estar entre 0 e 50.');
  if (erros.length) throw new ErroApi(400, 'Pedido inválido.', erros);
  if (!AUTORIZADOS[prioridade].includes(sol.tipo)) {
    throw new ErroApi(403, 'Pedido P' + prioridade + ' não autorizado para o solicitante "' + sol.tipo + '".',
      ['P1: hospitais ou Central de Transplantes. P2: Defesa Civil ou município. O chatbot público não autoriza despacho P1 ou P2.']);
  }
  const db = abrir();
  try {
    const local = db.prepare('SELECT NM_Local, NR_Distancia_Km FROM tbl_local WHERE NM_Local = ?').get(e.destino.trim());
    if (!local) throw new ErroApi(400, 'Destino fora da rede piloto.', db.prepare('SELECT NM_Local FROM tbl_local ORDER BY NM_Local').all().map((x) => x.NM_Local));

    // 2. Python: distância da rota e bateria necessária com reserva de 30% (referência: maior autonomia da frota)
    const ref = db.prepare('SELECT MAX(NR_Autonomia_Km) AS a FROM tbl_drone').get();
    const calculo = python({ operacao: 'calcular_rota', distancia_km: local.NR_Distancia_Km, autonomia_km: ref.a });
    if (!calculo.ok) throw new ErroApi(422, 'Python recusou o cálculo.', calculo.erros);

    return transacao(db, () => {
      const codigo = proximoCodigo(db);
      db.prepare(`INSERT INTO tbl_entrega (CD_Rastreio, NR_Chat, NM_Destino, TP_Carga, NR_Prioridade, ST_Status, DS_Periodo, DT_Pedido,
        NM_Origem, NR_Distancia_Km, NR_Peso_Kg, DS_Solicitante) VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, ?, ?, ?, ?)`)
        .run(codigo, e.chat || null, local.NM_Local, e.tipo_carga, prioridade, e.periodo || 'agora', agora(),
          e.origem || null, local.NR_Distancia_Km, e.peso_kg || null, sol.tipo + (sol.nome ? ': ' + sol.nome : ''));
      evento(db, codigo, null, null, 'aguardando', 'Pedido registrado (' + (e.canal || 'site') + '). Bateria de referência pelo Python: ' + calculo.bateria_necessaria_pct + '%.', sol.nome || sol.tipo);
      const linha = db.prepare('SELECT * FROM tbl_entrega WHERE CD_Rastreio = ?').get(codigo);
      // 3. Java: aplica as regras da CentralOperacao e reserva o drone
      const decisao = despachar(db, linha, 'Central Java');
      return { pedido: obterPedidoDb(db, codigo), calculo_python: calculo, decisao_java: decisao };
    });
  } finally {
    db.close();
  }
}

function obterPedidoDb(db, codigo) {
  const l = db.prepare('SELECT * FROM tbl_entrega WHERE CD_Rastreio = ?').get(String(codigo || '').toUpperCase());
  if (!l) return null;
  const p = pedidoJson(l);
  p.eventos = db.prepare('SELECT * FROM tbl_evento WHERE CD_Rastreio = ? ORDER BY ID_Evento').all(l.CD_Rastreio).map(eventoJson);
  const r = db.prepare('SELECT * FROM tbl_recebimento WHERE CD_Rastreio = ?').get(l.CD_Rastreio);
  p.recebimento = r ? { pedido_codigo: r.CD_Rastreio, responsavel: r.NM_Responsavel, destinatario: r.NM_Destinatario, estado_carga: r.ST_Carga, data_hora: r.DT_Recebimento } : null;
  return p;
}

function obterPedido(codigo) {
  const db = abrir();
  try {
    const p = obterPedidoDb(db, codigo);
    if (!p) throw new ErroApi(404, 'Pedido ' + codigo + ' não encontrado.');
    return p;
  } finally { db.close(); }
}

function listarPedidos() {
  const db = abrir();
  try {
    return db.prepare('SELECT * FROM tbl_entrega ORDER BY NR_Prioridade, ID_Entrega').all().map(pedidoJson);
  } finally { db.close(); }
}

function listarLocais() {
  const db = abrir();
  try {
    return db.prepare('SELECT NM_Local, TP_Local, NR_Distancia_Km FROM tbl_local ORDER BY TP_Local, NM_Local').all()
      .map((l) => ({ nome: l.NM_Local, tipo: l.TP_Local, distancia_km: l.NR_Distancia_Km }));
  } finally { db.close(); }
}

function listarDrones() {
  const db = abrir();
  try {
    return db.prepare('SELECT d.*, f.NM_Filial FROM tbl_drone d JOIN tbl_filial f ON f.ID_Filial = d.ID_Filial ORDER BY d.CD_Drone').all().map(droneJson);
  } finally { db.close(); }
}

/* Processa a fila: a ordem vem da Java (registrarPedido), cada pedido passa pela atribuição Java. */
function processarFila() {
  const db = abrir();
  try {
    return transacao(db, () => {
      const pendentes = db.prepare("SELECT * FROM tbl_entrega WHERE ST_Status IN ('aguardando', 'reagendada') AND CD_Drone IS NULL ORDER BY ID_Entrega").all();
      if (!pendentes.length) return { processados: [] };
      const ordem = java({ operacao: 'ordenar_fila', pedidos: pendentes.map((p) => ({ codigo: p.CD_Rastreio, prioridade: p.NR_Prioridade, tipo_carga: p.TP_Carga })) });
      if (!ordem.ok) throw new ErroApi(502, 'Java não ordenou a fila.', ordem.erros);
      const processados = [];
      for (const cod of ordem.ordem) {
        const linha = db.prepare('SELECT * FROM tbl_entrega WHERE CD_Rastreio = ?').get(cod);
        const d = despachar(db, linha, 'Central Java (fila)');
        processados.push({ codigo: cod, atribuido: d.atribuido, drone_codigo: d.drone_codigo, motivo: d.motivo || null });
      }
      return { processados };
    });
  } finally { db.close(); }
}

function mudarPedido(codigo, de, para, droneDe, dronePara, descricao, responsavel, extra) {
  const db = abrir();
  try {
    return transacao(db, () => {
      const l = db.prepare('SELECT * FROM tbl_entrega WHERE CD_Rastreio = ?').get(String(codigo).toUpperCase());
      if (!l) throw new ErroApi(404, 'Pedido ' + codigo + ' não encontrado.');
      if (!de.includes(l.ST_Status)) throw new ErroApi(409, 'Pedido ' + l.CD_Rastreio + ' está "' + l.ST_Status + '"; ação não permitida.');
      if (l.CD_Drone && dronePara) {
        const d = db.prepare('UPDATE tbl_drone SET ST_Status = ? WHERE CD_Drone = ? AND ST_Status IN (' + droneDe.map(() => '?').join(',') + ')')
          .run(typeof dronePara === 'function' ? dronePara(l) : dronePara, l.CD_Drone, ...droneDe);
        if (d.changes !== 1) throw new ErroApi(409, 'Estado do drone ' + l.CD_Drone + ' não permite a ação.');
      }
      db.prepare('UPDATE tbl_entrega SET ST_Status = ? WHERE CD_Rastreio = ?').run(para, l.CD_Rastreio);
      if (extra) extra(db, l);
      evento(db, l.CD_Rastreio, l.CD_Drone, l.ST_Status, para, descricao, responsavel);
      return obterPedidoDb(db, l.CD_Rastreio);
    });
  } finally { db.close(); }
}

/* Só aqui o pedido entra em voo: a atribuição não marca em_voo. */
function decolar(codigo, responsavel) {
  return mudarPedido(codigo, ['atribuida'], 'em_voo', ['atribuido', 'aguardando_comercial'],
    (l) => (l.NR_Prioridade === 4 ? 'em_voo_comercial' : 'em_voo'), 'Decolagem autorizada.', responsavel || 'Operador da Central');
}

function concluirEntrega(codigo, responsavel) {
  return mudarPedido(codigo, ['em_voo'], 'entregue', ['em_voo', 'em_voo_comercial'], 'livre', 'Carga entregue no destino.', responsavel || 'Operador da Central',
    (db, l) => {
      // consumo da ida e volta, como no Drone.consumirBateria() da Java
      const d = db.prepare('SELECT NR_Bateria_Pct, NR_Autonomia_Km FROM tbl_drone WHERE CD_Drone = ?').get(l.CD_Drone);
      const gasto = Math.round((l.NR_Distancia_Km || 0) * 2 / d.NR_Autonomia_Km * 100);
      db.prepare('UPDATE tbl_drone SET NR_Bateria_Pct = ? WHERE CD_Drone = ?').run(Math.max(0, d.NR_Bateria_Pct - gasto), l.CD_Drone);
    });
}

function registrarRecebimento(codigo, dados) {
  const d = dados || {};
  const erros = [];
  const responsavel = typeof d.responsavel === 'string' ? d.responsavel.trim() : '';
  const destinatario = typeof d.destinatario === 'string' ? d.destinatario.trim() : '';
  if (!responsavel) erros.push('responsavel é obrigatório.');
  if (!destinatario) erros.push('destinatario é obrigatório.');
  if (!ESTADOS_RECEBIMENTO.includes(d.estado_carga)) erros.push('estado_carga precisa ser um de: ' + ESTADOS_RECEBIMENTO.join(', ') + '.');
  if (erros.length) throw new ErroApi(400, 'Recebimento inválido.', erros);
  const db = abrir();
  try {
    return transacao(db, () => {
      const l = db.prepare('SELECT * FROM tbl_entrega WHERE CD_Rastreio = ?').get(String(codigo).toUpperCase());
      if (!l) throw new ErroApi(404, 'Pedido ' + codigo + ' não encontrado.');
      if (l.ST_Status !== 'entregue') throw new ErroApi(409, 'Só é possível registrar recebimento de pedido entregue.');
      if (db.prepare('SELECT 1 FROM tbl_recebimento WHERE CD_Rastreio = ?').get(l.CD_Rastreio)) throw new ErroApi(409, 'Recebimento já registrado.');
      db.prepare('INSERT INTO tbl_recebimento (CD_Rastreio, NM_Responsavel, NM_Destinatario, ST_Carga, DT_Recebimento) VALUES (?, ?, ?, ?, ?)')
        .run(l.CD_Rastreio, responsavel.slice(0, 60), destinatario.slice(0, 60), d.estado_carga, agora());
      evento(db, l.CD_Rastreio, l.CD_Drone, 'entregue', 'entregue', 'Recebimento registrado: carga ' + d.estado_carga + ', recebida por ' + destinatario.slice(0, 60) + '.', responsavel.slice(0, 60));
      return obterPedidoDb(db, l.CD_Rastreio);
    });
  } finally { db.close(); }
}

/* Ciclo de recuperação do drone pela Java: concluir_resgate, concluir_manutencao, liberar. */
function recuperarDrone(codigoDrone, acao, responsavel) {
  const db = abrir();
  try {
    return transacao(db, () => {
      const d = db.prepare('SELECT * FROM tbl_drone WHERE CD_Drone = ?').get(String(codigoDrone).toUpperCase());
      if (!d) throw new ErroApi(404, 'Drone ' + codigoDrone + ' não encontrado.');
      const r = java({ operacao: 'recuperacao', acao, drone: { codigo: d.CD_Drone, bateria_pct: d.NR_Bateria_Pct, autonomia_km: d.NR_Autonomia_Km, status: d.ST_Status } });
      if (!r.ok) throw new ErroApi(400, 'Ação inválida.', r.erros);
      if (!r.aceito) throw new ErroApi(409, r.motivo);
      db.prepare('UPDATE tbl_drone SET ST_Status = ? WHERE CD_Drone = ? AND ST_Status = ?').run(r.status_novo, d.CD_Drone, r.status_anterior);
      const nomes = { concluir_resgate: 'Drone resgatado e levado à manutenção.', concluir_manutencao: 'Manutenção concluída; aguarda liberação formal.', liberar: 'Drone liberado formalmente e devolvido à frota.' };
      evento(db, null, d.CD_Drone, r.status_anterior, r.status_novo, nomes[acao], responsavel || 'Operador da Central');
      return droneJson(db.prepare('SELECT d.*, f.NM_Filial FROM tbl_drone d JOIN tbl_filial f ON f.ID_Filial = d.ID_Filial WHERE d.CD_Drone = ?').get(d.CD_Drone));
    });
  } finally { db.close(); }
}

module.exports = {
  CONFIG, ErroApi, AUTORIZADOS,
  criarPedido, obterPedido, listarPedidos, listarDrones, listarLocais, processarFila,
  decolar, concluirEntrega, registrarRecebimento, recuperarDrone
};
