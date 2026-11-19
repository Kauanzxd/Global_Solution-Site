// Testes das regras da central SIDEC (node --test). Estados sintéticos, independentes por teste.
const test = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../js/operations.js');

// Geometria: drone em (0,0) -> origem L-1 (2,0) -> destino L-2 (6,0) = 6 km. Consumo 5%/km = 30% base.
function makeState(over = {}) {
  return {
    seq: 10,
    log: [],
    filiais: [{ id: 'F-A', nome: 'Base A', x: 0, y: 0 }, { id: 'F-B', nome: 'Base B', x: 10, y: 0 }],
    locais: [
      { id: 'L-1', nome: 'Hospital 1', tipo: 'hospital', x: 2, y: 0 },
      { id: 'L-2', nome: 'Bairro 2', tipo: 'bairro', x: 6, y: 0 }
    ],
    zonas: [{ id: 'Z-1', nome: 'Zona 1', x: 4, y: 1 }, { id: 'Z-2', nome: 'Zona 2', x: 4, y: 6 }],
    drones: [],
    entregas: [],
    ...over
  };
}
const drone = (id, o = {}) => ({ id, nome: id, filialId: 'F-A', x: 0, y: 0, bateria: 100, consumoKm: 5, cargaMaxKg: 5, status: 'disponivel', entregaId: null, ...o });
const entrega = (id, o = {}) => ({ id, prioridade: 3, carga: 'carga', pesoKg: 1, origemId: 'L-1', destinoId: 'L-2', status: 'fila', droneId: null, ordem: 1, ...o });
const byId = (list, id) => list.find((x) => x.id === id);

test('fila ordena por prioridade e depois por ordem de chegada, ignorando quem não está na fila', () => {
  const s = makeState({ entregas: [
    entrega('A', { prioridade: 4, ordem: 1 }), entrega('B', { prioridade: 1, ordem: 3 }),
    entrega('C', { prioridade: 3, ordem: 2 }), entrega('D', { prioridade: 1, ordem: 2 }),
    entrega('E', { prioridade: 1, ordem: 0, status: 'entregue' })
  ] });
  assert.deepEqual(ops.sortQueue(s).map((e) => e.id), ['D', 'B', 'C', 'A']);
});

test('órgão exige consumo + 30% de reserva: 38% de bateria não basta para 30% de consumo', () => {
  const s = makeState({ drones: [drone('D1', { bateria: 38 })], entregas: [entrega('O', { prioridade: 1 })] });
  const r = ops.dispatch(s, 'O');
  assert.equal(r.ok, false);
  assert.equal(byId(s.entregas, 'O').status, 'outro_meio');
  assert.equal(byId(s.drones, 'D1').status, 'disponivel');
});

test('órgão é liberado quando a bateria cobre consumo × 1,3 (39%)', () => {
  const s = makeState({ drones: [drone('D1', { bateria: 39 })], entregas: [entrega('O', { prioridade: 1 })] });
  const a = ops.checkAutonomy(s, s.drones[0], s.entregas[0]);
  assert.equal(a.km, 6);
  assert.equal(a.necessario, 39);
  assert.equal(ops.dispatch(s, 'O').ok, true);
  assert.equal(byId(s.drones, 'D1').status, 'atribuido');
});

test('saúde (P3) usa reserva menor: 36% cobre 30% + 15%', () => {
  const s = makeState({ drones: [drone('D1', { bateria: 36 })], entregas: [entrega('M')] });
  assert.equal(ops.dispatch(s, 'M').ok, true);
});

test('escolhe o drone elegível mais próximo da filial adequada; empate decide pela bateria', () => {
  const s = makeState({ drones: [drone('LONGE', { x: 10, filialId: 'F-B' }), drone('PERTO', { x: 1 }), drone('PERTO2', { x: 1, bateria: 80 })], entregas: [entrega('M')] });
  assert.equal(ops.selectDrone(s, s.entregas[0]).drone.id, 'PERTO');
});

test('carga acima do limite do drone é recusada com motivo', () => {
  const s = makeState({ drones: [drone('D1', { cargaMaxKg: 5 }), drone('D2', { cargaMaxKg: 10, x: 9 })], entregas: [entrega('M', { pesoKg: 6 })] });
  const sel = ops.selectDrone(s, s.entregas[0]);
  assert.equal(sel.drone.id, 'D2');
  assert.match(sel.rejeitados.find((r) => r.droneId === 'D1').motivo, /carga/i);
});

test('drone indisponível (manutenção ou em voo) nunca recebe missão', () => {
  const s = makeState({ drones: [drone('M1', { status: 'manutencao' }), drone('V1', { status: 'em_voo' })], entregas: [entrega('M')] });
  assert.equal(ops.selectDrone(s, s.entregas[0]).drone, null);
});

test('P1 reorganiza entrega comercial atribuída e ainda não decolada', () => {
  const s = makeState({
    drones: [drone('D1', { status: 'atribuido', entregaId: 'COM' })],
    entregas: [entrega('COM', { prioridade: 4, status: 'atribuida', droneId: 'D1', ordem: 1 }), entrega('ORG', { prioridade: 1, ordem: 2 })]
  });
  const r = ops.dispatch(s, 'ORG');
  assert.equal(r.ok, true);
  assert.equal(r.preemptedId, 'COM');
  assert.equal(byId(s.entregas, 'ORG').droneId, 'D1');
  assert.equal(byId(s.entregas, 'COM').status, 'fila');
  assert.equal(byId(s.entregas, 'COM').droneId, null);
});

test('entrega comercial já em voo não é interrompida: P1 vai para outro meio', () => {
  const s = makeState({
    drones: [drone('D1', { status: 'em_voo', entregaId: 'COM' })],
    entregas: [entrega('COM', { prioridade: 4, status: 'em_voo', droneId: 'D1' }), entrega('ORG', { prioridade: 1, ordem: 2 })]
  });
  const r = ops.dispatch(s, 'ORG');
  assert.equal(r.ok, false);
  assert.equal(byId(s.entregas, 'COM').status, 'em_voo');
  assert.equal(byId(s.entregas, 'ORG').status, 'outro_meio');
});

test('preempção só atinge comercial: P3 atribuída é preservada', () => {
  const s = makeState({
    drones: [drone('D1', { status: 'atribuido', entregaId: 'MED' })],
    entregas: [entrega('MED', { prioridade: 3, status: 'atribuida', droneId: 'D1' }), entrega('EMG', { prioridade: 2, ordem: 2 })]
  });
  assert.equal(ops.dispatch(s, 'EMG').ok, false);
  assert.equal(byId(s.entregas, 'MED').droneId, 'D1');
});

test('P4 sem drone livre continua aguardando na fila', () => {
  const s = makeState({ drones: [drone('D1', { status: 'manutencao' })], entregas: [entrega('COM', { prioridade: 4 })] });
  assert.equal(ops.dispatch(s, 'COM').ok, false);
  assert.equal(byId(s.entregas, 'COM').status, 'fila');
});

test('carga que nenhum drone da frota suporta vai para outro meio mesmo sendo P4', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('COM', { prioridade: 4, pesoKg: 50 })] });
  ops.dispatch(s, 'COM');
  assert.equal(byId(s.entregas, 'COM').status, 'outro_meio');
});

test('processar a fila com um único drone atende P1 antes de P4', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('COM', { prioridade: 4, ordem: 1 }), entrega('ORG', { prioridade: 1, ordem: 2 })] });
  ops.processQueue(s);
  assert.equal(byId(s.entregas, 'ORG').droneId, 'D1');
  assert.equal(byId(s.entregas, 'COM').status, 'fila');
});

test('decolagem e conclusão: voo termina após a duração prevista e desconta a bateria', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('M')] });
  ops.dispatch(s, 'M');
  ops.launch(s, 'M', 1000);
  assert.equal(byId(s.entregas, 'M').status, 'em_voo');
  ops.tick(s, 1000 + 6 * ops.FLIGHT_MS_PER_KM - 1);
  assert.equal(byId(s.entregas, 'M').status, 'em_voo');
  ops.tick(s, 1000 + 6 * ops.FLIGHT_MS_PER_KM);
  assert.equal(byId(s.entregas, 'M').status, 'entregue');
  const d = byId(s.drones, 'D1');
  assert.equal(d.status, 'disponivel');
  assert.equal(d.bateria, 70);
  assert.deepEqual([d.x, d.y], [6, 0]);
});

test('só decola entrega atribuída', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('M')] });
  assert.equal(ops.launch(s, 'M', 0).ok, false);
});

test('rota e zonas de pouso (N:N): só zonas no corredor da rota', () => {
  const s = makeState();
  assert.deepEqual(ops.routeLandingZones(s, 'L-1', 'L-2').map((z) => z.id), ['Z-1']);
});

test('pane de motor pousa na zona segura mais próxima, sem paraquedas, e pede resgate', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('M')] });
  ops.dispatch(s, 'M');
  ops.launch(s, 'M', 0);
  const r = ops.emergencyLanding(s, 'M', 'motor', 3 * ops.FLIGHT_MS_PER_KM);
  assert.equal(r.zona.id, 'Z-1');
  assert.equal(r.paraquedas, false);
  const e = byId(s.entregas, 'M');
  assert.equal(e.status, 'pouso_emergencia');
  assert.equal(e.evento.resgate, true);
  assert.equal(byId(s.drones, 'D1').status, 'pouso_emergencia');
});

test('falha grave aciona paraquedas no ponto atual', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('M')] });
  ops.dispatch(s, 'M');
  ops.launch(s, 'M', 0);
  const r = ops.emergencyLanding(s, 'M', 'grave', 3 * ops.FLIGHT_MS_PER_KM);
  assert.equal(r.paraquedas, true);
  assert.deepEqual([r.x, r.y], [3, 0]);
});

test('pane não se aplica a entrega que não está em voo', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('M')] });
  assert.equal(ops.emergencyLanding(s, 'M', 'motor', 0).ok, false);
});

test('temperatura fora da faixa gera alerta para a equipe médica', () => {
  const faixa = { min: 2, max: 8 };
  assert.equal(ops.checkTemperature(5, faixa).ok, true);
  assert.equal(ops.checkTemperature(9.2, faixa).ok, false);
  assert.match(ops.checkTemperature(1.5, faixa).mensagem, /equipe médica/i);
});

test('novo pedido valida prioridade e peso e recebe código sequencial', () => {
  const s = makeState();
  const e = ops.createOrder(s, { prioridade: 2, carga: 'Água', pesoKg: 3, origemId: 'L-1', destinoId: 'L-2' });
  assert.equal(e.id, 'SDC-0011');
  assert.equal(e.status, 'fila');
  assert.throws(() => ops.createOrder(s, { prioridade: 7, carga: 'x', pesoKg: 1, origemId: 'L-1', destinoId: 'L-2' }));
  assert.throws(() => ops.createOrder(s, { prioridade: 2, carga: 'x', pesoKg: 0, origemId: 'L-1', destinoId: 'L-2' }));
  assert.throws(() => ops.createOrder(s, { prioridade: 2, carga: 'x', pesoKg: 1, origemId: 'NADA', destinoId: 'L-2' }));
});

test('simulador de autonomia aplica a mesma reserva da central (órgão 30%, demais 15%)', () => {
  const orgao = ops.estimateAutonomy({ km: 10, consumoKm: 3, bateria: 39, prioridade: 1 });
  assert.equal(orgao.consumo, 30);
  assert.equal(orgao.necessario, 39);
  assert.equal(orgao.ok, true);
  assert.equal(orgao.sobra, 0);
  const curto = ops.estimateAutonomy({ km: 10, consumoKm: 3, bateria: 38.9, prioridade: 1 });
  assert.equal(curto.ok, false);
  const saude = ops.estimateAutonomy({ km: 10, consumoKm: 3, bateria: 35, prioridade: 3 });
  assert.equal(saude.necessario, 34.5);
  assert.equal(saude.ok, true);
});

test('pedido de saúde refrigerado recebe faixa térmica de 2 a 8 °C', () => {
  const s = makeState();
  const e = ops.createOrder(s, { prioridade: 3, carga: 'Insulina', pesoKg: 0.4, origemId: 'L-1', destinoId: 'L-2', termico: true });
  assert.deepEqual(e.faixaTemp, { min: 2, max: 8 });
  const comum = ops.createOrder(s, { prioridade: 3, carga: 'Losartana', pesoKg: 0.3, origemId: 'L-1', destinoId: 'L-2' });
  assert.equal(comum.faixaTemp, null);
});

test('após pouso de emergência e resgate, o drone volta à base em manutenção e, concluída a inspeção, aguarda liberação', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('M')] });
  ops.dispatch(s, 'M');
  ops.launch(s, 'M', 0);
  const pane = 3 * ops.FLIGHT_MS_PER_KM;
  ops.emergencyLanding(s, 'M', 'motor', pane);
  const d = byId(s.drones, 'D1');
  ops.tick(s, pane + ops.RESGATE_MS - 1);
  assert.equal(d.status, 'pouso_emergencia');
  ops.tick(s, pane + ops.RESGATE_MS);
  assert.equal(d.status, 'manutencao');
  assert.deepEqual([d.x, d.y], [0, 0]);
  assert.equal(byId(s.entregas, 'M').evento.resgate, false);
  ops.tick(s, pane + ops.RESGATE_MS + ops.MANUTENCAO_MS);
  assert.equal(d.status, 'aguardando_liberacao');
  assert.equal(d.entregaId, null);
});

test('drone em manutenção programada (sem prazo de retorno) continua indisponível', () => {
  const s = makeState({ drones: [drone('D1', { status: 'manutencao', bateria: 23 })] });
  ops.tick(s, 0);
  ops.tick(s, 10 * 60 * 1000);
  assert.equal(byId(s.drones, 'D1').status, 'manutencao');
});

test('drone disponível recarrega com o tempo até 100%; drone em voo não recarrega', () => {
  const s = makeState({ drones: [drone('D1', { bateria: 40 }), drone('D2', { bateria: 50, status: 'em_voo' })] });
  ops.tick(s, 0);
  ops.tick(s, 10000);
  assert.equal(byId(s.drones, 'D1').bateria, 40 + 10 * ops.RECARGA_PCT_POR_S);
  assert.equal(byId(s.drones, 'D2').bateria, 50);
  ops.tick(s, 10 * 60 * 1000);
  assert.equal(byId(s.drones, 'D1').bateria, 100);
});

test('entrega convencional é modalidade própria: não vira outro meio, não entra na fila e não recebe drone', () => {
  const s = makeState({ drones: [drone('D1')], entregas: [entrega('C', { prioridade: 4 })] });
  const r = ops.markConventional(s, 'C');
  assert.equal(r.ok, true);
  const e = byId(s.entregas, 'C');
  assert.equal(e.status, 'convencional');
  assert.equal(e.modo, 'convencional');
  assert.equal(ops.sortQueue(s).length, 0);
  assert.equal(ops.dispatch(s, 'C').ok, false);
  assert.equal(s.entregas.filter((x) => x.status === 'outro_meio').length, 0);
  assert.equal(ops.markConventional(s, 'C').ok, false);
});

test('recebimento só é registrado para entrega concluída e guarda responsável, horário, destinatário, carga e estado', () => {
  const s = makeState({ entregas: [entrega('A', { status: 'entregue', carga: 'Insulina' }), entrega('B', { status: 'em_voo' })] });
  const now = Date.UTC(2026, 10, 18, 14, 0);
  const negado = ops.registerReceipt(s, 'B', { responsavel: 'Enf. Ana', destinatario: 'UBS 2', estado: 'integra' }, now);
  assert.equal(negado.ok, false);
  assert.equal(byId(s.entregas, 'B').recebimento, undefined);

  const incompleto = ops.registerReceipt(s, 'A', { responsavel: ' ', destinatario: 'UBS 2', estado: 'integra' }, now);
  assert.equal(incompleto.ok, false);

  const invalido = ops.registerReceipt(s, 'A', { responsavel: 'Enf. Ana', destinatario: 'UBS 2', estado: 'qualquer' }, now);
  assert.equal(invalido.ok, false);

  const ok = ops.registerReceipt(s, 'A', { responsavel: '  Enf. Ana ', destinatario: 'UBS 2', estado: 'integra' }, now);
  assert.equal(ok.ok, true);
  assert.deepEqual(byId(s.entregas, 'A').recebimento, {
    responsavel: 'Enf. Ana', destinatario: 'UBS 2', carga: 'A · Insulina', estado: 'integra', horario: now
  });
  assert.match(s.log[0].msg, /A: recebimento registrado/);
});

/* ---------- Liberação formal de drone após incidente ---------- */
function incidente(now = 0) {
  const s = makeState({ drones: [drone('D1'), drone('D2', { x: 1 })], entregas: [entrega('M')] });
  ops.dispatch(s, 'M');
  ops.launch(s, 'M', now);
  const pane = now + 3 * ops.FLIGHT_MS_PER_KM;
  ops.emergencyLanding(s, 'M', 'motor', pane);
  return { s, pane, d: byId(s.drones, byId(s.entregas, 'M').droneId) };
}
const novaEntrega = (s, id) => { s.entregas.push(entrega(id, { ordem: 9 })); return ops.dispatch(s, id); };

test('drone em resgate (pouso de emergência) não pode ser despachado', () => {
  const { s, d } = incidente();
  s.drones = [d];
  assert.equal(d.status, 'pouso_emergencia');
  assert.equal(novaEntrega(s, 'N').ok, false);
});

test('drone em manutenção não pode ser despachado', () => {
  const { s, pane, d } = incidente();
  ops.tick(s, pane + ops.RESGATE_MS);
  s.drones = [d];
  assert.equal(d.status, 'manutencao');
  assert.equal(novaEntrega(s, 'N').ok, false);
});

test('drone aguardando liberação não pode ser despachado', () => {
  const { s, pane, d } = incidente();
  ops.tick(s, pane + ops.RESGATE_MS);
  ops.tick(s, pane + ops.RESGATE_MS + ops.MANUTENCAO_MS);
  s.drones = [d];
  assert.equal(d.status, 'aguardando_liberacao');
  assert.equal(novaEntrega(s, 'N').ok, false);
});

test('concluir a manutenção não libera o drone automaticamente, mesmo muito tempo depois', () => {
  const { s, pane, d } = incidente();
  ops.tick(s, pane + ops.RESGATE_MS);
  ops.tick(s, pane + ops.RESGATE_MS + ops.MANUTENCAO_MS);
  ops.tick(s, pane + 24 * 60 * 60 * 1000);
  assert.equal(d.status, 'aguardando_liberacao');
});

test('liberar drone com manutenção concluída o devolve à frota e registra no histórico', () => {
  const { s, pane, d } = incidente();
  ops.tick(s, pane + ops.RESGATE_MS);
  ops.tick(s, pane + ops.RESGATE_MS + ops.MANUTENCAO_MS);
  const r = ops.releaseDrone(s, d.id, pane + ops.RESGATE_MS + ops.MANUTENCAO_MS + 1);
  assert.equal(r.ok, true);
  assert.equal(d.status, 'disponivel');
  assert.equal(d.entregaId, null);
  assert.match(s.log[0].msg, new RegExp(d.nome + '.*liberado'));
  assert.equal(s.log[0].tipo, 'ok');
  assert.ok(s.log.some((l) => /falha de motor/.test(l.msg)), 'a ocorrência continua no histórico');
  assert.ok(byId(s.entregas, 'M').evento, 'o registro do evento na entrega é preservado');
  assert.equal(novaEntrega(s, 'N').ok, true);
});

test('liberação prematura é recusada (em resgate ou em manutenção)', () => {
  const { s, pane, d } = incidente();
  const r1 = ops.releaseDrone(s, d.id, pane + 1);
  assert.equal(r1.ok, false);
  assert.equal(d.status, 'pouso_emergencia');
  ops.tick(s, pane + ops.RESGATE_MS);
  const r2 = ops.releaseDrone(s, d.id, pane + ops.RESGATE_MS + 1);
  assert.equal(r2.ok, false);
  assert.equal(d.status, 'manutencao');
  assert.equal(ops.releaseDrone(s, 'NAO-EXISTE', 0).ok, false);
});

test('com um drone aguardando liberação, os outros drones disponíveis continuam operando', () => {
  const { s, pane, d } = incidente();
  ops.tick(s, pane + ops.RESGATE_MS);
  ops.tick(s, pane + ops.RESGATE_MS + ops.MANUTENCAO_MS);
  const outro = s.drones.find((x) => x.id !== d.id);
  const r = novaEntrega(s, 'N');
  assert.equal(r.ok, true);
  assert.equal(r.droneId, outro.id);
  assert.equal(d.status, 'aguardando_liberacao');
});
