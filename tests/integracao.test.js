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

// cada teste parte do banco demonstrativo original
test.beforeEach(() => fs.copyFileSync(path.join(RAIZ, 'ChatBot', 'SADEC_Chatbot.db'), copia));
test.after(() => { try { fs.unlinkSync(copia); } catch { /* arquivo temporário */ } });

test('P1 pedido pelo chatbot público é recusado (sem autorização)', { skip: pular }, () => {
  assert.throws(() => api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: { tipo: 'cidadao' }, canal: 'chatbot' }),
    (e) => e.status === 403);
});

test('P1 de hospital: Python calcula, Java atribui, SQLite guarda com código SD e evento', { skip: pular }, () => {
  const r = api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', origem: 'Hospital das Clínicas', solicitante: hospital });
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
  api.criarPedido({ tipo_carga: 'orgao', destino: 'InCor', solicitante: hospital });
  const r = api.criarPedido({ tipo_carga: 'orgao', destino: 'Hospital São Paulo', solicitante: { tipo: 'central_transplantes' } });
  assert.equal(r.pedido.drone_codigo, 'DR-02');
  assert.deepEqual(r.decisao_java.reagendadas, ['SD1002']);
  assert.equal(api.obterPedido('SD1002').status, 'reagendada');
});

test('drone em voo comercial (DR-03) e em voo (DR-06) nunca são realocados; sem drone vai para outro meio', { skip: pular }, () => {
  const r = api.criarPedido({ tipo_carga: 'kit_emergencia', destino: 'Parelheiros', solicitante: { tipo: 'defesa_civil' } });
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
