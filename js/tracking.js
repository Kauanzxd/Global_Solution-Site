/* SIDEC — Rastreamento: mapa esquemático em SVG, etapas, telemetria e demonstrações de segurança.
   Usa o mesmo estado da Central: o pedido e o drone exibidos são os mesmos. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store } = SIDEC;
  const { el } = SIDEC.ui;
  const NS = 'http://www.w3.org/2000/svg';
  const K = 10; // unidades SVG por km
  const $ = (id) => doc.getElementById(id);

  let selectedId = new URLSearchParams(root.location.search).get('id');

  function svg(tag, attrs, children) {
    const node = doc.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    [].concat(children || []).forEach((c) => node.append(c));
    return node;
  }

  const titled = (node, text) => { node.append(svg('title', {}, text)); return node; };

  /* ---------- Mapa ---------- */
  function drawGrid() {
    const g = $('map-grid');
    for (let x = 0; x <= 20; x += 2) g.append(svg('line', { x1: x * K, y1: 0, x2: x * K, y2: 160 }));
    for (let y = 0; y <= 16; y += 2) g.append(svg('line', { x1: 0, y1: y * K, x2: 200, y2: y * K }));
    g.append(svg('rect', { class: 'map__frame', x: 0, y: 0, width: 200, height: 160 }));
  }

  function drawPoints(state, e) {
    const corridor = e ? ops.routeLandingZones(state, e.origemId, e.destinoId).map((z) => z.id) : [];
    const nodes = [];
    state.zonas.forEach((z) => nodes.push(titled(svg('rect', {
      class: 'map__zona' + (corridor.includes(z.id) ? ' is-corridor' : ''), x: z.x * K - 3.5, y: z.y * K - 3.5, width: 7, height: 7, rx: 1.5
    }), 'Zona de pouso: ' + z.nome)));
    state.locais.filter((l) => l.tipo === 'hospital' || l.tipo === 'ubs').forEach((h) => nodes.push(titled(svg('g', { class: 'map__hospital', transform: 'translate(' + h.x * K + ' ' + h.y * K + ')' }, [
      svg('circle', { r: 4.5 }), svg('path', { d: 'M-2.2 0H2.2M0 -2.2V2.2' })
    ]), h.nome)));
    state.locais.filter((l) => l.tipo === 'bairro').forEach((b) => nodes.push(
      svg('text', { class: 'map__label', x: b.x * K, y: b.y * K + 3 }, b.nome)
    ));
    state.filiais.forEach((f) => nodes.push(titled(svg('g', { class: 'map__base', transform: 'translate(' + f.x * K + ' ' + f.y * K + ')' }, [
      svg('path', { d: 'M0 -6L5.5 4H-5.5Z' }), svg('text', { class: 'map__label map__label--base', y: 13 }, f.nome)
    ]), f.nome)));
    $('map-points').replaceChildren(...nodes);
  }

  function drawRoute(state, e) {
    const g = $('map-route');
    if (!e) { g.replaceChildren(); return; }
    const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
    const pts = e.trajeto || [drone, ops.findPoint(state, e.origemId), ops.findPoint(state, e.destinoId)].filter(Boolean);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x * K + ' ' + p.y * K).join(' ');
    const dest = ops.findPoint(state, e.destinoId);
    g.replaceChildren(
      svg('path', { class: 'map__route', d }),
      svg('circle', { class: 'map__dest', cx: dest.x * K, cy: dest.y * K, r: 8 }),
      svg('text', { class: 'map__label map__label--dest', x: dest.x * K, y: dest.y * K - 11 }, 'Destino')
    );
  }

  const droneAvatar = SIDEC.droneAvatar.create();
  droneAvatar.setAttribute('width', '18');
  droneAvatar.setAttribute('height', '18');
  droneAvatar.setAttribute('x', '-9');
  droneAvatar.setAttribute('y', '-9');
  const parachute = svg('path', { class: 'map__parachute', d: 'M-10 -14 Q0 -30 10 -14 M-10 -14 L-3 -6 M10 -14 L3 -6 M0 -22 L0 -6' });
  $('map-drone').append(svg('circle', { class: 'map__pulse', r: 12 }), parachute, droneAvatar);

  function placeDrone(pos, e) {
    const g = $('map-drone');
    g.setAttribute('transform', 'translate(' + pos.x * K + ' ' + pos.y * K + ')');
    g.classList.toggle('is-flying', e.status === 'em_voo');
    g.classList.toggle('is-grave', Boolean(e.evento && e.evento.paraquedas));
    g.classList.toggle('is-landed', e.status === 'pouso_emergencia');
  }

  /* ---------- Painéis ---------- */
  function steps(e) {
    const labels = ['Pedido', 'Priorização', 'Seleção do drone', 'Rota segura', 'Monitoramento', 'Entrega'];
    const doneUntil = { fila: 1, outro_meio: 2, atribuida: 3, em_voo: 4, pouso_emergencia: 4, entregue: 6 }[e.status];
    return labels.map((label, i) => {
      let st = i < doneUntil ? 'done' : (i === doneUntil ? 'current' : 'todo');
      if (e.status === 'outro_meio' && i === 2) st = 'fail';
      if (e.status === 'pouso_emergencia' && i === 4) st = 'alert';
      return { label, st };
    });
  }

  const STEP_TEXT = { done: 'concluída', current: 'em andamento', todo: 'pendente', fail: 'sem drone elegível', alert: 'pouso de emergência' };

  function renderStatic(state, e) {
    const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
    $('summary').replaceChildren(...[
      el('div', { class: 'summary__id' }, [el('span', { class: 'mono summary__code', text: e.id }), el('span', { class: 'prio prio--' + e.prioridade, text: 'P' + e.prioridade + ' ' + ops.PRIORIDADES[e.prioridade] })]),
      el('dl', { class: 'summary__data' }, [
        el('div', {}, [el('dt', { text: 'Carga' }), el('dd', { text: e.carga + ' · ' + e.pesoKg + ' kg' })]),
        el('div', {}, [el('dt', { text: 'Rota' }), el('dd', { text: ops.findPoint(state, e.origemId).nome + ' → ' + ops.findPoint(state, e.destinoId).nome })]),
        el('div', {}, [el('dt', { text: 'Drone' }), el('dd', { class: 'mono', text: drone ? drone.nome + ' (' + drone.id + ')' : '—' })]),
        el('div', {}, [el('dt', { text: 'Status' }), el('dd', {}, el('span', { class: 'status status--' + e.status, text: ops.STATUS[e.status] }))])
      ]),
      e.motivo ? el('p', { class: 'summary__reason', text: e.motivo }) : null
    ].filter(Boolean));
    $('steps').replaceChildren(...steps(e).map((s, i) => el('li', { class: 'steps__item steps__item--' + s.st }, [
      el('span', { class: 'steps__n mono', text: String(i + 1).padStart(2, '0') }),
      el('span', { class: 'steps__label', text: s.label }),
      el('span', { class: 'visually-hidden', text: ' — ' + STEP_TEXT[s.st] })
    ])));

    const actions = { launch: e.status === 'atribuida', bateria: e.status === 'em_voo', motor: e.status === 'em_voo', grave: e.status === 'em_voo', temp: e.status === 'em_voo' && Boolean(e.faixaTemp) };
    doc.querySelectorAll('#safety-actions [data-action]').forEach((b) => { b.disabled = !actions[b.getAttribute('data-action')]; });
    $('safety-hint').textContent = e.status === 'em_voo'
      ? (e.faixaTemp ? '' : 'Esta carga não exige controle térmico; a demonstração de temperatura fica indisponível.')
      : (e.status === 'atribuida' ? 'Decole a entrega para liberar as demonstrações.' : 'Escolha uma entrega em voo para testar as contingências.');

    renderIncident(state, e);
    drawPoints(state, e);
    drawRoute(state, e);
  }

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
      el('p', { class: 'mono', text: 'Resgate da carga: equipe de solo ou outro drone acionado (referência: ' + zona.nome + ').' })
    );
  }

  function renderLive(state, e, now) {
    const r = ops.sensorReading(state, e, now);
    const pos = e.status === 'pouso_emergencia' ? { x: e.evento.x, y: e.evento.y } : (e.status === 'entregue' ? ops.findPoint(state, e.destinoId) : r);
    placeDrone(pos, e);
    const restante = e.status === 'em_voo' ? Math.max(0, Math.round((1 - r.progress) * e.duracaoMs / 1000)) : null;
    const temp = r.temp === null ? null : ops.checkTemperature(r.temp, e.faixaTemp);
    const items = [
      ['Bateria', r.bateria === null ? '—' : r.bateria + '%'],
      ['Posição', pos.x + ', ' + pos.y + ' km'],
      ['Temperatura', r.temp === null ? 'Sem controle térmico' : r.temp + ' °C'],
      ['Vibração', r.vibracao + ' g'],
      ['Progresso', Math.round(r.progress * 100) + '%'],
      ['Chegada em', restante === null ? '—' : restante + ' s (simulação)']
    ];
    $('telemetry').replaceChildren(...items.map(([k, v]) => el('div', { class: k === 'Temperatura' && temp && !temp.ok ? 'is-alert' : '' }, [el('dt', { text: k }), el('dd', { class: 'mono', text: v })])));
    const alert = $('temp-alert');
    const msg = temp && !temp.ok && e.status === 'em_voo' ? temp.mensagem : '';
    if (alert.textContent !== msg) alert.textContent = msg;
    alert.classList.toggle('is-visible', Boolean(msg));
    if (msg && !e.alertaTemp) store.update((s) => { const x = ops.byId(s.entregas, e.id); x.alertaTemp = true; ops.addLog(s, e.id + ': ' + msg, 'erro'); });
  }

  /* ---------- Seleção ---------- */
  function current(state) {
    let e = selectedId && ops.byId(state.entregas, selectedId);
    if (!e) e = state.entregas.find((x) => x.status === 'em_voo') || state.entregas.find((x) => x.droneId) || state.entregas[0];
    selectedId = e ? e.id : null;
    return e;
  }

  function fillSelect(state) {
    const sel = $('track-select');
    sel.replaceChildren(...state.entregas.map((e) => el('option', { value: e.id, text: e.id + ' · P' + e.prioridade + ' · ' + ops.STATUS[e.status] })));
    sel.value = selectedId;
  }

  let lastKey = '';
  function render(state) {
    const e = current(state);
    if (!e) return;
    const key = e.id + e.status + (e.droneId || '') + (e.evento ? 'ev' : '') + state.entregas.length;
    if (key !== lastKey) {
      fillSelect(state);
      renderStatic(state, e);
      lastKey = key;
    }
    renderLive(state, e, Date.now());
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

  $('track-select').addEventListener('change', (ev) => {
    selectedId = ev.target.value;
    root.history.replaceState(null, '', '?id=' + encodeURIComponent(selectedId));
    lastKey = '';
    render(store.get());
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
  doc.getElementById('busca').addEventListener('submit', (ev) => ev.preventDefault());

  drawGrid();
  store.subscribe((s) => { lastKey = ''; render(s); });
  render(store.get());
  setInterval(() => {
    const state = store.get();
    if (ops.tick(state, Date.now()).length) store.update(() => null);
    else render(state);
  }, 500);
})(window);
