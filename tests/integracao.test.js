// Integração Python + Java + SQLite pelo módulo da API do Node-RED (node --test).
// Usa uma CÓPIA do banco; o banco do projeto não é alterado. Pula se Python ou Java não estiverem disponíveis.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const copia = path.join(os.tmpdir(), 'sadec_integracao_' + process.pid + '.db');
fs.copyFileSync(path.join(RAIZ, 'ChatBot', 'SADEC_Chatbot.db'), copia);
process.env.SADEC_DB = copia;

function disponivel(cmd, args) {
  try { execFileSync(cmd, args, { stdio: 'ignore', timeout: 15000 }); return true; } catch { return false; }
}
const pyOk = disponivel(process.env.SADEC_PYTHON || 'python', ['-c', 'print(1)']);
const javaOk = fs.existsSync(path.join(RAIZ, 'Java', 'SADEC', 'out', 'br', 'com', 'fiap', 'sadec', 'integracao', 'IntegracaoCLI.class'))
  && disponivel(process.env.SADEC_JAVA || 'java', ['-version']);
const pular = !(pyOk && javaOk) && 'Python ou Java indisponível (defina SADEC_PYTHON/SADEC_JAVA e compile o Java)';

const api = require('../ChatBot/node-red/lib/sadec-api.js');
const hospital = { tipo: 'hospital', nome: 'Hospital das Clínicas (simulação)' };
// Contas de demonstração criadas pela migração 002 (senha documentada no README)
const sessao = (email) => api.contaDaSessao('Bearer ' + api.entrar({ email, senha: 'sadec2026' }).token);
const codigoPara = (hospitalNome) => api.emitirCodigoOrgao(sessao('operador@sadec.demo'), { hospital: hospitalNome }).codigo;

// cada teste parte do banco demonstrativo original
test.beforeEach(() => fs.copyFileSync(path.join(RAIZ, 'ChatBot', 'SADEC_Chatbot.db'), copia));
test.after(() => { try { fs.unlinkSync(copia); } catch { /* arquivo temporário */ } });

test('P1 pedido pelo chatbot público é recusado (sem autorização)', { skip: pular }, () => {
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: { tipo: 'cidadao' }, canal: 'chatbot' }),
    (e) => e.status === 403);
});

test('P1 sem conta ou sem código da Central é recusado', { skip: pular }, () => {
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital }), (e) => e.status === 401);
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital }, sessao('hospital@sadec.demo')), (e) => e.status === 403);
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital, codigo_orgao: 'ORG-XXXXXX' }, sessao('hospital@sadec.demo')), (e) => e.status === 403);
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: { tipo: 'cliente' }, codigo_orgao: codigoPara('Hospital das Clínicas') }, sessao('cliente@sadec.demo')), (e) => e.status === 403);
});

test('código de órgão vale para um hospital e um único transporte', { skip: pular }, () => {
  const conta = sessao('hospital@sadec.demo');
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital, codigo_orgao: codigoPara('Santa Casa') }, conta), (e) => e.status === 403);
  const codigo = codigoPara('Hospital das Clínicas');
  const r = api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital, codigo_orgao: codigo }, conta);
  assert.equal(api.listarCodigosOrgao().find((c) => c.codigo === codigo).pedido_codigo, r.pedido.codigo);
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital, codigo_orgao: codigo }, conta), (e) => e.status === 403);
  assert.deepEqual(api.meusPedidos(conta).map((p) => p.codigo), [r.pedido.codigo]);
});

test('contas: cadastro, login, sessão, perfis e saída', { skip: pular }, () => {
  const c = api.criarConta({ nome: 'Ana (fictícia)', email: 'Ana@Exemplo.com', senha: 'senha-forte-1', perfil: 'cliente' });
  assert.equal(c.email, 'ana@exemplo.com');
  assert.throws(() => api.criarConta({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-forte-1', perfil: 'cliente' }), (e) => e.status === 409);
  assert.throws(() => api.criarConta({ nome: 'X', email: 'x@exemplo.com', senha: 'senha-forte-1', perfil: 'operador' }), (e) => e.status === 400);
  assert.throws(() => api.criarConta({ nome: 'Hosp', email: 'h@exemplo.com', senha: 'senha-forte-1', perfil: 'unidade_saude', instituicao: 'Hospital Inventado' }), (e) => e.status === 400);
  assert.throws(() => api.entrar({ email: 'ana@exemplo.com', senha: 'errada123' }), (e) => e.status === 401);
  assert.throws(() => api.entrar({ email: 'ana@exemplo.com', senha: 'senha-forte-1', perfil: 'operador' }), (e) => e.status === 403);
  const s = api.entrar({ email: 'ana@exemplo.com', senha: 'senha-forte-1', manter: true });
  assert.match(s.token, /^[a-f0-9]{64}$/);
  assert.equal(api.contaDaSessao('Bearer ' + s.token).nome, 'Ana (fictícia)');
  assert.equal(api.contaDaSessao(''), null);
  assert.throws(() => api.exigirConta('Bearer ' + s.token, ['operador']), (e) => e.status === 403);
  api.sair('Bearer ' + s.token);
  assert.throws(() => api.contaDaSessao('Bearer ' + s.token), (e) => e.status === 401);
});

test('locais trazem os hospitais do CNES com coordenadas e o pedido traz a rota real', { skip: pular }, () => {
  const locais = api.listarLocais();
  assert.ok(locais.filter((l) => l.tipo === 'hospital').length >= 180);
  assert.ok(locais.every((l) => typeof l.lat === 'number' && typeof l.lon === 'number'));
  const r = api.criarPedido({ tipo_carga: 'remedio', destino: 'Mooca', solicitante: { tipo: 'cidadao' } });
  assert.deepEqual(r.pedido.rota.map((p) => p.tipo), ['filial', 'destino']);
});

test('P1 de hospital: Python calcula, Java atribui, SQLite guarda com código SD e evento', { skip: pular }, () => {
  const r = api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', origem: 'Hospital das Clínicas', solicitante: hospital, codigo_orgao: codigoPara('Hospital das Clínicas') }, sessao('hospital@sadec.demo'));
  assert.match(r.pedido.codigo, /^SD\d{4}$/);
  assert.equal(r.calculo_python.ok, true);
  assert.equal(r.calculo_python.reserva_pct, 30);
  assert.equal(r.pedido.status, 'atribuida', 'não entra em voo antes da decolagem');
  assert.ok(r.pedido.drone_codigo);
  assert.ok(r.pedido.eventos.length >= 2);
});

test('P1 usa drone comercial que ainda não decolou e a entrega comercial é reagendada', { skip: pular }, () => {
  // Hospital São Paulo: 8 km, ida e volta 16 km × 1,3 = 20,8 km. DR-04 (30% de 40 km = 12 km) não alcança;
  // DR-01 (livre) é ocupado antes; resta DR-02, reservado para SD1002 (P4) que ainda não decolou.
  api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital, codigo_orgao: codigoPara('Hospital das Clínicas') }, sessao('hospital@sadec.demo'));
  const r = api.criarPedido({ tipo_carga: 'orgao', destino: 'Hospital São Paulo', solicitante: { tipo: 'central_transplantes' }, codigo_orgao: codigoPara('InCor') }, sessao('operador@sadec.demo'));
  assert.equal(r.pedido.drone_codigo, 'DR-02');
  assert.deepEqual(r.decisao_java.reagendadas, ['SD1002']);
  assert.equal(api.obterPedido('SD1002').status, 'reagendada');
});

test('acesso por perfil: órgão só com cadastro médico, socorro só com conta do governo; admin tem acesso total', { skip: pular }, () => {
  const kit = { tipo_carga: 'kit_emergencia', destino: 'Mooca', solicitante: { tipo: 'defesa_civil' } };
  assert.throws(() => api.criarPedido(kit, sessao('cliente@sadec.demo')), (e) => e.status === 403);
  assert.throws(() => api.criarPedido(kit, sessao('hospital@sadec.demo')), (e) => e.status === 403);
  assert.equal(api.criarPedido(kit, sessao('governo@sadec.demo')).pedido.prioridade, 2);
  const orgao = { tipo_carga: 'orgao', destino: 'InCor', solicitante: { tipo: 'central_transplantes' }, codigo_orgao: codigoPara('InCor') };
  assert.throws(() => api.criarPedido(orgao, sessao('governo@sadec.demo')), (e) => e.status === 403);
  assert.throws(() => api.criarPedido(orgao, sessao('cliente@sadec.demo')), (e) => e.status === 403);
  // administrador: senha própria, entra por qualquer aba e pode tudo
  assert.throws(() => api.entrar({ email: 'admin@sadec.demo', senha: 'sadec2026' }), (e) => e.status === 401);
  const adm = api.entrar({ email: 'admin@sadec.demo', senha: '121365', perfil: 'cliente' });
  assert.equal(adm.conta.perfil, 'operador');
  assert.equal(api.criarPedido(kit, api.contaDaSessao('Bearer ' + adm.token)).pedido.prioridade, 2);
  // governo não entra pela aba de cliente
  assert.throws(() => api.entrar({ email: 'governo@sadec.demo', senha: 'sadec2026', perfil: 'cliente' }), (e) => e.status === 403);
});

test('drone em voo comercial (DR-03) e em voo (DR-06) nunca são realocados; sem drone vai para outro meio', { skip: pular }, () => {
  assert.throws(() => api.criarPedido({ tipo_carga: 'kit_emergencia', destino: 'Parelheiros', solicitante: { tipo: 'defesa_civil' } }), (e) => e.status === 401);
  const r = api.criarPedido({ tipo_carga: 'kit_emergencia', destino: 'Parelheiros', solicitante: { tipo: 'defesa_civil' } }, sessao('operador@sadec.demo'));
  assert.equal(r.pedido.status, 'outro_meio');
  assert.ok(r.pedido.motivo);
  const drones = api.listarDrones();
  assert.equal(drones.find((d) => d.codigo === 'DR-03').status, 'em_voo_comercial');
  assert.equal(drones.find((d) => d.codigo === 'DR-06').status, 'em_voo');
});

test('drone aguardando liberação não é despachado; liberação prematura é recusada; liberação manual devolve à frota', { skip: pular }, () => {
  assert.throws(() => api.recuperarDrone('DR-05', 'liberar'), (e) => e.status === 409);
  assert.equal(api.recuperarDrone('DR-05', 'concluir_manutencao').status, 'aguardando_liberacao');
  const r = api.criarPedido({ tipo_carga: 'remedio', destino: 'Centro', solicitante: { tipo: 'cidadao' } });
  assert.notEqual(r.pedido.drone_codigo, 'DR-05');
  assert.equal(api.listarDrones().find((d) => d.codigo === 'DR-05').status, 'aguardando_liberacao', 'sem volta automática');
  assert.equal(api.recuperarDrone('DR-05', 'liberar').status, 'livre');
});

test('P4 comercial de cliente e P3 de cidadão entram pela mesma API', { skip: pular }, () => {
  const p4 = api.criarPedido({ tipo_carga: 'encomenda', destino: 'Mooca', solicitante: { tipo: 'cliente' }, peso_kg: 1.2 });
  assert.equal(p4.pedido.prioridade, 4);
  assert.throws(() => api.criarPedido({ tipo_carga: 'encomenda', destino: 'Lua', solicitante: { tipo: 'cliente' } }), (e) => e.status === 400);
});

test('dono do pedido comercial libera a decolagem e só confirma o recebimento depois da chegada prevista', { skip: pular }, () => {
  const token = 'Bearer ' + api.entrar({ email: 'cliente@sadec.demo', senha: 'sadec2026' }).token;
  const r = api.criarPedido({ tipo_carga: 'encomenda', destino: 'Mooca', origem: 'Burger House', solicitante: { tipo: 'cliente' }, peso_kg: 1 }, api.contaDaSessao(token));
  const cod = r.pedido.codigo;
  const lista = api.listarPedidos().find((p) => p.codigo === cod);
  assert.ok(lista.rota.some((q) => q.tipo === 'destino'));
  assert.equal(lista.decolou_em, null);
  assert.throws(() => api.responsavelDaAcao(null, cod, 'decolar'), (e) => e.status === 401);
  const outro = 'Bearer ' + api.entrar({ email: 'hospital@sadec.demo', senha: 'sadec2026' }).token;
  assert.throws(() => api.responsavelDaAcao(outro, cod, 'decolar'), (e) => e.status === 403);
  assert.match(api.responsavelDaAcao(token, cod, 'decolar'), /Loja parceira/);
  api.decolar(cod, api.responsavelDaAcao(token, cod, 'decolar'));
  assert.ok(api.listarPedidos().find((p) => p.codigo === cod).decolou_em);
  const ultimo = api.listarEventos()[0];
  assert.equal(ultimo.pedido_codigo, cod);
  assert.match(ultimo.responsavel, /Loja parceira/);
  // recém-decolado: a chegada prevista ainda não passou
  assert.throws(() => api.responsavelDaAcao(token, cod, 'concluir'), (e) => e.status === 409);
  assert.equal(api.responsavelDaAcao('Bearer ' + api.entrar({ email: 'operador@sadec.demo', senha: 'sadec2026' }).token, cod, 'concluir'), 'Operador da Central (demonstração)');
});

test('decolagem, entrega e recebimento com responsável, destinatário e estado ficam no histórico', { skip: pular }, () => {
  const r = api.criarPedido({ tipo_carga: 'remedio', destino: 'Mooca', solicitante: { tipo: 'farmacia', nome: 'Farmácia (fictícia)' } });
  const cod = r.pedido.codigo;
  assert.equal(r.pedido.status, 'atribuida');
  assert.throws(() => api.registrarRecebimento(cod, { responsavel: 'a', destinatario: 'b', estado_carga: 'integra' }), (e) => e.status === 409);
  assert.equal(api.decolar(cod).status, 'em_voo');
  assert.equal(api.concluirEntrega(cod).status, 'entregue');
  assert.throws(() => api.registrarRecebimento(cod, { responsavel: '', destinatario: 'b', estado_carga: 'integra' }), (e) => e.status === 400);
  const fim = api.registrarRecebimento(cod, { responsavel: 'Operador (fictício)', destinatario: 'Morador (fictício)', estado_carga: 'integra' });
  assert.equal(fim.recebimento.estado_carga, 'integra');
  assert.equal(fim.recebimento.destinatario, 'Morador (fictício)');
  const status = fim.eventos.map((e) => e.status_novo);
  assert.deepEqual(status.slice(0, 4), ['aguardando', 'atribuida', 'em_voo', 'entregue']);
  assert.equal(api.listarDrones().find((d) => d.codigo === r.pedido.drone_codigo).status, 'livre');
});

test('processar fila usa a ordem da Java e despacha os pendentes', { skip: pular }, () => {
  const fila = api.processarFila();
  assert.ok(Array.isArray(fila.processados));
  assert.ok(fila.processados.length >= 1, 'há pedidos aguardando no banco demonstrativo');
});

test('saídas: P3 sai sozinho, a filial respeita 5 min (tempo da operação) entre saídas e P1 espera o operador', { skip: pular }, () => {
  const p3 = api.criarPedido({ tipo_carga: 'remedio', destino: 'Mooca', solicitante: { tipo: 'cidadao' } });
  assert.equal(p3.pedido.decolagem_manual, false);
  const remedio = api.listarPedidos().find((p) => p.codigo === p3.pedido.codigo);
  assert.equal(remedio.status, 'em_voo', 'P3 decola sozinho');
  assert.match(api.obterPedido(remedio.codigo).eventos.pop().descricao, /Saída automática/);
  // a mesma filial só libera a próxima saída automática depois do intervalo
  const outro = api.criarPedido({ tipo_carga: 'remedio', destino: 'Mooca', solicitante: { tipo: 'cidadao' } }).pedido;
  if (outro.status === 'atribuida') {
    const p = api.listarPedidos().find((x) => x.codigo === outro.codigo);
    if (p.status === 'atribuida') assert.ok(p.saida_em > Date.now());
  }
  const p1 = api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', origem: 'Hospital das Clínicas', solicitante: hospital, codigo_orgao: codigoPara('Hospital das Clínicas') }, sessao('hospital@sadec.demo'));
  const orgao = api.listarPedidos().find((p) => p.codigo === p1.pedido.codigo);
  if (orgao.drone_codigo) {
    assert.equal(orgao.status, 'atribuida', 'órgão nunca decola sozinho');
    assert.equal(orgao.decolagem_manual, true);
  }
  assert.equal(api.ESCALA_TEMPO, 12, '1 min da operação = 5 s reais');
  assert.equal(api.INTERVALO_SAIDA_MS, 25000);
});
