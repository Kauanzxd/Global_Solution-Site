/* SIDEC Delivery — catálogo FICTÍCIO e regras comerciais puras (carrinho e cotação ilustrativa).
   Lojas, produtos, preços e prazos são inventados. Usado no navegador (SIDEC.delivery) e nos testes em Node. */
(function (root) {
  'use strict';

  const TAXA_CENTS = { drone: 790, convencional: 590 };
  const KM_POR_MIN = { drone: 0.8, convencional: 0.3 }; // ~48 km/h em linha reta × ~18 km/h no trânsito
  const DESVIO_RUAS = 1.4; // ruas são mais longas que a linha reta do drone
  const MAX_QTD = 10;

  /* id da loja = id do local na cidade-modelo (SIDEC.data), para o motor calcular a rota. */
  const LOJAS = [
    {
      id: 'C-02', nome: 'Restaurante Sabor da Vila', tipo: 'Comida caseira', preparoMin: 12,
      itens: [
        { id: 'escondidinho', nome: 'Escondidinho de mandioca', desc: 'Carne seca, purê de mandioca e queijo gratinado.', precoCents: 3290, pesoKg: 0.6 },
        { id: 'salada', nome: 'Salada da casa', desc: 'Folhas, grão-de-bico, tomate e molho de ervas.', precoCents: 2490, pesoKg: 0.4 },
        { id: 'suco-caju', nome: 'Suco de caju 500 ml', desc: 'Feito na hora, sem açúcar.', precoCents: 990, pesoKg: 0.55 },
        { id: 'pudim', nome: 'Pudim de leite', desc: 'Fatia individual.', precoCents: 1250, pesoKg: 0.2 }
      ]
    },
    {
      id: 'C-03', nome: 'Padaria Grão Dourado', tipo: 'Padaria e café', preparoMin: 6,
      itens: [
        { id: 'pao-frances', nome: 'Pão francês (6 un.)', desc: 'Saído do forno a cada hora.', precoCents: 600, pesoKg: 0.3 },
        { id: 'pao-queijo', nome: 'Pão de queijo (10 un.)', desc: 'Tamanho coquetel.', precoCents: 1400, pesoKg: 0.4 },
        { id: 'bolo-fuba', nome: 'Bolo de fubá', desc: 'Inteiro, com erva-doce.', precoCents: 1800, pesoKg: 0.7 },
        { id: 'cafe-coado', nome: 'Café coado 300 ml', desc: 'Em copo térmico lacrado.', precoCents: 750, pesoKg: 0.35 }
      ]
    },
    {
      id: 'C-01', nome: 'Mercado Bom Preço', tipo: 'Mercado', preparoMin: 8,
      itens: [
        { id: 'cafe-500', nome: 'Café torrado 500 g', desc: 'Moagem média.', precoCents: 2190, pesoKg: 0.5 },
        { id: 'banana', nome: 'Banana-prata (1 kg)', desc: 'Cerca de 7 unidades.', precoCents: 798, pesoKg: 1 },
        { id: 'pao-forma', nome: 'Pão de forma integral', desc: 'Pacote de 500 g.', precoCents: 949, pesoKg: 0.5 },
        { id: 'agua-fardo', nome: 'Fardo de água (12 × 500 ml)', desc: 'Pesado: dois fardos passam do limite do drone.', precoCents: 1890, pesoKg: 6.2 }
      ]
    }
  ];

  const round2 = (n) => Math.round(n * 100) / 100;
  const kg = (n) => String(round2(n)).replace('.', ',') + ' kg';

  /* cart: { itemId: quantidade }. Itens desconhecidos ou zerados são ignorados. */
  function cartSummary(cart, loja) {
    const linhas = loja.itens
      .map((item) => ({ item, qtd: Math.min(MAX_QTD, Math.max(0, Math.floor(Number(cart[item.id]) || 0))) }))
      .filter((l) => l.qtd > 0)
      .map(({ item, qtd }) => ({ id: item.id, nome: item.nome, qtd, precoCents: item.precoCents, subtotalCents: item.precoCents * qtd, pesoKg: item.pesoKg * qtd }));
    return {
      linhas,
      qtd: linhas.reduce((s, l) => s + l.qtd, 0),
      subtotalCents: linhas.reduce((s, l) => s + l.subtotalCents, 0),
      pesoKg: round2(linhas.reduce((s, l) => s + l.pesoKg, 0))
    };
  }

  /* Maior carga que algum drone operante consegue levar. */
  function fleetCapacity(drones) {
    return drones.filter((d) => d.status !== 'manutencao').reduce((max, d) => Math.max(max, d.cargaMaxKg), 0);
  }

  function quote({ km, pesoKg, capacidadeKg, preparoMin }) {
    const droneOk = pesoKg <= capacidadeKg;
    return {
      drone: {
        ok: droneOk,
        motivo: droneOk ? null : 'Pedido de ' + kg(pesoKg) + ' passa do limite de ' + kg(capacidadeKg) + ' dos drones.',
        minutos: preparoMin + Math.ceil(km / KM_POR_MIN.drone),
        taxaCents: TAXA_CENTS.drone
      },
      convencional: {
        ok: true,
        motivo: null,
        minutos: preparoMin + Math.ceil((km * DESVIO_RUAS) / KM_POR_MIN.convencional),
        taxaCents: TAXA_CENTS.convencional
      }
    };
  }

  /* Fase vista pelo cliente, derivada do status da entrega no motor da central. */
  function trackingPhase(entrega, pedido, progress, now) {
    switch (entrega.status) {
      case 'fila': return 'aguardando';
      case 'atribuida': return now < pedido.preparoAte ? 'preparando' : 'decolando';
      case 'em_voo': return progress >= 0.8 ? 'chegando' : 'a_caminho';
      case 'entregue': return 'entregue';
      case 'pouso_emergencia': return 'pouso';
      default: return pedido.modo === 'convencional' ? 'convencional' : 'outro_meio';
    }
  }

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatBRL = (cents) => brl.format(cents / 100);

  const api = { LOJAS, MAX_QTD, TAXA_CENTS, cartSummary, fleetCapacity, quote, trackingPhase, formatBRL, kg };

  root.SIDEC = root.SIDEC || {};
  root.SIDEC.delivery = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
