/* SADEC Delivery — vitrine, carrinho, escolha da entrega e acompanhamento do voo.
   O pedido vira uma entrega P4 no mesmo motor (SIDEC.ops) e estado (SIDEC.store) da central. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store, delivery: dl } = SIDEC;
  const { el } = SIDEC.ui;

  const $ = (id) => doc.getElementById(id);
  const PREPARO_DEMO_MS = 6000; // preparo acelerado para a demonstração
  const reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
  const place = (state, id) => (ops.findPoint(state, id) || { nome: id }).nome;

  const carts = {}; // um carrinho por loja: { lojaId: { itemId: quantidade } }
  let lojaId = dl.LOJAS[0].id;
  let autoConvencional = false; // a troca para convencional foi automática (peso), não escolha do cliente
  let lastPhase = null;

  const loja = () => dl.LOJAS.find((l) => l.id === lojaId);
  const cart = () => (carts[lojaId] = carts[lojaId] || {});
  const modoInput = (m) => doc.querySelector('input[name="modo"][value="' + m + '"]');
  const modo = () => (modoInput('drone').checked ? 'drone' : 'convencional');
  const announce = (msg) => { $('cart-anuncio').textContent = msg; };

  /* ---------- Lojas e cardápio ---------- */
  function renderStores() {
    $('dl-lojas').replaceChildren(...dl.LOJAS.map((l) => el('label', { class: 'store' }, [
      el('input', { type: 'radio', name: 'loja', value: l.id, checked: l.id === lojaId }),
      el('span', { class: 'store__body' }, [
        el('span', { class: 'store__name', text: l.nome }),
        el('span', { class: 'store__meta', text: l.tipo + ', preparo de ' + l.preparoMin + ' min' })
      ])
    ])));
  }

  function renderMenu() {
    $('dl-menu').replaceChildren(...loja().itens.map((item) => el('li', { class: 'dish' }, [
      el('div', { class: 'dish__text' }, [
        el('h3', { class: 'dish__name', text: item.nome }),
        el('p', { class: 'dish__desc', text: item.desc }),
        el('p', { class: 'dish__price', text: dl.formatBRL(item.precoCents) })
      ]),
      el('div', { class: 'qty', role: 'group', 'aria-label': 'Quantidade de ' + item.nome }, [
        el('button', { class: 'qty__btn', type: 'button', 'data-item': item.id, 'data-delta': '-1', 'aria-label': 'Diminuir quantidade de ' + item.nome, text: '−' }),
        el('output', { class: 'qty__n', 'data-qty': item.id, text: '0' }),
        el('button', { class: 'qty__btn', type: 'button', 'data-item': item.id, 'data-delta': '1', 'aria-label': 'Aumentar quantidade de ' + item.nome, text: '+' })
      ])
    ])));
    syncQty();
  }

  /* Atualiza só textos e estados: os botões não são recriados, então o foco não se perde. */
  function syncQty() {
    loja().itens.forEach((item) => {
      const n = cart()[item.id] || 0;
      doc.querySelector('[data-qty="' + item.id + '"]').textContent = String(n);
      doc.querySelector('[data-item="' + item.id + '"][data-delta="-1"]').setAttribute('aria-disabled', String(n === 0));
      doc.querySelector('[data-item="' + item.id + '"][data-delta="1"]').setAttribute('aria-disabled', String(n >= dl.MAX_QTD));
    });
  }

  /* ---------- Carrinho e cotação ---------- */
  function cotacao(state) {
    const sum = dl.cartSummary(cart(), loja());
    const km = ops.distance(ops.findPoint(state, lojaId), ops.findPoint(state, $('dl-bairro').value));
    const q = dl.quote({ km, pesoKg: sum.pesoKg, capacidadeKg: dl.fleetCapacity(state.drones), preparoMin: loja().preparoMin });
    return { sum, q };
  }

  function renderCart(state) {
    const { sum, q } = cotacao(state);
    $('cart-loja').textContent = loja().nome;
    $('cart-linhas').replaceChildren(...sum.linhas.map((l) => el('li', { class: 'cart__line' }, [
      el('span', { text: l.qtd + '× ' + l.nome }),
      el('span', { class: 'num', text: dl.formatBRL(l.subtotalCents) })
    ])));
    $('cart-vazio').hidden = sum.qtd > 0;

    ['drone', 'convencional'].forEach((m) => {
      doc.querySelector('[data-eta="' + m + '"]').textContent = 'cerca de ' + q[m].minutos + ' min';
      doc.querySelector('[data-fee="' + m + '"]').textContent = dl.formatBRL(q[m].taxaCents);
    });
    doc.querySelector('[data-why="drone"]').textContent = q.drone.motivo || '';
    modoInput('drone').disabled = !q.drone.ok;
    if (!q.drone.ok && modoInput('drone').checked) { modoInput('convencional').checked = true; autoConvencional = true; }
    if (q.drone.ok && autoConvencional) { modoInput('drone').checked = true; autoConvencional = false; }

    const frete = sum.qtd ? q[modo()].taxaCents : 0;
    const total = sum.subtotalCents + frete;
    $('tot-produtos').textContent = dl.formatBRL(sum.subtotalCents);
    $('tot-entrega').textContent = dl.formatBRL(frete);
    $('tot-peso').textContent = dl.kg(sum.pesoKg);
    $('tot-total').textContent = dl.formatBRL(total);
    $('cart-bar').hidden = sum.qtd === 0;
    $('bar-qtd').textContent = sum.qtd + (sum.qtd === 1 ? ' item' : ' itens');
    $('bar-total').textContent = dl.formatBRL(total);
    return { sum, q, total };
  }

  function setStatus(msg, ok) {
    const box = $('pedido-status');
    box.textContent = msg;
    box.classList.toggle('is-success', ok);
    box.classList.toggle('is-error', !ok);
  }

  function submit(ev) {
    ev.preventDefault();
    const { sum, q, total } = renderCart(store.get());
    if (!sum.qtd) {
      setStatus('Adicione pelo menos um produto ao carrinho.', false);
      doc.querySelector('#dl-menu [data-delta="1"]').focus();
      return;
    }
    const atual = store.get().deliveryAtual;
    const ativa = atual && ops.byId(store.get().entregas, atual.id);
    if (ativa && ['fila', 'atribuida', 'em_voo'].includes(ativa.status)) {
      setStatus('Aguarde o pedido atual ser entregue antes de confirmar outro.', false);
      return;
    }
    const m = modo();
    const bairroId = $('dl-bairro').value;
    try {
      const nova = store.update((s) => {
        const e = ops.createOrder(s, {
          prioridade: 4, pesoKg: sum.pesoKg, origemId: lojaId, destinoId: bairroId,
          carga: 'Delivery — ' + loja().nome + ' (' + sum.qtd + (sum.qtd === 1 ? ' item)' : ' itens)'),
          solicitante: 'Cliente SADEC Delivery (fictício)'
        });
        s.deliveryAtual = {
          id: e.id, lojaId, bairroId, modo: m, minutos: q[m].minutos, totalCents: total,
          linhas: sum.linhas.map((l) => ({ nome: l.nome, qtd: l.qtd, subtotalCents: l.subtotalCents })),
          preparoAte: Date.now() + PREPARO_DEMO_MS
        };
        if (m === 'convencional') ops.markConventional(s, e.id);
        else ops.dispatch(s, e.id);
        return e;
      });
      carts[lojaId] = {};
      syncQty();
      renderCart(store.get());
      setStatus('Pedido ' + nova.id + ' confirmado.', true);
      $('acompanhar-title').focus();
      $('acompanhar').scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth' });
    } catch (err) {
      setStatus(err.message, false);
    }
  }

  /* ---------- Acompanhamento ---------- */
  const STEP = { aguardando: 1, preparando: 1, decolando: 1, a_caminho: 2, chegando: 3, entregue: 4, pouso: 2, outro_meio: 0, convencional: 0 };

  function statusText(state, e, p, fase) {
    const drone = e.droneId ? ops.byId(state.drones, e.droneId).nome : 'O drone';
    const bairro = place(state, p.bairroId);
    switch (fase) {
      case 'aguardando': return /^Reorganizada/.test(e.motivo || '')
        ? 'Seu drone foi cedido a uma entrega de saúde urgente. Você recebe o próximo drone livre.'
        : 'Todos os drones estão ocupados. Seu pedido sai no próximo drone livre.';
      case 'preparando': return place(state, p.lojaId) + ' está preparando seu pedido. ' + drone + ' já está reservado.';
      case 'decolando': return 'Pedido pronto. ' + drone + ' está decolando.';
      case 'a_caminho': return drone + ' está a caminho de ' + bairro + '.';
      case 'chegando': return 'Quase lá: ' + drone + ' está chegando em ' + bairro + '.';
      case 'entregue': return 'Pedido entregue em ' + bairro + '. Recebimento confirmado.';
      case 'pouso': return 'O drone fez um pouso seguro numa zona autorizada. Seu pedido será recolhido e reenviado (simulação).';
      case 'convencional': return 'Pedido confirmado para entrega convencional. O acompanhamento ao vivo existe só para drones neste protótipo.';
      default: return (e.motivo || 'Sem drone disponível.') + ' O pedido segue por outro meio de transporte.';
    }
  }

  function paintSky(e, now) {
    const progress = e.status === 'entregue' ? 1 : ops.flightProgress(e, now);
    const path = $('sky-done');
    path.setAttribute('stroke-dashoffset', String(Math.round((1 - progress) * 1000) / 10));
    const pt = path.getPointAtLength(path.getTotalLength() * progress);
    $('sky-drone').setAttribute('transform', 'translate(' + Math.round(pt.x) + ' ' + Math.round(pt.y) + ')');
  }

  let frame = 0;
  function animate() {
    const p = store.get().deliveryAtual;
    const e = p && ops.byId(store.get().entregas, p.id);
    if (!e || e.status !== 'em_voo') { frame = 0; return; }
    paintSky(e, Date.now());
    frame = root.requestAnimationFrame(animate);
  }

  function fact(dt, dd) {
    return el('div', {}, [el('dt', { text: dt }), el('dd', { text: dd })]);
  }

  function renderTrack(state, now) {
    const p = state.deliveryAtual;
    const e = p && ops.byId(state.entregas, p.id);
    $('track').hidden = !e;
    $('track-vazio').hidden = Boolean(e);
    if (!e) { lastPhase = null; return; }

    const fase = dl.trackingPhase(e, p, ops.flightProgress(e, now), now);
    if (fase !== lastPhase) {
      $('track-status').textContent = statusText(state, e, p, fase);
      lastPhase = fase;
    }
    const semVoo = fase === 'convencional' || fase === 'outro_meio';
    $('track-etapas').hidden = semVoo;
    $('track-ceu').hidden = semVoo;
    doc.querySelectorAll('#track-etapas li').forEach((li, i) => {
      li.classList.toggle('is-done', i < STEP[fase] || fase === 'entregue');
      if (i === STEP[fase] && fase !== 'entregue') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });

    const svg = doc.querySelector('.sky__svg');
    svg.classList.toggle('is-preparing', ['aguardando', 'preparando', 'decolando'].includes(fase));
    svg.classList.toggle('is-delivered', fase === 'entregue');
    $('sky-origem').textContent = place(state, p.lojaId);
    $('sky-destino').textContent = place(state, p.bairroId);
    paintSky(e, now);
    if (e.status === 'em_voo' && !reduced.matches && !frame) frame = root.requestAnimationFrame(animate);

    const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
    const dados = [fact('Pedido', e.id), fact('Entrega', p.modo === 'drone' ? 'Drone SADEC' : 'Convencional')];
    if (p.modo === 'drone') dados.push(fact('Drone', drone ? drone.nome : 'Aguardando'));
    if (e.status === 'em_voo') dados.push(fact('Bateria', String(ops.sensorReading(state, e, now).bateria).replace('.', ',') + '%'));
    dados.push(fact('Previsão ilustrativa', 'cerca de ' + p.minutos + ' min'));
    $('track-dados').replaceChildren(...dados);
    $('link-rastreio').hidden = p.modo !== 'drone';
    $('link-rastreio').setAttribute('href', '../rastreamento.html?id=' + encodeURIComponent(e.id));

    const fim = fase === 'entregue' || fase === 'convencional';
    $('recibo').hidden = !fim;
    if (fim) {
      $('recibo-linhas').replaceChildren(...p.linhas.map((l) => el('li', {}, [
        el('span', { text: l.qtd + '× ' + l.nome }), el('span', { class: 'num', text: dl.formatBRL(l.subtotalCents) })
      ])));
      $('recibo-total').textContent = 'Total pago (fictício): ' + dl.formatBRL(p.totalCents);
    }
  }

  /* Decolagem automática após o preparo e avanço do voo, como faria a operação da loja. */
  function loop() {
    if (document.hidden) return; // aba oculta: não gasta CPU; o estado é recalculado ao voltar
    const now = Date.now();
    const state = store.get();
    const p = state.deliveryAtual;
    const e = p && ops.byId(state.entregas, p.id);
    if (e && e.status === 'fila') store.update((s) => ops.dispatch(s, p.id));
    else if (e && e.status === 'atribuida' && now >= p.preparoAte) store.update((s) => ops.launch(s, p.id, Date.now()));
    else if (ops.tick(state, now).length) store.update(() => null);
    else renderTrack(state, now);
  }

  /* ---------- Início ---------- */
  function init() {
    const state = store.get();
    $('dl-bairro').replaceChildren(...state.locais.filter((l) => l.tipo === 'bairro').map((b) => el('option', { value: b.id, text: b.nome })));
    /* Desenho do avatar dentro de um <g> escalado (48 unidades), centrado no ponto da rota e um pouco acima da linha */
    const bot = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    bot.setAttribute('class', 'sky__bot');
    bot.setAttribute('transform', 'translate(-24 -34) scale(0.48)');
    bot.append(...SIDEC.droneAvatar.create().childNodes);
    $('sky-drone').append(bot);
    $('acompanhar-title').setAttribute('tabindex', '-1');

    renderStores();
    renderMenu();
    renderCart(state);
    renderTrack(state, Date.now());

    $('dl-lojas').addEventListener('change', (ev) => {
      lojaId = ev.target.value;
      renderMenu();
      renderCart(store.get());
    });
    $('dl-menu').addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-delta]');
      if (!btn) return;
      const id = btn.getAttribute('data-item');
      const atual = cart()[id] || 0;
      const n = Math.max(0, Math.min(dl.MAX_QTD, atual + Number(btn.getAttribute('data-delta'))));
      if (n === atual) return;
      cart()[id] = n;
      syncQty();
      const { sum } = renderCart(store.get());
      const item = loja().itens.find((i) => i.id === id);
      announce(item.nome + ': ' + n + '. Carrinho com ' + sum.qtd + (sum.qtd === 1 ? ' item.' : ' itens.'));
      setStatus('', true);
      $('pedido-status').classList.remove('is-success');
    });
    $('dl-bairro').addEventListener('change', () => renderCart(store.get()));
    $('dl-modos').addEventListener('change', () => { autoConvencional = false; renderCart(store.get()); });
    $('form-pedido').addEventListener('submit', submit);
    $('btn-novo').addEventListener('click', () => {
      store.update((s) => { s.deliveryAtual = null; });
      setStatus('', true);
      $('pedido-status').classList.remove('is-success');
      (doc.querySelector('input[name="loja"]:checked') || doc.querySelector('input[name="loja"]')).focus();
    });
    $('btn-tour').addEventListener('click', () => SIDEC.bot.startTour());

    store.subscribe((s) => { renderCart(s); renderTrack(s, Date.now()); });
    root.setInterval(loop, 1000);
  }

  init();
})(window);
