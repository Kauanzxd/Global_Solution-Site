// Testes da lógica comercial do SIDEC Delivery (carrinho e cotação de entrega). Valores ilustrativos.
const test = require('node:test');
const assert = require('node:assert/strict');
const dl = require('../js/delivery-core.js');

const loja = {
  id: 'L', nome: 'Loja', preparoMin: 10,
  itens: [
    { id: 'a', nome: 'Prato', precoCents: 3290, pesoKg: 0.6 },
    { id: 'b', nome: 'Suco', precoCents: 990, pesoKg: 0.55 },
    { id: 'c', nome: 'Fardo de água', precoCents: 1890, pesoKg: 6.2 }
  ]
};

test('carrinho soma quantidades, preço em centavos e peso, ignorando itens zerados ou inexistentes', () => {
  const r = dl.cartSummary({ a: 2, b: 1, c: 0, x: 3 }, loja);
  assert.deepEqual(r.linhas.map((l) => [l.id, l.qtd, l.subtotalCents]), [['a', 2, 6580], ['b', 1, 990]]);
  assert.equal(r.qtd, 3);
  assert.equal(r.subtotalCents, 7570);
  assert.equal(r.pesoKg, 1.75);
});

test('carrinho vazio tem total zero', () => {
  const r = dl.cartSummary({}, loja);
  assert.equal(r.qtd, 0);
  assert.equal(r.subtotalCents, 0);
  assert.equal(r.pesoKg, 0);
});

test('capacidade da frota ignora drones em manutenção', () => {
  const drones = [{ cargaMaxKg: 6, status: 'disponivel' }, { cargaMaxKg: 12, status: 'manutencao' }, { cargaMaxKg: 8, status: 'em_voo' }];
  assert.equal(dl.fleetCapacity(drones), 8);
  assert.equal(dl.fleetCapacity([]), 0);
});

test('cotação: drone é mais rápido que a entrega convencional na mesma distância', () => {
  const q = dl.quote({ km: 8, pesoKg: 1, capacidadeKg: 8, preparoMin: 10 });
  assert.equal(q.drone.ok, true);
  assert.equal(q.drone.minutos, 20); // 10 de preparo + 8 km ÷ 0,8 km/min
  assert.equal(q.convencional.minutos, 48); // 10 + (8 × 1,4) ÷ 0,3 = 37,3 → 38
  assert.ok(q.drone.minutos < q.convencional.minutos);
});

test('cotação: peso igual à capacidade é aceito; acima, o drone fica indisponível com motivo', () => {
  assert.equal(dl.quote({ km: 5, pesoKg: 8, capacidadeKg: 8, preparoMin: 10 }).drone.ok, true);
  const q = dl.quote({ km: 5, pesoKg: 12.4, capacidadeKg: 8, preparoMin: 10 });
  assert.equal(q.drone.ok, false);
  assert.match(q.drone.motivo, /12,4 kg.*8 kg/);
  assert.equal(q.convencional.ok, true);
});

test('preço formatado em reais', () => {
  assert.equal(dl.formatBRL(7570).replace(/\s/g, ' '), 'R$ 75,70');
});

test('fase do acompanhamento segue o status da entrega no motor', () => {
  const p = { modo: 'drone', preparoAte: 1000 };
  const fase = (status, progress = 0, now = 0, pedido = p) => dl.trackingPhase({ status }, pedido, progress, now);
  assert.equal(fase('fila'), 'aguardando');
  assert.equal(fase('atribuida', 0, 999), 'preparando');
  assert.equal(fase('atribuida', 0, 1000), 'decolando');
  assert.equal(fase('em_voo', 0.79), 'a_caminho');
  assert.equal(fase('em_voo', 0.8), 'chegando');
  assert.equal(fase('entregue', 1), 'entregue');
  assert.equal(fase('pouso_emergencia', 0.4), 'pouso');
  assert.equal(fase('outro_meio'), 'outro_meio');
  assert.equal(fase('outro_meio', 0, 0, { modo: 'convencional' }), 'convencional');
});
