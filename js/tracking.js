/* SADEC — Rastreamento: busca por código, mapa claro com rota percorrida/restante, chegada,
   linha do tempo, temperatura, demonstrações de segurança e recebimento.
   Usa o mesmo estado da Central: o pedido e o drone exibidos são os mesmos. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store } = SIDEC;
  const { el } = SIDEC.ui;
  const NS = 'http://www.w3.org/2000/svg';
  const K = 10; // unidades SVG por km
  const FULL = { x: -4, y: -4, w: 208, h: 168 };
  const $ = (id) => doc.getElementById(id);

  let selectedId = new URLSearchParams(root.location.search).get('id');
  let zoom = 1;
  let lastDronePos = null;
  const tempHistory = [];

  function svg(tag, attrs, children) {
    const node = doc.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    [].concat(children || []).forEach((c) => node.append(c));
    return node;
  }
  const titled = (node, text) => { node.append(svg('title', {}, text)); return node; };
  const num = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  /* ---------- Mapa ---------- */
  function drawGrid() {
    const g = $('map-grid');
    g.append(svg('rect', { class: 'tmap__ground', x: -40, y: -40, width: 280, height: 250 }));
    // quarteirões entre as ruas (a cada 4 km) e um rio cortando a cidade
    for (let x = 0; x < 20; x += 4) {
      for (let y = 0; y < 16; y += 4) g.append(svg('rect', { class: 'tmap__block', x: x * K + 4, y: y * K + 4, width: 32, height: 32, rx: 4 }));
    }
    g.append(svg('path', { class: 'tmap__river', d: 'M-10 128 C 40 110, 80 150, 130 126 S 190 96, 215 104' }));
    g.append(svg('rect', { class: 'tmap__park', x: 124, y: 84, width: 30, height: 28, rx: 4 }));
  }

  function drawPoints(state, e) {
    if (e) { $('map-points').replaceChildren(); return; } // modelo: mapa limpo, só a rota
    const corridor = e ? ops.routeLandingZones(state, e.origemId, e.destinoId).map((z) => z.id) : [];
    const nodes = [];
    state.zonas.forEach((z) => nodes.push(titled(svg('rect', {
      class: 'tmap__zona' + (corridor.includes(z.id) ? ' is-corridor' : ''), x: z.x * K - 3, y: z.y * K - 3, width: 6, height: 6, rx: 1.5
    }), 'Zona de pouso: ' + z.nome)));
    state.locais.filter((l) => l.tipo === 'hospital' || l.tipo === 'ubs').forEach((h) => nodes.push(titled(svg('g', { class: 'tmap__hospital', transform: 'translate(' + h.x * K + ' ' + h.y * K + ')' }, [
      svg('circle', { r: 4 }), svg('path', { d: 'M-2 0H2M0 -2V2' })
    ]), h.nome)));
    state.filiais.forEach((f) => nodes.push(titled(svg('path', { class: 'tmap__base', d: 'M0 -5L4.5 3.5H-4.5Z', transform: 'translate(' + f.x * K + ' ' + f.y * K + ')' }), f.nome)));
    $('map-points').replaceChildren(...nodes);
  }

  const toD = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + (p.x * K).toFixed(1) + ' ' + (p.y * K).toFixed(1)).join(' ');

  function routePoints(state, e) {
    const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
    return e.trajeto || [drone, ops.findPoint(state, e.origemId), ops.findPoint(state, e.destinoId)].filter(Boolean);
  }

  /* Rota: faixa larga clara, trecho percorrido sólido e trecho restante pontilhado */
  function drawRoute(state, e, pos) {
    const g = $('map-route');
    if (!e) { g.replaceChildren(); return; }
    const pts = routePoints(state, e);
    const dest = ops.findPoint(state, e.destinoId);
    const progress = ops.flightProgress(e, Date.now());
    const lens = pts.slice(1).map((p, i) => ops.distance(pts[i], p));
    let walked = lens.reduce((s, l) => s + l, 0) * progress;
    const done = [pts[0]];
    let i = 0;
    for (; i < lens.length && walked > lens[i]; i += 1) { walked -= lens[i]; done.push(pts[i + 1]); }
    done.push(pos);
    const rest = [pos].concat(pts.slice(i + 1));
    const start = pts[0];
    g.replaceChildren(
      svg('path', { class: 'tmap__band', d: toD(pts) }),
      svg('circle', { class: 'tmap__origin', cx: start.x * K, cy: start.y * K, r: 3.4 }),
      svg('path', { class: 'tmap__done', d: toD(done) }),
      svg('path', { class: 'tmap__rest', d: toD(rest) }),
      svg('circle', { class: 'tmap__dest-halo', cx: dest.x * K, cy: dest.y * K, r: 9 }),
      svg('circle', { class: 'tmap__dest', cx: dest.x * K, cy: dest.y * K, r: 5 }),
      svg('circle', { class: 'tmap__dest-dot', cx: dest.x * K, cy: dest.y * K, r: 1.8 })
    );
  }

  const parachute = svg('path', { class: 'tmap__parachute', d: 'M-9 -12 Q0 -26 9 -12 M-9 -12 L-2.5 -5 M9 -12 L2.5 -5' });
  $('map-drone').append(
    svg('path', { class: 'tmap__cone', d: 'M0 0 L-7 18 L7 18 Z' }),
    parachute,
    svg('circle', { class: 'tmap__drone-ring', r: 6 }),
    svg('circle', { class: 'tmap__drone-dot', r: 4 })
  );

  function placeDrone(pos, e) {
    const g = $('map-drone');
    const angle = lastDronePos && (pos.x !== lastDronePos.x || pos.y !== lastDronePos.y)
      ? Math.atan2(pos.y - lastDronePos.y, pos.x - lastDronePos.x) * 180 / Math.PI + 90 + 180 : null;
    g.setAttribute('transform', 'translate(' + pos.x * K + ' ' + pos.y * K + ')');
    if (angle !== null) g.querySelector('.tmap__cone').setAttribute('transform', 'rotate(' + angle.toFixed(0) + ')');
    g.classList.toggle('is-flying', e.status === 'em_voo');
    g.classList.toggle('is-grave', Boolean(e.evento && e.evento.paraquedas));
    g.classList.toggle('is-landed', e.status === 'pouso_emergencia');
    lastDronePos = pos;
  }

  function applyZoom() {
    const map = $('map');
    if (zoom === 1 || !lastDronePos) { map.setAttribute('viewBox', [FULL.x, FULL.y, FULL.w, FULL.h].join(' ')); return; }
    const w = FULL.w / zoom;
    const h = FULL.h / zoom;
    const x = Math.min(Math.max(lastDronePos.x * K - w / 2, FULL.x), FULL.x + FULL.w - w);
    const y = Math.min(Math.max(lastDronePos.y * K - h / 2, FULL.y), FULL.y + FULL.h - h);
    map.setAttribute('viewBox', [x.toFixed(1), y.toFixed(1), w.toFixed(1), h.toFixed(1)].join(' '));
  }

  /* ---------- Cartões ---------- */
  const PHASE = { fila: 0, convencional: 0, outro_meio: 0, atribuida: 1, em_voo: 2, pouso_emergencia: 2, entregue: 3 };
  const SHORT = { fila: 'Na fila', atribuida: 'Despachado', em_voo: 'Em rota', entregue: 'Entregue', pouso_emergencia: 'Pouso seguro', outro_meio: 'Outro meio', convencional: 'Convencional' };

  function timeline(state, e) {
    const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
    const items = [{ t: 'Solicitação registrada', d: 'Classificada como P' + e.prioridade + ' · ' + ops.PRIORIDADES[e.prioridade], done: true }];
    if (e.status === 'outro_meio') items.push({ t: 'Sem drone elegível', d: e.motivo || 'Transporte alternativo indicado.', done: true, alert: true });
    if (e.status === 'convencional') items.push({ t: 'Entrega convencional', d: 'Pedido acima da carga dos drones.', done: true });
    if (drone) items.push({ t: 'Drone designado', d: drone.nome + ' · ' + drone.id, done: true });
    if (typeof e.inicio === 'number') {
      items.push({ time: hhmm(e.inicio), t: 'Decolagem', d: 'Rota segura com zonas de pouso mapeadas', done: true });
      if (e.status === 'em_voo') items.push({ time: 'agora', t: 'Em rota', d: 'Corredor seguro · sem desvios', now: true });
      if (e.status === 'pouso_emergencia') items.push({ t: 'Pouso de emergência', d: 'Ocorrência registrada; drone segue para manutenção.', done: true, alert: true });
      else items.push({ time: hhmm(e.inicio + e.duracaoMs), t: e.status === 'entregue' ? 'Entregue' : 'Chegada prevista', d: ops.findPoint(state, e.destinoId).nome, done: e.status === 'entregue' });
    } else if (e.droneId) {
      items.push({ t: 'Aguardando decolagem', d: 'Libere em Demonstrações de segurança ou na Central.', done: false });
    } else if (e.status === 'fila') {
      items.push({ t: 'Aguardando drone', d: 'A Central atende por prioridade e ordem de chegada.', done: false });
    }
    if (e.recebimento) items.push({ time: hhmm(e.recebimento.horario), t: 'Recebimento registrado', d: e.recebimento.destinatario, done: true });
    return items;
  }

  function renderStatic(state, e) {
    const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
    $('track-prio').textContent = 'P' + e.prioridade;
    $('track-prio').setAttribute('data-prio', String(e.prioridade));
    $('track-code').textContent = e.id;
    $('track-status').textContent = SHORT[e.status] || ops.STATUS[e.status];
    $('track-status').setAttribute('data-status', e.status);
    const phase = PHASE[e.status];
    doc.querySelectorAll('#track-progress li').forEach((li, i) => {
      li.className = i < phase ? (i === phase - 1 && phase < 3 ? 'is-current' : 'is-done') : '';
      if (e.status === 'pouso_emergencia' && i === 1) li.className = 'is-alert';
    });
    $('track-cargo').textContent = e.carga + ' · ' + String(e.pesoKg).replace('.', ',') + ' kg' + (e.faixaTemp ? ' · contêiner refrigerado' : '');
    $('track-reason').hidden = !e.motivo;
    $('track-reason').textContent = e.motivo || '';
    $('track-from').textContent = ops.findPoint(state, e.origemId).nome;
    $('track-to').textContent = ops.findPoint(state, e.destinoId).nome;
    $('track-drone').textContent = drone ? drone.nome : '—';
    $('r-carga').value = e.id + ' · ' + e.carga;

    $('steps').replaceChildren(...timeline(state, e).map((s) => el('li', { class: 'trk-time__item' + (s.done ? ' is-done' : '') + (s.alert ? ' is-alert' : '') + (s.now ? ' is-now' : '') }, [
      el('span', { class: 'mono trk-time__t', text: s.time || '—' }),
      el('span', { class: 'trk-time__dot', 'aria-hidden': 'true' }),
      el('span', { class: 'trk-time__body' }, [el('span', { class: 'trk-time__title', text: s.t }), el('span', { class: 'trk-time__desc', text: s.d })])
    ])));

    const actions = { launch: e.status === 'atribuida', bateria: e.status === 'em_voo', motor: e.status === 'em_voo', grave: e.status === 'em_voo', temp: e.status === 'em_voo' && Boolean(e.faixaTemp) };
    doc.querySelectorAll('#safety-actions [data-action]').forEach((b) => { b.disabled = !actions[b.getAttribute('data-action')]; });
    $('safety-hint').textContent = e.status === 'em_voo'
      ? (e.faixaTemp ? '' : 'Esta carga não exige controle térmico; a demonstração de temperatura fica indisponível.')
      : (e.status === 'atribuida' ? 'Decole a entrega para liberar as demonstrações.' : 'Escolha uma entrega em voo para testar as contingências.');

    tempHistory.length = 0;
    renderIncident(state, e);
    renderReceipt(e);
    drawPoints(state, e);
  }

  /* ---------- Recebimento (rastreabilidade) ---------- */
  function renderReceipt(e) {
    const form = $('receipt-form');
    const done = $('receipt-done');
    const open = e.status === 'entregue' && !e.recebimento;
    form.querySelectorAll('input:not([readonly]), select, button').forEach((n) => { n.disabled = !open; });
    form.hidden = Boolean(e.recebimento);
    if (e.status !== 'entregue') $('receipt-msg').className = 'form-status';
    if (!e.recebimento) { done.hidden = true; done.replaceChildren(); return; }
    const r = e.recebimento;
    const rows = [
      ['Responsável', r.responsavel], ['Destinatário', r.destinatario], ['Carga', r.carga],
      ['Estado', ops.ESTADOS_RECEBIMENTO[r.estado]], ['Horário', new Date(r.horario).toLocaleString('pt-BR')]
    ];
    done.replaceChildren(...rows.map(([k, v]) => el('div', {}, [el('dt', { text: k }), el('dd', { text: v })])));
    done.hidden = false;
  }

  $('receipt-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = { responsavel: $('r-responsavel').value, destinatario: $('r-destinatario').value, estado: $('r-estado').value };
    let res = null;
    store.update((s) => { res = ops.registerReceipt(s, selectedId, data, Date.now()); return res; });
    const msg = $('receipt-msg');
    msg.textContent = res.ok ? 'Recebimento registrado. A entrega está rastreável no registro da Central.' : res.motivo;
    msg.className = 'form-status ' + (res.ok ? 'is-success' : 'is-error');
    if (res.ok) $('receipt-form').reset();
  });

  function renderIncident(state, e) {
    const box = $('incident');
    if (!e.evento) { box.replaceChildren(); box.className = 'incident'; return; }
    const zona = ops.byId(state.zonas, e.evento.zonaId);
    box.className = 'incident ' + (e.evento.paraquedas ? 'incident--grave' : 'incident--pouso');
    box.replaceChildren(
      el('p', { class: 'incident__title', text: e.evento.paraquedas ? 'Falha grave: paraquedas acionado' : 'Pouso seguro concluído' }),
      el('p', { text: e.evento.paraquedas
        ? 'Luzes e alerta sonoro ativos. Pouso controlado no ponto (' + e.evento.x + ', ' + e.evento.y + ') km.'
        : 'Drone pousou em ' + zona.nome + ', a zona segura mais próxima da rota.' }),
      el('p', { class: 'mono', text: 'Ocorrência registrada. Resgate da carga e manutenção do drone (referência: ' + zona.nome + ').' })
    );
  }

  function renderLive(state, e, now) {
    const r = ops.sensorReading(state, e, now);
    const pos = e.status === 'pouso_emergencia' ? { x: e.evento.x, y: e.evento.y } : (e.status === 'entregue' ? ops.findPoint(state, e.destinoId) : r);
    placeDrone(pos, e);
    drawRoute(state, e, pos);
    if (zoom !== 1) applyZoom();

    const flying = e.status === 'em_voo';
    const droneId = e.droneId ? ops.byId(state.drones, e.droneId).nome : 'sem drone';
    $('map-note').textContent = e.km
      ? droneId + ' · ' + num(e.km * r.progress) + ' de ' + num(e.km) + ' km' + (flying ? ' · 92 m de altitude' : '')
      : droneId + ' · aguardando decolagem';
    const leftS = flying ? Math.max(0, Math.round((1 - r.progress) * e.duracaoMs / 1000)) : null;
    $('eta-time').textContent = typeof e.inicio === 'number' ? hhmm(e.inicio + e.duracaoMs) : '—';
    $('eta-left').textContent = leftS === null ? (e.status === 'entregue' ? 'chegou' : '—') : (leftS >= 60 ? Math.floor(leftS / 60) + ' min' : leftS + ' s');

    const bat = r.bateria === null ? (e.droneId ? ops.byId(state.drones, e.droneId).bateria : null) : r.bateria;
    $('track-bat').textContent = bat === null ? '—' : Math.round(bat) + '%';
    $('track-bat-fill').setAttribute('width', String(bat === null ? 0 : Math.max(0, Math.min(100, bat))));
    $('track-bat-fill').classList.toggle('is-low', bat !== null && bat < 30);

    const temp = r.temp === null ? null : ops.checkTemperature(r.temp, e.faixaTemp);
    const card = $('telemetria');
    card.classList.toggle('is-alert', Boolean(temp && !temp.ok));
    $('track-temp').textContent = r.temp === null ? 'Sem controle' : String(r.temp).replace('.', ',') + ' °C';
    $('track-temp-range').textContent = r.temp === null ? 'carga sem faixa térmica' : (temp.ok ? '· dentro de ' : '· fora de ') + e.faixaTemp.min + '–' + e.faixaTemp.max + ' °C';
    if (r.temp !== null && flying) {
      tempHistory.push(r.temp);
      if (tempHistory.length > 24) tempHistory.shift();
    }
    const min = 0; const max = 12;
    $('track-spark-line').setAttribute('points', tempHistory.map((t, i) => (i * 100 / 23).toFixed(1) + ',' + (30 - ((t - min) / (max - min)) * 30).toFixed(1)).join(' '));

    $('telemetry').replaceChildren(...[
      ['Progresso', Math.round(r.progress * 100) + '%'],
      ['Vibração', r.vibracao + ' g'],
      ['Posição', pos.x + ', ' + pos.y + ' km']
    ].map(([k, v]) => el('div', {}, [el('dt', { text: k }), el('dd', { class: 'mono', text: v })])));

    const alert = $('temp-alert');
    // Texto estável (sem o valor que muda a cada segundo) para o leitor de tela anunciar uma vez só.
    const msg = temp && !temp.ok && flying ? 'Temperatura fora da faixa de 2 a 8 °C. Equipe médica avisada.' : '';
    if (alert.textContent !== msg) alert.textContent = msg;
    alert.classList.toggle('is-visible', Boolean(msg));
    if (msg && !e.alertaTemp) store.update((s) => { const x = ops.byId(s.entregas, e.id); x.alertaTemp = true; ops.addLog(s, e.id + ': ' + temp.mensagem, 'erro'); });
  }

  /* ---------- Busca ---------- */
  function current(state) {
    if (selectedId === '') return null;
    let e = selectedId && ops.byId(state.entregas, selectedId);
    if (!e && selectedId) return null; // código digitado não existe
    if (!e) e = state.entregas.find((x) => x.status === 'em_voo') || state.entregas.find((x) => x.droneId) || state.entregas[0];
    selectedId = e ? e.id : null;
    return e;
  }

  function examples(state) {
    const pick = [state.entregas.find((x) => x.status === 'em_voo'), state.entregas.find((x) => x.prioridade === 1), state.entregas.find((x) => x.prioridade === 4)]
      .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 2);
    if (pick.length < 2) state.entregas.slice(0, 2 - pick.length).forEach((x) => { if (!pick.includes(x)) pick.push(x); });
    $('track-examples').replaceChildren(...pick.map((x) => el('button', { class: 'trk-chip mono', type: 'button', 'data-example': x.id, text: x.id })));
    $('track-list').replaceChildren(...state.entregas.map((x) => el('option', { value: x.id, text: 'P' + x.prioridade + ' · ' + x.carga })));
  }

  function select(id) {
    selectedId = id;
    root.history.replaceState(null, '', '?id=' + encodeURIComponent(id));
    lastKey = '';
    lastDronePos = null;
    zoom = 1;
    applyZoom();
    render(store.get());
  }

  let lastKey = '';
  function render(state) {
    const e = current(state);
    $('track-notfound').hidden = Boolean(e);
    $('track-found').hidden = !e;
    doc.querySelector('.trk-more').hidden = !e;
    const key = (e ? e.id + e.status + (e.droneId || '') + (e.evento ? 'ev' : '') + (e.recebimento ? 'rc' : '') : 'none') + state.entregas.length;
    if (key !== lastKey) {
      examples(state);
      if (e) {
        if (doc.activeElement !== $('track-input')) $('track-input').value = e.id;
        renderStatic(state, e);
      }
      lastKey = key;
    }
    if (e) renderLive(state, e, Date.now());
  }

  /* Alerta sonoro curto da demonstração de falha grave (só após clique do usuário). */
  function beep() {
    try {
      const ctx = new (root.AudioContext || root.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.value = 0.05;
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.15);
      });
    } catch {
      /* áudio indisponível: o alerta visual continua */
    }
  }

  $('busca').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const code = $('track-input').value.trim().toUpperCase();
    select(code);
    if ($('track-notfound').hidden === false) $('notfound-title').textContent = 'Não encontramos ' + (code || 'um código vazio');
  });
  $('track-examples').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-example]');
    if (b) select(b.getAttribute('data-example'));
  });
  $('track-example').addEventListener('click', () => select(null));

  doc.querySelector('.trk-map__tools').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-zoom]');
    if (!b) return;
    const z = b.getAttribute('data-zoom');
    zoom = z === 'in' ? Math.min(3, zoom + 0.75) : z === 'out' ? Math.max(1, zoom - 0.75) : 2.25;
    applyZoom();
  });

  $('safety-actions').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.getAttribute('data-action');
    const now = Date.now();
    store.update((s) => {
      if (action === 'launch') return ops.launch(s, selectedId, now);
      if (action === 'temp') { ops.byId(s.entregas, selectedId).tempOffset = 6; return null; }
      return ops.emergencyLanding(s, selectedId, action, now);
    });
    if (action === 'grave') beep();
  });

  $('btn-track-tour').addEventListener('click', () => SIDEC.bot.startTour());

  drawGrid();
  store.subscribe((s) => { lastKey = ''; render(s); });
  render(store.get());
  setInterval(() => {
    if (doc.hidden) return; // aba oculta: não gasta CPU
    const state = store.get();
    if (ops.tick(state, Date.now()).length) store.update(() => null);
    else render(state);
  }, 500);
})(window);
