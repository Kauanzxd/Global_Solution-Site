/* SADEC Delivery — vitrine, carrinho, escolha da entrega e acompanhamento do voo.
   O pedido vira uma entrega P4 no mesmo motor (SIDEC.ops) e estado (SIDEC.store) da central. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store, delivery: dl } = SIDEC;
  const { el } = SIDEC.ui;

  const $ = (id) => doc.getElementById(id);
  const reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
  const place = (state, id) => (ops.findPoint(state, id) || { nome: id }).nome;

  const carts = {}; // um carrinho por loja: { lojaId: { itemId: quantidade } }
  let lojaId = dl.LOJAS[0].id;
  let autoConvencional = false; // a troca para convencional foi automática (peso), não escolha do cliente
  let lastPhase = null;

  const loja = () => dl.LOJAS.find((l) => l.id === lojaId);
  const FOOD = '../assets/images/food/';
  const cart = () => (carts[lojaId] = carts[lojaId] || {});
  const modoInput = (m) => doc.querySelector('input[name="modo"][value="' + m + '"]');
  const modo = () => (modoInput('drone').checked ? 'drone' : 'convencional');
  const announce = (msg) => { $('cart-anuncio').textContent = msg; };

  /* ---------- Lojas e cardápio ---------- */
  /* ---------- Busca e filtro por tipo ---------- */
  let tipo = '';
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const termo = () => norm($('dl-busca').value.trim());
  const lojaCasa = (l, t) => !t || norm(l.nome + ' ' + l.tipo).includes(t) || l.itens.some((i) => norm(i.nome).includes(t));

  function applyFilters() {
    const t = termo();
    doc.querySelectorAll('#dl-lojas .store').forEach((s) => {
      const l = dl.LOJAS.find((x) => x.id === s.querySelector('input').value);
      s.hidden = !((!tipo || l.tipo === tipo) && lojaCasa(l, t));
    });
    doc.querySelectorAll('#dl-menu .dish').forEach((d) => {
      d.hidden = Boolean(t) && !norm(d.querySelector('.dish__name').textContent + ' ' + loja().nome).includes(t);
    });
  }

  function renderTipos() {
    const tipos = [''].concat([...new Set(dl.LOJAS.map((l) => l.tipo))]);
    $('dl-tipos').replaceChildren(...tipos.map((t) => el('button', { type: 'button', 'aria-pressed': String(t === tipo), 'data-tipo': t, text: t || 'Tudo' })));
  }

  /* Janela ilustrativa: próximo bloco de 15 min a partir de agora + 10 min */
  function renderJanela() {
    const t = new Date(Date.now() + 10 * 60000);
    t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
    const f = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('dl-janela').textContent = f(t) + '–' + f(new Date(t.getTime() + 15 * 60000));
  }

  function renderStores() {
    $('dl-lojas').replaceChildren(...dl.LOJAS.map((l) => el('label', { class: 'store' }, [
      el('input', { type: 'radio', name: 'loja', value: l.id, checked: l.id === lojaId }),
      l.capa ? el('img', { class: 'store__cover', src: FOOD + l.capa, alt: '', width: '480', height: '240', loading: 'lazy' }) : null,
      el('span', { class: 'store__body' }, [
        l.logo ? el('img', { class: 'store__logo', src: FOOD + l.logo, alt: '', width: '48', height: '48' }) : null,
        el('span', { class: 'store__text' }, [
          el('span', { class: 'store__name', text: l.nome }),
          el('span', { class: 'store__meta', text: l.tipo + ' · preparo de ' + l.preparoMin + ' min' }),
          l.slogan ? el('span', { class: 'store__slogan', text: l.slogan }) : null
        ])
      ])
    ])));
  }

  function renderMenu() {
    $('dl-menu').replaceChildren(...loja().itens.map((item) => el('li', { class: 'dish' + (item.img ? '' : ' dish--noimg') }, [
      item.img ? el('img', { class: 'dish__img', src: FOOD + item.img, alt: item.nome, width: '320', height: '240', loading: 'lazy' }) : null,
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
    const cap = dl.fleetCapacity(state.drones);
    $('peso-txt').textContent = dl.kg(sum.pesoKg).replace(' kg', '') + ' / ' + dl.kg(cap);
    $('peso-fill').setAttribute('width', String(Math.min(100, cap ? (sum.pesoKg / cap) * 100 : 0)));
    $('peso-fill').classList.toggle('is-over', sum.pesoKg > cap);
    $('tab-qtd').hidden = sum.qtd === 0;
    $('tab-qtd').textContent = String(sum.qtd);
    $('dl-where').textContent = $('dl-bairro').selectedOptions[0] ? $('dl-bairro').selectedOptions[0].textContent : '—';
    doc.querySelectorAll('#dl-etapas li').forEach((li, i) => {
      const cur = sum.qtd ? 1 : 0;
      if (i === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('is-done', i < cur);
    });
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
          preparoAte: Date.now() + loja().preparoMin * 60000 / ops.ESCALA_TEMPO // preparo realista no relógio acelerado
        };
        e.preparoAte = s.deliveryAtual.preparoAte;
        if (m === 'convencional') ops.markConventional(s, e.id);
        else ops.dispatch(s, e.id);
        return e;
      });
      carts[lojaId] = {};
      syncQty();
      renderCart(store.get());
      setStatus('Pedido ' + nova.id + ' confirmado.', true);
      gravarNaCentral(sum, nova.id);
      $('acompanhar-title').focus();
      $('acompanhar').scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth' });
    } catch (err) {
      setStatus(err.message, false);
    }
  }

  /* ---------- Conta e Central (API): a mesma conta do portal e do Saúde ---------- */
  let conta = null;
  let apiOnline = false;
  async function ativarConta() {
    if (!(await SIDEC.api.disponivel())) return;
    apiOnline = true;
    observarPainel();
    $('dl-live-recebi').addEventListener('click', confirmarRecebimento);
    atualizarReal(true);
    root.setInterval(() => { if (!doc.hidden) atualizarReal(false); }, 5000);
    const box = $('dl-conta');
    const r = SIDEC.api.sessao.atual() ? await SIDEC.api.get('/api/conta') : { ok: false };
    conta = r.ok && ['cliente', 'operador'].includes(r.dados.perfil) ? r.dados : null;
    box.hidden = false;
    if (!conta) {
      box.replaceChildren(r.ok ? 'Esta conta é de unidade de saúde; pedidos de delivery usam conta de cliente. ' : 'Entre para gravar o pedido na sua conta da Central. ',
        el('a', { href: '../entrar.html', text: r.ok ? 'Trocar de conta' : 'Entrar ou criar conta' }));
      return;
    }
    const l = await SIDEC.api.get('/api/locais');
    if (!l.ok) return;
    $('dl-real').replaceChildren(...l.dados.filter((x) => x.tipo === 'bairro').map((x) => el('option', { value: x.nome, text: x.nome })));
    $('field-dl-real').hidden = false;
    box.replaceChildren('Pedido gravado na conta de ', el('strong', { text: conta.nome }), '. ', el('a', { href: '../entrar.html', text: 'Trocar' }));
  }

  /* Grava o pedido também na Central (P4, mesma regra de prioridade), ligado à conta */
  async function gravarNaCentral(sum, idSimulado) {
    if (!conta) return;
    const msg = $('pedido-central');
    msg.hidden = false;
    msg.className = 'form-status';
    msg.textContent = 'Gravando na Central…';
    const r = await SIDEC.api.post('/api/pedidos', {
      tipo_carga: 'encomenda', destino: $('dl-real').value, origem: loja().nome, peso_kg: Math.max(0.1, sum.pesoKg), canal: 'delivery',
      solicitante: { tipo: 'cliente', nome: conta.nome }
    });
    msg.className = 'form-status ' + (r.ok ? 'is-success' : 'is-error');
    if (!r.ok) { msg.textContent = 'Não foi gravado na Central: ' + SIDEC.api.mensagemErro(r); return; }
    const p = r.dados.pedido;
    msg.textContent = idSimulado + ' gravado na Central como ' + p.codigo + '. Acompanhe o drone no mapa abaixo.';
    store.update((s) => { if (s.deliveryAtual && s.deliveryAtual.id === idSimulado) s.deliveryAtual.central = p.codigo; });
    atualizarReal(true);
  }

  /* ---------- Acompanhamento no mapa real (pedido gravado na Central) ---------- */
  const ESTADO_REAL = {
    aguardando: 'Na fila da Central: seu pedido sai no próximo drone livre.',
    reagendada: 'Seu drone foi cedido a uma entrega de saúde urgente. Você recebe o próximo drone livre.',
    atribuida: 'Drone reservado. A loja está preparando seu pedido.',
    em_voo: 'Seu pedido está voando até você.',
    entregue: 'Pedido entregue. Bom apetite!',
    outro_meio: 'Sem drone disponível agora: o pedido segue por outro meio de transporte.',
    aguardando_resgate: 'O drone fez um pouso seguro. A carga será recolhida e reenviada.'
  };
  const ETAPA_REAL = { aguardando: 1, reagendada: 1, atribuida: 1, em_voo: 2, entregue: 4, outro_meio: 0, aguardando_resgate: 2 };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  let mapaReal = null;
  let pedidoReal = null;
  let droneReal = null;
  let ocupado = false;

  async function atualizarReal(reenquadrar) {
    const atual = store.get().deliveryAtual;
    const codigo = atual && atual.central;
    $('dl-live').hidden = !codigo;
    if (!codigo) { pedidoReal = null; $('dl-pill').hidden = true; return; }
    if (ocupado) return;
    ocupado = true;
    try {
      const [r, drones] = await Promise.all([SIDEC.api.get('/api/pedidos/' + codigo), SIDEC.api.get('/api/drones')]);
      if (!r.ok) { $('dl-live-msg').textContent = SIDEC.api.mensagemErro(r); return; }
      pedidoReal = r.dados;
      droneReal = drones.ok ? drones.dados.find((d) => d.codigo === pedidoReal.drone_codigo) || null : null;
      // A loja libera a decolagem quando o preparo termina (o dono do pedido comercial pode decolar)
      if (pedidoReal.status === 'atribuida' && Date.now() >= atual.preparoAte) {
        const d = await SIDEC.api.post('/api/pedidos/' + codigo + '/decolar');
        if (d.ok) pedidoReal = d.dados;
      }
      pintarReal(reenquadrar);
    } finally {
      ocupado = false;
    }
  }

  function pintarReal(reenquadrar) {
    const p = pedidoReal;
    if (!p) return;
    const agora = Date.now();
    const est = SIDEC.mapaOsm.estimarVoo(p, agora);
    if (!mapaReal) mapaReal = SIDEC.mapaOsm.criar($('dl-osm'));
    const comDrone = p.drone_codigo && ['atribuida', 'em_voo'].includes(p.status);
    mapaReal.mostrar({ pontos: p.rota || [], progresso: est.f, drone: comDrone ? 'Drone ' + p.drone_codigo : null }, reenquadrar);

    const chegou = p.status === 'em_voo' && est.chegou;
    $('dl-live-code').textContent = p.codigo;
    $('dl-live-estado').textContent = p.status === 'entregue' ? 'concluído' : 'ao vivo';
    $('dl-live-title').textContent = chegou ? 'O drone chegou ao seu endereço. Retire o pedido e confirme o recebimento.' : (ESTADO_REAL[p.status] || p.status);
    const faltam = est.chegada ? est.faltamMin : null;
    $('dl-live-eta').textContent = p.status === 'entregue' ? 'Entregue' : (est.chegada ? hhmm(est.chegada) : '—');
    $('dl-live-eta-label').textContent = p.status === 'em_voo'
      ? (chegou ? 'chegada prevista (já passou)' : 'chegada prevista · faltam ' + faltam + ' min')
      : (p.status === 'atribuida' ? 'decola quando a loja terminar o preparo' : '');
    $('dl-live-fill').setAttribute('width', String(Math.round(est.f * 100)));
    const etapa = chegou ? 3 : ETAPA_REAL[p.status];
    $('dl-live-etapas').querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('is-done', i < etapa || p.status === 'entregue');
      if (i === etapa && p.status !== 'entregue') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    const dados = [fact('Rota', (p.origem || 'Filial') + ' → ' + p.destino), fact('Distância', String(p.distancia_km || 0).replace('.', ',') + ' km')];
    if (p.drone_codigo) dados.push(fact('Drone', p.drone_codigo));
    if (droneReal && comDrone) {
      // consumo de ida proporcional ao trecho voado (autonomia real do drone no banco)
      const bat = droneReal.bateria_pct - (p.distancia_km || 0) / droneReal.autonomia_km * 100 * est.f;
      dados.push(fact('Bateria (estimada)', String(Math.round(bat * 10) / 10).replace('.', ',') + '%'));
    }
    $('dl-live-dados').replaceChildren(...dados);
    $('dl-live-link').setAttribute('href', '../rastreamento.html?id=' + encodeURIComponent(p.codigo));
    $('dl-live-recebi').hidden = !chegou;
    $('dl-pill-code').textContent = p.codigo;
    $('dl-pill-texto').textContent = p.status === 'em_voo' ? (chegou ? 'Chegou · confirmar' : 'A caminho · ' + faltam + ' min') : (p.status === 'entregue' ? 'Entregue' : 'Acompanhar');
    $('dl-pill').hidden = pillOculta || p.status === 'entregue';
  }

  /* O atalho fixo aparece só quando o painel do pedido não está na tela */
  let pillOculta = false;
  function observarPainel() {
    if (!root.IntersectionObserver) return;
    new root.IntersectionObserver((itens) => {
      pillOculta = itens[0].isIntersecting;
      if (pedidoReal) $('dl-pill').hidden = pillOculta || pedidoReal.status === 'entregue';
    }, { threshold: 0.15 }).observe($('acompanhar'));
  }

  async function confirmarRecebimento() {
    const b = $('dl-live-recebi');
    b.disabled = true;
    const r = await SIDEC.api.post('/api/pedidos/' + pedidoReal.codigo + '/concluir');
    b.disabled = false;
    $('dl-live-msg').className = 'form-status ' + (r.ok ? 'is-success' : 'is-error');
    $('dl-live-msg').textContent = r.ok ? 'Recebimento confirmado e registrado no histórico da Central.' : SIDEC.api.mensagemErro(r);
    if (r.ok) { pedidoReal = r.dados; pintarReal(false); renderTrack(store.get(), Date.now()); }
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
    // Pedido na Central: o painel do mapa real substitui a animação da simulação
    const real = Boolean(p.central);
    ['track-status', 'track-etapas', 'track-ceu', 'track-dados'].forEach((id) => $(id).classList.toggle('is-oculto', real));
    $('dl-live-entrar').hidden = real || conta !== null || !apiOnline;

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
    $('link-rastreio').hidden = p.modo !== 'drone' || real;
    $('link-rastreio').setAttribute('href', '../rastreamento.html?id=' + encodeURIComponent(e.id));

    const fim = real ? Boolean(pedidoReal && pedidoReal.status === 'entregue') : (fase === 'entregue' || fase === 'convencional');
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
    renderTipos();
    renderJanela();
    $('dl-busca').addEventListener('input', applyFilters);
    $('dl-tipos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tipo]');
      if (!b) return;
      tipo = b.getAttribute('data-tipo');
      renderTipos();
      applyFilters();
    });
    const busca = doc.querySelector('[data-focus-search]');
    if (busca) busca.addEventListener('click', () => root.setTimeout(() => $('dl-busca').focus(), 0));
    renderCart(state);
    renderTrack(state, Date.now());

    $('dl-lojas').addEventListener('change', (ev) => {
      lojaId = ev.target.value;
      renderMenu();
      applyFilters();
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
  ativarConta();
})(window);
