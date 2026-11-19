/* SIDEC Delivery — catálogo FICTÍCIO e regras comerciais puras (carrinho e cotação ilustrativa).
   Lojas, produtos, preços e prazos são inventados. Usado no navegador (SIDEC.delivery) e nos testes em Node. */
(function (root) {
  'use strict';

  const TAXA_CENTS = { drone: 790, convencional: 590 };
  const KM_POR_MIN = { drone: 0.8, convencional: 0.3 }; // ~48 km/h em linha reta × ~18 km/h no trânsito
  const DESVIO_RUAS = 1.4; // ruas são mais longas que a linha reta do drone
  const MAX_QTD = 10;

  /* id da loja = id do local na cidade-modelo (SIDEC.data), para o motor calcular a rota. */
  /* Restaurantes fictícios da identidade visual; img/logo/capa são arquivos de assets/images/food/. */
  const LOJAS = [
    {
      id: 'C-03', nome: 'Burger House', tipo: 'Hambúrgueres', preparoMin: 10,
      slogan: 'Sabor de verdade, em cada mordida.', logo: 'burger-house.svg', capa: 'cover-burger.jpg',
      itens: [
        { id: 'double-cheese', nome: 'Double Cheese', desc: 'Dois smash, cheddar e cebola caramelizada.', precoCents: 3990, pesoKg: 0.42, img: 'burger-double-cheese.jpg' },
        { id: 'fritas', nome: 'Batata frita', desc: 'Porção média, sal e páprica.', precoCents: 1690, pesoKg: 0.2, img: 'bh-fritas.jpg' },
        { id: 'onion', nome: 'Onion rings', desc: 'Anéis de cebola com molho da casa.', precoCents: 1990, pesoKg: 0.22, img: 'bh-onion.jpg' },
        { id: 'frango', nome: 'Frango crocante', desc: '8 tiras empanadas.', precoCents: 2490, pesoKg: 0.3, img: 'bh-frango.jpg' },
        { id: 'shake-morango', nome: 'Milkshake de morango', desc: '400 ml com chantilly.', precoCents: 1890, pesoKg: 0.45, img: 'bh-shake.jpg' },
        { id: 'refri', nome: 'Refrigerante de cola', desc: '400 ml com gelo.', precoCents: 890, pesoKg: 0.42, img: 'bh-refri.jpg' },
        { id: 'fardo-refri', nome: 'Fardo de refrigerante (6 × 2 L)', desc: 'Pesado: passa do limite de carga dos drones e vai pela entrega convencional.', precoCents: 5490, pesoKg: 12.6 }
      ]
    },
    {
      id: 'C-02', nome: 'Bella Pizza', tipo: 'Pizzaria', preparoMin: 15,
      slogan: 'Mais que pizza, uma paixão.', logo: 'bella-pizza.svg', capa: 'cover-bella.jpg',
      itens: [
        { id: 'pizza-pepperoni', nome: 'Pizza de pepperoni', desc: 'Grande, 8 fatias, muçarela.', precoCents: 6490, pesoKg: 0.9, img: 'bp-pizza.jpg' },
        { id: 'fatia', nome: 'Fatia de pepperoni', desc: 'Individual, bem recheada.', precoCents: 1490, pesoKg: 0.18, img: 'bp-fatia.jpg' },
        { id: 'carbonara', nome: 'Espaguete à carbonara', desc: '400 g, bacon e parmesão.', precoCents: 4290, pesoKg: 0.45, img: 'bp-massa.jpg' },
        { id: 'salada-frango', nome: 'Salada de frango grelhado', desc: 'Folhas, tomate e frango.', precoCents: 3290, pesoKg: 0.35, img: 'bp-salada.jpg' },
        { id: 'petit', nome: 'Petit gâteau', desc: 'Chocolate com morango.', precoCents: 2290, pesoKg: 0.2, img: 'bp-petit.jpg' }
      ]
    },
    {
      id: 'C-01', nome: 'Sakura Sushi', tipo: 'Japonês', preparoMin: 18,
      slogan: 'Tradição e sabor em cada detalhe.', logo: 'sakura-sushi.svg', capa: 'cover-sakura.jpg',
      itens: [
        { id: 'uramaki', nome: 'Uramaki de salmão', desc: '8 peças com gergelim.', precoCents: 3890, pesoKg: 0.25, img: 'ss-uramaki.jpg' },
        { id: 'hotroll', nome: 'Hot roll', desc: '8 peças com molho tarê.', precoCents: 3690, pesoKg: 0.27, img: 'ss-hotroll.jpg' },
        { id: 'nigiri', nome: 'Nigiri salmão e atum', desc: '6 peças.', precoCents: 3490, pesoKg: 0.2, img: 'ss-nigiri.jpg' },
        { id: 'poke', nome: 'Poke de salmão', desc: 'Tigela de 450 g.', precoCents: 4690, pesoKg: 0.5, img: 'ss-poke.jpg' },
        { id: 'limonada', nome: 'Limonada com hortelã', desc: '400 ml.', precoCents: 1290, pesoKg: 0.42, img: 'ss-limonada.jpg' },
        { id: 'shake-chocolate', nome: 'Milkshake de chocolate', desc: '400 ml com biscoito.', precoCents: 1990, pesoKg: 0.45, img: 'ss-shake.jpg' }
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
    return drones.filter((d) => !['manutencao', 'aguardando_liberacao'].includes(d.status)).reduce((max, d) => Math.max(max, d.cargaMaxKg), 0);
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
