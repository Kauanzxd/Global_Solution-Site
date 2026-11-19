/* SADEC — núcleo da API usada pelo Node-RED (endpoints e chatbot).
   Responsabilidades: Python calcula distância/bateria, Java decide a atribuição (CentralOperacao),
   o SQLite é a única fonte de verdade e este módulo orquestra tudo em transações.
   Não há regra de despacho aqui: a escolha do drone vem sempre da CentralOperacao Java. */
'use strict';

const path = require('path');
const crypto = require('crypto');
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

/* ---------- contas e sessões (uma conta vale para o portal, o Saúde e o Delivery) ---------- */
const PERFIS_PUBLICOS = ['cliente', 'unidade_saude'];
/* Que tipo de solicitante cada perfil pode declarar no pedido. */
const SOLICITANTE_DO_PERFIL = {
  cliente: ['cliente', 'cidadao'],
  unidade_saude: ['hospital', 'ubs', 'farmacia', 'central_transplantes', 'cidadao'],
  governo: ['defesa_civil', 'municipio', 'cidadao'],
  operador: ['hospital', 'central_transplantes', 'defesa_civil', 'municipio', 'ubs', 'farmacia', 'cidadao', 'cliente', 'comercio']
};
const HORAS_SESSAO = 12;
const DIAS_SESSAO_LONGA = 30;
const HORAS_CODIGO_ORGAO = 6;

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const dataMais = (ms) => {
  const d = new Date(Date.now() + ms);
  return d.toISOString();
};

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  return 'scrypt$16384$8$1$' + sal.toString('hex') + '$' + crypto.scryptSync(senha, sal, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}
function senhaConfere(senha, guardado) {
  const p = String(guardado || '').split('$');
  if (p.length !== 6 || p[0] !== 'scrypt') return false;
  const esperado = Buffer.from(p[5], 'hex');
  const obtido = crypto.scryptSync(String(senha), Buffer.from(p[4], 'hex'), esperado.length, { N: Number(p[1]), r: Number(p[2]), p: Number(p[3]) });
  return crypto.timingSafeEqual(esperado, obtido);
}

function contaJson(u) {
  return { id: u.ID_Usuario, nome: u.NM_Nome, email: u.DS_Email, perfil: u.TP_Perfil, instituicao: u.NM_Instituicao || null, criada_em: u.DT_Criacao };
}

function criarConta(entrada) {
  const e = entrada || {};
  const nome = typeof e.nome === 'string' ? e.nome.trim() : '';
  const email = typeof e.email === 'string' ? e.email.trim().toLowerCase() : '';
  const senha = typeof e.senha === 'string' ? e.senha : '';
  const instituicao = typeof e.instituicao === 'string' ? e.instituicao.trim() : '';
  const erros = [];
  if (nome.length < 2 || nome.length > 80) erros.push('nome precisa ter entre 2 e 80 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) erros.push('email inválido.');
  if (senha.length < 8 || senha.length > 128) erros.push('senha precisa ter de 8 a 128 caracteres.');
  if (!PERFIS_PUBLICOS.includes(e.perfil)) erros.push('perfil precisa ser cliente ou unidade_saude (contas de governo e de operador são criadas pela Central).');
  if (e.perfil === 'unidade_saude' && !instituicao) erros.push('instituicao é obrigatória para unidade de saúde.');
  if (erros.length) throw new ErroApi(400, 'Cadastro inválido.', erros);
  const db = abrir();
  try {
    if (e.perfil === 'unidade_saude' && !db.prepare("SELECT 1 FROM tbl_local WHERE TP_Local = 'hospital' AND NM_Local = ?").get(instituicao)) {
      throw new ErroApi(400, 'Unidade de saúde fora da rede piloto.', ['Escolha um hospital da lista (GET /api/locais).']);
    }
    if (db.prepare('SELECT 1 FROM tbl_usuario WHERE DS_Email = ?').get(email)) throw new ErroApi(409, 'Já existe uma conta com esse e-mail.');
    const r = db.prepare('INSERT INTO tbl_usuario (NM_Nome, DS_Email, DS_Senha_Hash, TP_Perfil, NM_Instituicao, DT_Criacao) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nome, email, hashSenha(senha), e.perfil, e.perfil === 'unidade_saude' ? instituicao : null, agora());
    return contaJson(db.prepare('SELECT * FROM tbl_usuario WHERE ID_Usuario = ?').get(r.lastInsertRowid));
  } finally { db.close(); }
}

function entrar(entrada) {
  const e = entrada || {};
  const email = typeof e.email === 'string' ? e.email.trim().toLowerCase() : '';
  const db = abrir();
  try {
    const u = email ? db.prepare('SELECT * FROM tbl_usuario WHERE DS_Email = ?').get(email) : null;
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails têm conta.
    if (!u || !senhaConfere(e.senha, u.DS_Senha_Hash)) throw new ErroApi(401, 'E-mail ou senha incorretos.');
    // Operador (inclui a conta de administrador) entra por qualquer perfil: tem acesso a tudo.
    if (e.perfil && e.perfil !== u.TP_Perfil && u.TP_Perfil !== 'operador') {
      const nomes = { cliente: 'Cliente', unidade_saude: 'Unidade de saúde', governo: 'Governo', operador: 'Operador' };
      throw new ErroApi(403, 'Esta conta é do perfil "' + (nomes[u.TP_Perfil] || u.TP_Perfil) + '". Escolha esse perfil para entrar.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expira = dataMais(e.manter ? DIAS_SESSAO_LONGA * 864e5 : HORAS_SESSAO * 36e5);
    db.prepare('DELETE FROM tbl_sessao WHERE DT_Expira < ?').run(new Date().toISOString());
    db.prepare('INSERT INTO tbl_sessao (DS_Token_Hash, ID_Usuario, DT_Expira) VALUES (?, ?, ?)').run(sha256(token), u.ID_Usuario, expira);
    return { token, expira_em: expira, conta: contaJson(u) };
  } finally { db.close(); }
}

/* Lê "Authorization: Bearer <token>". Sem cabeçalho devolve null; token inválido ou vencido gera 401. */
function contaDaSessao(autorizacao) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(String(autorizacao || '').trim());
  if (!autorizacao) return null;
  if (!m) throw new ErroApi(401, 'Sessão inválida. Entre novamente.');
  const db = abrir();
  try {
    const u = db.prepare('SELECT u.* FROM tbl_sessao s JOIN tbl_usuario u ON u.ID_Usuario = s.ID_Usuario WHERE s.DS_Token_Hash = ? AND s.DT_Expira > ?')
      .get(sha256(m[1].toLowerCase()), new Date().toISOString());
    if (!u) throw new ErroApi(401, 'Sessão expirada. Entre novamente.');
    return contaJson(u);
  } finally { db.close(); }
}

function exigirConta(autorizacao, perfis) {
  const conta = contaDaSessao(autorizacao);
  if (!conta) throw new ErroApi(401, 'Entre na sua conta para continuar.');
  if (perfis && !perfis.includes(conta.perfil)) throw new ErroApi(403, 'Esta ação é exclusiva do perfil ' + perfis.join(' ou ') + '.');
  return conta;
}

function sair(autorizacao) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(String(autorizacao || '').trim());
  if (!m) return { saiu: false };
  const db = abrir();
  try {
    db.prepare('DELETE FROM tbl_sessao WHERE DS_Token_Hash = ?').run(sha256(m[1].toLowerCase()));
    return { saiu: true };
  } finally { db.close(); }
}

/* ---------- códigos de autorização de órgão (P1): um por transporte, uso único ---------- */
function codigoOrgaoJson(c) {
  return { codigo: c.CD_Codigo, hospital: c.NM_Hospital, status: c.ST_Codigo, pedido_codigo: c.CD_Rastreio || null, emitido_em: c.DT_Emissao, expira_em: c.DT_Expira };
}

function emitirCodigoOrgao(conta, entrada) {
  const hospital = entrada && typeof entrada.hospital === 'string' ? entrada.hospital.trim() : '';
  if (!hospital) throw new ErroApi(400, 'Informe o hospital que fará o transporte.', ['hospital é obrigatório.']);
  const db = abrir();
  try {
    if (!db.prepare("SELECT 1 FROM tbl_local WHERE TP_Local = 'hospital' AND NM_Local = ?").get(hospital)) throw new ErroApi(400, 'Hospital fora da rede piloto.');
    // Sem letras ambíguas (O/0, I/1) para ditar por telefone
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo;
    do {
      codigo = 'ORG-' + Array.from(crypto.randomBytes(6), (b) => alfabeto[b % alfabeto.length]).join('');
    } while (db.prepare('SELECT 1 FROM tbl_codigo_orgao WHERE CD_Codigo = ?').get(codigo));
    db.prepare("INSERT INTO tbl_codigo_orgao (CD_Codigo, NM_Hospital, ID_Emissor, ST_Codigo, DT_Emissao, DT_Expira) VALUES (?, ?, ?, 'ativo', ?, ?)")
      .run(codigo, hospital, conta.id, new Date().toISOString(), dataMais(HORAS_CODIGO_ORGAO * 36e5));
    return codigoOrgaoJson(db.prepare('SELECT * FROM tbl_codigo_orgao WHERE CD_Codigo = ?').get(codigo));
  } finally { db.close(); }
}

function listarCodigosOrgao() {
  const db = abrir();
  try {
    return db.prepare('SELECT * FROM tbl_codigo_orgao ORDER BY DT_Emissao DESC LIMIT 50').all().map(codigoOrgaoJson);
  } finally { db.close(); }
}

/* Confere o código dentro da transação do pedido e o consome. */
function consumirCodigoOrgao(db, codigo, hospital, pedido) {
  const c = db.prepare('SELECT * FROM tbl_codigo_orgao WHERE CD_Codigo = ?').get(String(codigo || '').trim().toUpperCase());
  if (!c) throw new ErroApi(403, 'Código de autorização do órgão inválido.', ['Peça à Central SADEC um código para este transporte.']);
  if (c.ST_Codigo !== 'ativo') throw new ErroApi(403, 'Este código já foi usado no pedido ' + c.CD_Rastreio + '.', ['Cada código vale para um único transporte.']);
  if (c.DT_Expira < new Date().toISOString()) throw new ErroApi(403, 'Este código expirou. Peça um novo à Central.');
  if (hospital && c.NM_Hospital !== hospital) throw new ErroApi(403, 'Este código foi emitido para outro hospital (' + c.NM_Hospital + ').');
  const r = db.prepare("UPDATE tbl_codigo_orgao SET ST_Codigo = 'usado', CD_Rastreio = ? WHERE CD_Codigo = ? AND ST_Codigo = 'ativo'").run(pedido, c.CD_Codigo);
  if (r.changes !== 1) throw new ErroApi(409, 'O código acabou de ser usado em outro pedido.');
  return c;
}

/* ---------- casos de uso ---------- */
function criarPedido(entrada, conta) {
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
  if (conta && !SOLICITANTE_DO_PERFIL[conta.perfil].includes(sol.tipo)) {
    throw new ErroApi(403, 'A conta "' + conta.perfil + '" não pode pedir como "' + sol.tipo + '".');
  }
  // Acesso por perfil: órgão (P1) só com cadastro médico autorizado; socorro (P2) só com conta do governo.
  // Sem conta: 401 (entrar). Conta de outro perfil: 403 (a sessão continua válida).
  const exigir = (perfis, msg) => {
    if (!conta) throw new ErroApi(401, msg);
    if (!perfis.includes(conta.perfil)) throw new ErroApi(403, msg);
  };
  if (prioridade === 1) {
    exigir(['unidade_saude', 'operador'], 'Transporte de órgão exige uma conta de unidade de saúde (cadastro médico autorizado).');
    if (!e.codigo_orgao) throw new ErroApi(403, 'Informe o código de autorização do órgão emitido pela Central.', ['Cada transporte de órgão tem um código de uso único.']);
  }
  if (prioridade === 2) exigir(['governo', 'operador'], 'Envio de socorro exige uma conta do governo (Defesa Civil ou município).');
  const db = abrir();
  try {
    const local = db.prepare('SELECT NM_Local, NR_Distancia_Km FROM tbl_local WHERE NM_Local = ?').get(e.destino.trim());
    if (!local) throw new ErroApi(400, 'Destino fora da rede piloto.', ['Consulte os ' + db.prepare('SELECT count(*) AS n FROM tbl_local').get().n + ' destinos em GET /api/locais.']);

    // 2. Python: distância da rota e bateria necessária com reserva de 30% (referência: maior autonomia da frota)
    const ref = db.prepare('SELECT MAX(NR_Autonomia_Km) AS a FROM tbl_drone').get();
    const calculo = python({ operacao: 'calcular_rota', distancia_km: local.NR_Distancia_Km, autonomia_km: ref.a });
    if (!calculo.ok) throw new ErroApi(422, 'Python recusou o cálculo.', calculo.erros);

    return transacao(db, () => {
      const codigo = proximoCodigo(db);
      db.prepare(`INSERT INTO tbl_entrega (CD_Rastreio, NR_Chat, NM_Destino, TP_Carga, NR_Prioridade, ST_Status, DS_Periodo, DT_Pedido,
        NM_Origem, NR_Distancia_Km, NR_Peso_Kg, DS_Solicitante, NR_Usuario) VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, ?, ?, ?, ?, ?)`)
        .run(codigo, e.chat || null, local.NM_Local, e.tipo_carga, prioridade, e.periodo || 'agora', agora(),
          e.origem || null, local.NR_Distancia_Km, e.peso_kg || null, sol.tipo + (sol.nome ? ': ' + sol.nome : ''), conta ? conta.id : null);
      evento(db, codigo, null, null, 'aguardando', 'Pedido registrado (' + (e.canal || 'site') + '). Bateria de referência pelo Python: ' + calculo.bateria_necessaria_pct + '%.', sol.nome || sol.tipo);
      if (prioridade === 1) {
        const c = consumirCodigoOrgao(db, e.codigo_orgao, conta.perfil === 'unidade_saude' ? conta.instituicao : null, codigo);
        evento(db, codigo, null, 'aguardando', 'aguardando', 'Código de autorização ' + c.CD_Codigo + ' (emitido para ' + c.NM_Hospital + ') validado e consumido.', 'Central SADEC');
      }
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
  p.rota = rotaDoPedido(db, l);
  Object.assign(p, saidaDoPedido(db, l, ultimasSaidas(db)));
  return p;
}

/* Pontos reais do trajeto para o mapa: filial do drone, retirada (se for um local da rede) e destino. */
function rotaDoPedido(db, l) {
  const ponto = (nome, tipo, lat, lon, endereco) => (typeof lat !== 'number' ? null : { nome, tipo, lat, lon, endereco: endereco || null });
  const local = (nome) => db.prepare('SELECT * FROM tbl_local WHERE NM_Local = ?').get(nome || '');
  const f = l.CD_Drone
    ? db.prepare('SELECT f.* FROM tbl_drone d JOIN tbl_filial f ON f.ID_Filial = d.ID_Filial WHERE d.CD_Drone = ?').get(l.CD_Drone)
    : db.prepare('SELECT * FROM tbl_filial ORDER BY ID_Filial LIMIT 1').get();
  const o = local(l.NM_Origem);
  const d = local(l.NM_Destino);
  return [
    f && ponto(f.NM_Filial, 'filial', f.NR_Latitude, f.NR_Longitude, f.NM_Bairro),
    o && ponto(o.NM_Local, 'retirada', o.NR_Latitude, o.NR_Longitude, o.DS_Endereco),
    d && ponto(d.NM_Local, 'destino', d.NR_Latitude, d.NR_Longitude, d.DS_Endereco)
  ].filter(Boolean);
}

function meusPedidos(conta) {
  const db = abrir();
  try {
    saidasAutomaticas(db);
    return db.prepare('SELECT * FROM tbl_entrega WHERE NR_Usuario = ? ORDER BY ID_Entrega DESC').all(conta.id).map(pedidoJson);
  } finally { db.close(); }
}

function obterPedido(codigo) {
  const db = abrir();
  try {
    saidasAutomaticas(db);
    const p = obterPedidoDb(db, codigo);
    if (!p) throw new ErroApi(404, 'Pedido ' + codigo + ' não encontrado.');
    return p;
  } finally { db.close(); }
}

/* Horário da última decolagem de cada pedido (base da posição estimada no mapa). */
function decolagens(db) {
  return new Map(db.prepare("SELECT CD_Rastreio, MAX(DT_Evento) AS t FROM tbl_evento WHERE ST_Novo = 'em_voo' GROUP BY CD_Rastreio").all().map((r) => [r.CD_Rastreio, r.t]));
}

function listarPedidos() {
  const db = abrir();
  try {
    saidasAutomaticas(db);
    const dec = decolagens(db);
    const ultima = ultimasSaidas(db);
    return db.prepare('SELECT * FROM tbl_entrega ORDER BY NR_Prioridade, ID_Entrega').all().map((l) => Object.assign(pedidoJson(l), {
      rota: l.ST_Status === 'entregue' ? [] : rotaDoPedido(db, l), decolou_em: dec.get(l.CD_Rastreio) || null
    }, saidaDoPedido(db, l, ultima)));
  } finally { db.close(); }
}

/* Decolar e concluir: a Central (operador) sempre pode. O dono de um pedido comercial (P4) também:
   a loja libera a decolagem quando o pedido fica pronto e o cliente confirma que recebeu,
   mas só depois da chegada prevista (velocidade de referência de cruzeiro). */
const VELOCIDADE_KMH = 48;
/* Demonstração: o relógio da operação corre 12× (1 min = 5 s reais). Distância, consumo e minutos
   exibidos continuam realistas; só a espera real encolhe. */
const ESCALA_TEMPO = 12;
const INTERVALO_SAIDA_MIN = 5; // intervalo mínimo entre saídas da mesma filial (minutos da operação)
const INTERVALO_SAIDA_MS = INTERVALO_SAIDA_MIN * 60000 / ESCALA_TEMPO;
const PREPARO_MAX_MIN = 15; // pedido comercial: se a loja não liberar antes, sai sozinho após o preparo máximo
const msDe = (dt) => new Date(String(dt).replace(' ', 'T')).getTime();

/* Decolagem manual só para P1 (órgão) e para o P2 que tirou o drone de um pedido comercial;
   P2 comum e P3 saem sozinhos; P4 sai quando a loja termina o preparo (ou após o preparo máximo).
   Toda saída automática respeita o intervalo entre saídas da filial. */
function decolagemManual(db, l) {
  if (l.NR_Prioridade === 1) return true;
  return l.NR_Prioridade === 2 && Boolean(db.prepare("SELECT 1 FROM tbl_evento WHERE ST_Novo = 'reagendada' AND DS_Evento LIKE ?").get('%ao pedido ' + l.CD_Rastreio + ' %'));
}

function ultimasSaidas(db) {
  return new Map(db.prepare("SELECT d.ID_Filial AS f, MAX(ev.DT_Evento) AS t FROM tbl_evento ev JOIN tbl_drone d ON d.CD_Drone = ev.CD_Drone WHERE ev.ST_Novo = 'em_voo' GROUP BY d.ID_Filial").all()
    .map((r) => [r.f, msDe(r.t)]));
}

/* Avança o relógio: decola, por prioridade, os pedidos automáticos cuja filial já cumpriu o intervalo. */
function saidasAutomaticas(db) {
  transacao(db, () => {
    const ultima = ultimasSaidas(db);
    const reservadoEm = (cod) => msDe(db.prepare("SELECT MAX(DT_Evento) AS t FROM tbl_evento WHERE CD_Rastreio = ? AND ST_Novo = 'atribuida'").get(cod).t);
    const prontos = db.prepare("SELECT e.*, d.ID_Filial FROM tbl_entrega e JOIN tbl_drone d ON d.CD_Drone = e.CD_Drone WHERE e.ST_Status = 'atribuida' ORDER BY e.NR_Prioridade, e.ID_Entrega").all();
    for (const l of prontos) {
      if (decolagemManual(db, l) || Date.now() - (ultima.get(l.ID_Filial) || 0) < INTERVALO_SAIDA_MS) continue;
      if (l.NR_Prioridade === 4 && !(Date.now() - reservadoEm(l.CD_Rastreio) >= PREPARO_MAX_MIN * 60000 / ESCALA_TEMPO)) continue;
      mudarPedidoDb(db, l.CD_Rastreio, ...DECOLAR, 'Saída automática (intervalo de ' + INTERVALO_SAIDA_MIN + ' min entre saídas da filial).', 'Central SADEC');
      ultima.set(l.ID_Filial, Date.now());
    }
  });
}

/* Relógio do servidor: aplica as saídas automáticas mesmo sem nenhuma página aberta.
   Idempotente: cada saída roda em transação e só muda pedidos ainda 'atribuida'. */
function avancarSaidas() {
  const db = abrir();
  try { saidasAutomaticas(db); } finally { db.close(); }
}

/* Como cada pedido reservado sai: manual (botão) ou automático, com o horário real previsto da saída. */
function saidaDoPedido(db, l, ultima) {
  if (l.ST_Status !== 'atribuida' || !l.CD_Drone) return {};
  if (decolagemManual(db, l)) return { decolagem_manual: true };
  const d = db.prepare('SELECT ID_Filial FROM tbl_drone WHERE CD_Drone = ?').get(l.CD_Drone);
  return { decolagem_manual: false, saida_em: (ultima.get(d && d.ID_Filial) || 0) + INTERVALO_SAIDA_MS };
}
function responsavelDaAcao(autorizacao, codigo, acao) {
  const conta = exigirConta(autorizacao);
  if (conta.perfil === 'operador') return conta.nome;
  const db = abrir();
  try {
    const l = db.prepare('SELECT * FROM tbl_entrega WHERE CD_Rastreio = ?').get(String(codigo || '').toUpperCase());
    if (!l) throw new ErroApi(404, 'Pedido ' + codigo + ' não encontrado.');
    if (l.NR_Usuario !== conta.id || l.NR_Prioridade !== 4) throw new ErroApi(403, 'Só a Central ou o dono do pedido comercial pode fazer esta ação.');
    if (acao === 'decolar') {
      const d = db.prepare('SELECT ID_Filial FROM tbl_drone WHERE CD_Drone = ?').get(l.CD_Drone || '');
      const falta = d ? (ultimasSaidas(db).get(d.ID_Filial) || 0) + INTERVALO_SAIDA_MS - Date.now() : 0;
      if (falta > 0) throw new ErroApi(409, 'A filial respeita ' + INTERVALO_SAIDA_MIN + ' min entre saídas. Próxima saída em ' + Math.ceil(falta * ESCALA_TEMPO / 60000) + ' min.');
      return 'Loja parceira (pedido de ' + conta.nome + ')';
    }
    const dec = decolagens(db).get(l.CD_Rastreio);
    const chegada = dec ? new Date(dec.replace(' ', 'T')).getTime() + (l.NR_Distancia_Km || 0) / VELOCIDADE_KMH * 3600000 / ESCALA_TEMPO : 0;
    if (l.ST_Status === 'em_voo' && Date.now() < chegada) {
      throw new ErroApi(409, 'O drone ainda está a caminho. Confirme o recebimento depois da chegada prevista.');
    }
    return conta.nome + ' (cliente)';
  } finally { db.close(); }
}

function listarLocais() {
  const db = abrir();
  try {
    const locais = db.prepare('SELECT * FROM tbl_local ORDER BY TP_Local, NM_Local').all()
      .map((l) => ({ nome: l.NM_Local, tipo: l.TP_Local, distancia_km: l.NR_Distancia_Km, lat: l.NR_Latitude, lon: l.NR_Longitude, endereco: l.DS_Endereco || null, fonte: l.DS_Fonte || null }));
    const filiais = db.prepare('SELECT * FROM tbl_filial ORDER BY ID_Filial').all()
      .map((f) => ({ nome: f.NM_Filial, tipo: 'filial', bairro: f.NM_Bairro, lat: f.NR_Latitude, lon: f.NR_Longitude }));
    return locais.concat(filiais);
  } finally { db.close(); }
}

/* Histórico recente de todos os pedidos e drones (mais recente primeiro), para o painel da Central. */
function listarEventos() {
  const db = abrir();
  try {
    return db.prepare('SELECT * FROM tbl_evento ORDER BY ID_Evento DESC LIMIT 40').all().map(eventoJson);
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
    return transacao(db, () => mudarPedidoDb(db, codigo, de, para, droneDe, dronePara, descricao, responsavel, extra));
  } finally { db.close(); }
}

function mudarPedidoDb(db, codigo, de, para, droneDe, dronePara, descricao, responsavel, extra) {
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
}

/* Só aqui o pedido entra em voo: a atribuição não marca em_voo. */
const DECOLAR = [['atribuida'], 'em_voo', ['atribuido', 'aguardando_comercial'], (l) => (l.NR_Prioridade === 4 ? 'em_voo_comercial' : 'em_voo')];
function decolar(codigo, responsavel) {
  return mudarPedido(codigo, ...DECOLAR, 'Decolagem autorizada.', responsavel || 'Operador da Central');
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
  criarPedido, obterPedido, listarPedidos, listarDrones, listarLocais, listarEventos, processarFila,
  decolar, concluirEntrega, registrarRecebimento, recuperarDrone, responsavelDaAcao, VELOCIDADE_KMH, ESCALA_TEMPO, INTERVALO_SAIDA_MS, avancarSaidas,
  criarConta, entrar, sair, contaDaSessao, exigirConta, meusPedidos, emitirCodigoOrgao, listarCodigosOrgao
};
