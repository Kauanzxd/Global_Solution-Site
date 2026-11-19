/* SIDEC — Central de operações: fila filtrável, voo prioritário, drones em missão, autonomia, rota,
   alertas com reconhecimento, mapa da frota, pedidos e cenários de teste. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store, data } = SIDEC;
  const { el } = SIDEC.ui;

  const STATUS_ORDER = { em_voo: 0, atribuida: 1, fila: 2, pouso_emergencia: 3, outro_meio: 4, convencional: 5, entregue: 6 };
  const KM_POR_MIN = 0.8; // velocidade ilustrativa de cruzeiro (48 km/h)
  const $ = (id) => doc.getElementById(id);
  const place = (state, id) => (ops.findPoint(state, id) || { nome: id }).nome;
  const num = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const mmss = (s) => (s >= 60 ? Math.floor(s / 60) + ' min ' : '') + String(s % 60) + ' s';

  let filtro = 0;           // 0 = todas as prioridades
  let selectedDrone = null; // drone destacado no mapa e nos painéis de autonomia e rota
  const acked = new Set();  // alertas reconhecidos nesta sessão
  const batHistory = new Map();

  /* Recria uma lista só quando a estrutura muda: evita que leitores de tela reanunciem tudo
     a cada segundo e preserva o foco nos botões. Valores ao vivo são atualizados no lugar. */
  const lastKeys = {};
  function keyed(id, key, build) {
    if (lastKeys[id] === key) return false;
    lastKeys[id] = key;
    build();
    return true;
  }

  function statusBadge(status) {
    return el('span', { class: 'status status--' + status, text: ops.STATUS[status] });
  }

  /* Bateria ao vivo: durante o voo vem do sensor simulado; parado, do cadastro do drone. */
  function liveBattery(state, d, now) {
    const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
    if (e && e.status === 'em_voo') return ops.sensorReading(state, e, now).bateria;
    return d.bateria;
  }
  const remainingS = (e, now) => Math.max(0, Math.round((1 - ops.flightProgress(e, now)) * e.duracaoMs / 1000));

  /* ---------- Fila (lista compacta com filtro P1–P4) ---------- */
  function queueStatus(e, pos, now) {
    if (e.status === 'em_voo') return el('span', { class: 'qlist__eta mono qlist__eta--p' + e.prioridade, 'data-eta': e.id, text: mmss(remainingS(e, now)) });
    if (e.status === 'atribuida') return el('button', { type: 'button', class: 'btn btn--light btn--sm', 'data-launch': e.id, text: 'Decolar' });
    if (e.status === 'fila') return el('span', { class: 'qlist__state', text: '#' + pos + ' · aguarda drone' });
    return el('span', { class: 'qlist__state qlist__state--' + e.status, text: ops.STATUS[e.status].toLowerCase() });
  }

  function renderQueue(state, now) {
    const fila = ops.sortQueue(state);
    const pos = new Map(fila.map((e, i) => [e.id, i + 1]));
    const rows = state.entregas.slice().sort((a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.prioridade - b.prioridade || a.ordem - b.ordem);
    const shown = rows.filter((e) => !filtro || e.prioridade === filtro);
    $('fila-count').textContent = shown.length + ' de ' + rows.length;
    const key = filtro + '|' + shown.map((e) => e.id + e.status + (e.motivo || '') + (pos.get(e.id) || '')).join(',');
    if (!keyed('fila', key, () => $('queue-body').replaceChildren(...(shown.length ? shown.map((e) => el('li', { class: 'qlist__row qlist__row--' + e.status }, [
      el('span', { class: 'prio-chip prio-chip--' + e.prioridade, text: 'P' + e.prioridade }),
      el('a', { class: 'qlist__main', href: 'rastreamento.html?id=' + e.id }, [
        el('span', { class: 'qlist__title', text: e.carga }),
        el('span', { class: 'qlist__sub', text: e.id + ' · ' + place(state, e.origemId) + ' → ' + place(state, e.destinoId) })
      ]),
      queueStatus(e, pos.get(e.id), now),
      e.motivo ? el('p', { class: 'qlist__reason', text: e.motivo }) : null
    ])) : [el('li', { class: 'qlist__empty', text: 'Nenhuma entrega com essa prioridade.' })])))) {
      shown.filter((e) => e.status === 'em_voo').forEach((e) => {
        const n = doc.querySelector('[data-eta="' + e.id + '"]');
        if (n) n.textContent = mmss(remainingS(e, now));
      });
    }
  }

  /* ---------- Voo prioritário (cartão sobre o mapa / primeiro no celular) ---------- */
  function topFlight(state) {
    return state.entregas.filter((e) => e.status === 'em_voo').sort((a, b) => a.prioridade - b.prioridade || a.ordem - b.ordem)[0] || null;
  }

  function renderFlight(state, now) {
    const e = topFlight(state);
    const card = $('ops-flight');
    card.setAttribute('data-prio', e ? String(e.prioridade) : '0');
    $('flight-prio').className = 'prio-chip' + (e ? ' prio-chip--' + e.prioridade : '');
    $('flight-prio').textContent = e ? 'P' + e.prioridade : '—';
    $('flight-id').textContent = e ? e.id : 'sem voo';
    $('flight-title').textContent = e ? e.carga.split(' — ')[0] + ' · ' + place(state, e.origemId) + ' → ' + place(state, e.destinoId) : 'Nenhum voo agora';
    $('flight-label').textContent = e ? 'Chega em' : 'Processe a fila e decole uma entrega.';
    $('flight-eta').textContent = e ? mmss(remainingS(e, now)) : '';
    $('flight-bar').setAttribute('width', e ? String(Math.round(ops.flightProgress(e, now) * 100)) : '0');
    card.setAttribute('href', e ? 'rastreamento.html?id=' + e.id : 'rastreamento.html');
  }

  /* ---------- Drones em missão ---------- */
  function missionDrones(state) {
    return state.drones.filter((d) => d.entregaId && ['em_voo', 'atribuido'].includes(d.status));
  }

  function spark(id) {
    const h = batHistory.get(id) || [];
    const pts = h.map((v, i) => (h.length < 2 ? 0 : (i * 100 / (h.length - 1))).toFixed(1) + ',' + (40 - v * 0.4).toFixed(1)).join(' ');
    const last = h.length ? h[h.length - 1] : 0;
    return el('span', { class: 'missions__spark' }, svgEl('svg', { viewBox: '0 0 100 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
      svgEl('polyline', { points: pts }),
      svgEl('circle', { cx: '100', cy: (40 - last * 0.4).toFixed(1), r: '2.6' })
    ]));
  }

  function renderMissions(state, now) {
    const list = missionDrones(state);
    list.forEach((d) => {
      const h = batHistory.get(d.id) || [];
      const b = liveBattery(state, d, now);
      if (!h.length || h[h.length - 1] !== b) h.push(b);
      if (h.length > 30) h.shift();
      batHistory.set(d.id, h);
    });
    if (!selectedDrone || !list.some((d) => d.id === selectedDrone)) {
      const top = topFlight(state);
      selectedDrone = top ? top.droneId : (list[0] ? list[0].id : null);
    }
    const key = selectedDrone + '|' + list.map((d) => d.id + d.status + d.entregaId).join(',');
    if (!keyed('missoes', key, () => $('mission-list').replaceChildren(...(list.length ? list.map((d) => {
      const e = ops.byId(state.entregas, d.entregaId);
      const b = Math.round(liveBattery(state, d, now));
      return el('li', {}, el('button', { type: 'button', class: 'missions__card', 'aria-pressed': String(d.id === selectedDrone), 'data-drone': d.id, 'data-prio': String(e.prioridade) }, [
        el('span', { class: 'missions__top' }, [el('span', { class: 'mono missions__name', text: d.nome }), el('span', { class: 'prio-chip prio-chip--' + e.prioridade, text: 'P' + e.prioridade })]),
        spark(d.id),
        el('span', { class: 'missions__foot' }, [el('span', { text: d.status === 'em_voo' ? 'Em voo' : 'Aguarda decolagem' }), el('span', { class: 'mono', text: b + '%' })]),
        el('span', { class: 'missions__bar' }, svgEl('svg', { viewBox: '0 0 100 4', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [svgEl('rect', { width: '100', height: '4', rx: '2', class: 'missions__track' }), svgEl('rect', { width: String(b), height: '4', rx: '2', class: 'missions__fill' })]))
      ]));
    }) : [el('li', { class: 'qlist__empty', text: 'Nenhum drone em missão. Processe a fila para despachar.' })])))) {
      list.forEach((d) => {
        const card = doc.querySelector('[data-drone="' + d.id + '"]');
        if (!card) return;
        const fresh = spark(d.id).firstChild;
        card.querySelector('.missions__spark').replaceChildren(fresh);
        const b = Math.round(liveBattery(state, d, now));
        card.querySelector('.missions__foot .mono').textContent = b + '%';
        card.querySelector('.missions__fill').setAttribute('width', String(b));
      });
    }
  }

  /* ---------- Autonomia e rota do drone selecionado ---------- */
  function nearestZone(state, p) {
    return state.zonas.map((z) => ({ z, km: ops.distance(z, p) })).sort((a, b) => a.km - b.km)[0];
  }

  function dronePos(state, d, now) {
    const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
    if (e && e.status === 'em_voo' && e.trajeto) return ops.positionAt(e.trajeto, ops.flightProgress(e, now));
    if (e && e.status === 'pouso_emergencia' && e.evento) return { x: e.evento.x, y: e.evento.y };
    return { x: d.x, y: d.y };
  }

  function renderSelected(state, now) {
    const d = selectedDrone ? ops.byId(state.drones, selectedDrone) : null;
    const cells = $('aut-cells');
    if (!d) {
      $('aut-drone').textContent = '—';
      $('aut-big').textContent = 'Sem drone em missão';
      cells.setAttribute('aria-valuenow', '0');
      cells.querySelectorAll('span').forEach((c) => c.classList.remove('is-on'));
      $('aut-alt-km').textContent = '—';
      $('rota-dest').textContent = '—';
      $('rota-zona').textContent = '—';
      $('rota-eta').textContent = '—';
      $('rota-path').setAttribute('d', '');
      return;
    }
    const e = ops.byId(state.entregas, d.entregaId);
    const b = liveBattery(state, d, now);
    const alcanceMin = Math.round(b / d.consumoKm / KM_POR_MIN);
    const pos = dronePos(state, d, now);
    const nz = nearestZone(state, pos);
    $('aut-drone').textContent = d.nome;
    $('aut-big').textContent = Math.round(b) + '% · ' + alcanceMin + ' min';
    cells.setAttribute('aria-valuenow', String(Math.round(b)));
    cells.setAttribute('data-level', b < 35 ? 'low' : (b < 60 ? 'mid' : 'high'));
    cells.querySelectorAll('span').forEach((c, i) => c.classList.toggle('is-on', b > i * 20));
    $('aut-alt-km').textContent = num(nz.km) + ' km';
    $('aut-alt').textContent = 'Pouso alternativo · ' + nz.z.nome;

    $('rota-dest').textContent = e ? place(state, e.destinoId) : '—';
    $('rota-zona').textContent = nz.z.nome + ' a ' + num(nz.km) + ' km';
    const left = e && e.status === 'em_voo' ? remainingS(e, now) : null;
    $('rota-eta').textContent = left === null ? '—' : (left >= 60 ? Math.ceil(left / 60) : left);
    $('rota-eta-label').textContent = left === null ? 'aguarda decolagem' : (left >= 60 ? 'min para chegar' : 's para chegar');

    // Mini mapa: a rota do drone ajustada à caixa 100 × 160
    const pts = e && e.trajeto ? e.trajeto : [{ x: d.x, y: d.y }, ops.findPoint(state, e.origemId), ops.findPoint(state, e.destinoId)];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, (Math.max(...ys) - minY) * 100 / 160, 0.5);
    const map = (p) => ({ x: 12 + ((p.x - minX) / span) * 76, y: 14 + ((p.y - minY) / span) * 76 });
    $('rota-path').setAttribute('d', pts.map((p, i) => { const m = map(p); return (i ? 'L' : 'M') + m.x.toFixed(1) + ' ' + m.y.toFixed(1); }).join(' '));
    const m = map(pos);
    $('rota-dot').setAttribute('cx', m.x.toFixed(1));
    $('rota-dot').setAttribute('cy', m.y.toFixed(1));
  }

  /* ---------- Alertas (derivados do estado; reconhecer só esconde nesta sessão) ---------- */
  function alerts(state, now) {
    const list = [];
    state.entregas.forEach((e) => {
      if (e.status === 'outro_meio') list.push({ id: 'om-' + e.id, kind: 'alerta', label: 'Sem drone elegível · ' + e.id + ' · P' + e.prioridade, text: e.motivo || 'Indicar transporte alternativo.' });
      if (e.status === 'pouso_emergencia') list.push({ id: 'pe-' + e.id, kind: 'alerta', label: 'Pouso de emergência · ' + e.id, text: 'Ocorrência registrada. Resgate da carga e manutenção do drone.' });
      if (e.status === 'em_voo' && e.alertaTemp) list.push({ id: 'tp-' + e.id, kind: 'alerta', label: 'Temperatura · ' + e.id, text: 'Contêiner fora de 2–8 °C. Equipe médica avisada.' });
    });
    state.drones.forEach((d) => {
      const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
      if (e && e.status === 'em_voo') {
        const b = liveBattery(state, d, now);
        if (b < 35) list.push({ id: 'bt-' + d.id + '-' + e.id, kind: 'aviso', label: 'Bateria · ' + d.nome + ' · P' + e.prioridade, text: 'Abaixo de 35% — acompanhe a rota restante e o pouso alternativo.' });
      }
      if (d.status === 'aguardando_liberacao') list.push({ id: 'lb-' + d.id, kind: 'aviso', label: 'Aguardando liberação · ' + d.nome, text: 'Inspeção concluída. O drone só volta à frota depois de liberado.', release: d.id });
      if (d.status === 'manutencao') list.push({ id: 'mn-' + d.id, kind: 'info', label: 'Manutenção · ' + d.nome, text: 'Fora da frota até ser liberado pela equipe.' });
    });
    return list.filter((a) => !acked.has(a.id));
  }

  let lastAlertKey = '';
  function renderAlerts(state, now) {
    const list = alerts(state, now);
    const key = list.map((a) => a.id + a.text).join('|');
    $('alert-count').textContent = String(list.length);
    if (key === lastAlertKey) return; // não recria os botões a cada segundo (preserva o foco)
    lastAlertKey = key;
    $('alert-list').replaceChildren(...(list.length ? list.map((a) => el('li', { class: 'alerts__item alerts__item--' + a.kind }, [
      el('p', { class: 'alerts__label', text: a.label }),
      el('p', { class: 'alerts__text', text: a.text }),
      a.release
        ? el('button', { type: 'button', class: 'btn btn--light btn--sm', 'data-release': a.release, text: 'Liberar drone' })
        : el('button', { type: 'button', class: 'btn btn--light btn--sm', 'data-ack': a.id, text: 'Reconhecer' })
    ])) : [el('li', { class: 'qlist__empty', text: 'Nada pendente. Tudo sob controle.' })]));
  }

  /* ---------- Frota ---------- */
  function renderFleet(state) {
    const key = state.drones.map((d) => d.id + d.status + (d.entregaId || '')).join(',');
    if (!keyed('frota', key, () => $('fleet-list').replaceChildren(...state.drones.map((d) => {
      const filial = ops.byId(state.filiais, d.filialId);
      return el('li', { class: 'fleet__item fleet__item--' + d.status }, [
        el('div', { class: 'fleet__top' }, [
          el('span', { class: 'fleet__name', text: d.nome }),
          el('span', { class: 'fleet__id mono', text: d.id }),
          statusBadge(d.status)
        ]),
        el('div', { class: 'fleet__battery' }, [
          // bateria em 5 segmentos; a cor indica o nível (verde, âmbar, vermelho)
          el('span', {
            class: 'fleet__cells', role: 'meter', 'data-bat': d.id, 'aria-label': 'Bateria de ' + d.nome,
            'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(d.bateria)),
            'data-level': d.bateria < 35 ? 'low' : (d.bateria < 60 ? 'mid' : 'high')
          }, [0, 1, 2, 3, 4].map((i) => el('span', { class: 'fleet__cell' + (d.bateria > i * 20 ? ' is-on' : '') }))),
          el('span', { class: 'mono fleet__pct', text: Math.round(d.bateria) + '%' })
        ]),
        el('p', { class: 'fleet__meta mono', text: filial.nome + ' · carga máx. ' + d.cargaMaxKg + ' kg · ' + d.consumoKm + '%/km' + (d.entregaId ? ' · ' + d.entregaId : '') }),
        d.status === 'aguardando_liberacao'
          ? el('button', { type: 'button', class: 'btn btn--light btn--sm fleet__release', 'data-release': d.id, text: 'Liberar drone' })
          : null
      ]);
    })))) return;
    // bateria muda a cada segundo: atualiza só os segmentos e o percentual
    state.drones.forEach((d) => {
      const m = doc.querySelector('#fleet-list [data-bat="' + d.id + '"]');
      if (!m) return;
      const b = Math.round(d.bateria);
      m.setAttribute('aria-valuenow', String(b));
      m.setAttribute('data-level', d.bateria < 35 ? 'low' : (d.bateria < 60 ? 'mid' : 'high'));
      m.querySelectorAll('.fleet__cell').forEach((c, i) => c.classList.toggle('is-on', d.bateria > i * 20));
      m.nextElementSibling.textContent = b + '%';
    });
  }

  function renderLog(state) {
    const list = state.log || [];
    if (!list.length) {
      $('log-list').replaceChildren(el('li', { class: 'log__empty', text: 'Nenhuma decisão registrada ainda. Processe a fila ou rode um cenário.' }));
      return;
    }
    if (lastKeys.log === list.length + (list[0] && list[0].msg)) return;
    lastKeys.log = list.length + (list[0] && list[0].msg);
    $('log-list').replaceChildren(...list.slice(0, 14).map((l) => el('li', { class: 'log__item log__item--' + l.tipo, text: l.msg })));
  }

  /* ---------- Mapa da frota ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const K = 10; // unidades SVG por km (grade de 20 × 16 km)
  function svgEl(tag, attrs, children) {
    const node = doc.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    [].concat(children || []).forEach((c) => node.append(c));
    return node;
  }
  const svg = svgEl;
  const titled = (node, text) => { node.append(svg('title', {}, text)); return node; };

  function drawMapBase(state) {
    if (!$('fleet-map')) return;
    const grid = $('fleet-map-grid');
    for (let x = 0; x <= 20; x += 2) grid.append(svg('line', { x1: x * K, y1: 0, x2: x * K, y2: 160 }));
    for (let y = 0; y <= 16; y += 2) grid.append(svg('line', { x1: 0, y1: y * K, x2: 200, y2: y * K }));
    grid.append(svg('path', { class: 'map__river', d: 'M-10 128 C 40 110, 80 150, 130 126 S 190 96, 215 104' }));
    const nodes = [];
    state.zonas.forEach((z) => nodes.push(titled(svg('rect', { class: 'map__zona', x: z.x * K - 2, y: z.y * K - 2, width: 4, height: 4, rx: 1 }), 'Zona de pouso: ' + z.nome)));
    state.locais.filter((l) => l.tipo === 'hospital' || l.tipo === 'ubs').forEach((h) => nodes.push(titled(svg('g', { class: 'map__hospital', transform: 'translate(' + h.x * K + ' ' + h.y * K + ')' }, [
      svg('circle', { r: 2.6 }), svg('path', { d: 'M-1.3 0H1.3M0 -1.3V1.3' })
    ]), h.nome)));
    state.filiais.forEach((f) => nodes.push(titled(svg('g', { class: 'map__base', transform: 'translate(' + f.x * K + ' ' + f.y * K + ')' }, [
      svg('path', { d: 'M0 -3.6L3.2 2.4H-3.2Z' }), svg('text', { class: 'map__label map__label--base', y: 8 }, f.nome)
    ]), f.nome)));
    $('fleet-map-points').replaceChildren(...nodes);
  }

  // Cada drone tem um grupo fixo; só o translate muda, e o CSS anima a transição de 1 s.
  const droneNodes = new Map();
  function renderMap(state, now) {
    if (!$('fleet-map')) return;
    const routes = [];
    state.drones.forEach((d) => {
      const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
      const pos = dronePos(state, d, now);
      if (e && e.status === 'em_voo' && e.trajeto) {
        routes.push(svg('path', { class: 'map__route map__route--p' + e.prioridade + (d.id === selectedDrone ? ' is-selected' : ''), d: e.trajeto.map((p, i) => (i ? 'L' : 'M') + p.x * K + ' ' + p.y * K).join(' ') }));
      }
      let g = droneNodes.get(d.id);
      if (!g) {
        g = svg('g', { class: 'map__fleet-drone' }, [svg('circle', { class: 'map__fleet-halo', r: 5 }), svg('circle', { class: 'map__fleet-dot', r: 2.6 }), svg('text', { class: 'map__label map__label--drone', y: -5 }, d.nome.replace('SDC-', ''))]);
        g.append(svg('title', {}, d.nome));
        $('fleet-map-drones').append(g);
        droneNodes.set(d.id, g);
      }
      g.setAttribute('transform', 'translate(' + (pos.x * K).toFixed(1) + ' ' + (pos.y * K).toFixed(1) + ')');
      g.setAttribute('data-status', d.status);
      g.classList.toggle('is-selected', d.id === selectedDrone);
    });
    $('fleet-map-routes').replaceChildren(...routes);
  }

  function render(state) {
    const now = Date.now();
    const clock = $('ops-clock');
    if (clock) clock.textContent = new Date(now).toLocaleTimeString('pt-BR');
    renderMissions(state, now);
    renderMap(state, now);
    renderFlight(state, now);
    renderQueue(state, now);
    renderSelected(state, now);
    renderAlerts(state, now);
    renderFleet(state);
    renderLog(state);
  }

  /* ---------- Formulário de nova solicitação ---------- */
  function fillPlaces(state) {
    const opts = (filter) => state.filiais.map((f) => ['Base · ' + f.nome, f.id])
      .concat(state.locais.filter(filter).map((l) => [l.nome, l.id]))
      .map(([label, id]) => el('option', { value: id, text: label }));
    $('o-origem').replaceChildren(...opts(() => true));
    $('o-destino').replaceChildren(...state.locais.map((l) => el('option', { value: l.id, text: l.nome })));
    $('o-origem').value = 'FA-01';
    $('o-destino').value = 'B-02';
  }

  function initForm() {
    const form = $('order-form');
    const msg = $('order-msg');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const nova = store.update((s) => ops.createOrder(s, Object.fromEntries(fd.entries())));
        msg.className = 'form-msg is-ok';
        msg.textContent = nova.id + ' registrada como P' + nova.prioridade + '. Clique em "Processar fila" para despachar.';
        form.elements.carga.value = '';
      } catch (err) {
        msg.className = 'form-msg is-error';
        msg.textContent = err.message;
      }
    });
  }

  /* ---------- Cenários de teste ---------- */
  function only(state, keep) {
    state.drones.forEach((d) => { if (!keep.includes(d.id)) Object.assign(d, { status: 'manutencao', entregaId: null }); });
  }

  function newOrder(state, fields) {
    return ops.createOrder(state, Object.assign({ solicitante: 'Cenário de teste' }, fields));
  }

  const SCENARIOS = [
    {
      id: 'orgao-sem-autonomia',
      titulo: 'Órgão sem autonomia suficiente',
      regra: 'Órgão só decola se bateria ≥ consumo × 1,3.',
      run(now) {
        const s = data.base();
        s.entregas = [];
        s.drones.forEach((d) => Object.assign(d, { status: 'disponivel', bateria: 60 }));
        const e = newOrder(s, { prioridade: 1, carga: 'Rim para transplante', pesoKg: 1.5, origemId: 'H-01', destinoId: 'H-03' });
        return { s, r: ops.dispatch(s, e.id), alvo: e.id, now };
      }
    },
    {
      id: 'p1-reorganiza',
      titulo: 'P1 reorganiza comercial não decolado',
      regra: 'P1/P2 podem realocar o drone de uma entrega P4 ainda em solo.',
      run(now) {
        const s = data.base();
        data.assign(s, 'SDC-0004', 'D-04');
        only(s, ['D-04']);
        const e = newOrder(s, { prioridade: 1, carga: 'Córnea para transplante', pesoKg: 0.5, origemId: 'CT-01', destinoId: 'H-04' });
        return { s, r: ops.dispatch(s, e.id), alvo: e.id, now };
      }
    },
    {
      id: 'voo-protegido',
      titulo: 'Comercial em voo não é interrompido',
      regra: 'Entrega em voo é concluída antes de qualquer realocação.',
      run(now) {
        const s = data.base();
        data.assign(s, 'SDC-0003', 'D-05');
        ops.launch(s, 'SDC-0003', now);
        only(s, ['D-05']);
        const e = newOrder(s, { prioridade: 1, carga: 'Coração para transplante', pesoKg: 1, origemId: 'CT-01', destinoId: 'H-02' });
        return { s, r: ops.dispatch(s, e.id), alvo: e.id, now };
      }
    },
    {
      id: 'indisponivel',
      titulo: 'Drone indisponível é ignorado',
      regra: 'Drones em manutenção ou ocupados não recebem missão.',
      run(now) {
        const s = data.base();
        s.entregas = [];
        ops.byId(s.drones, 'D-02').status = 'manutencao';
        const e = newOrder(s, { prioridade: 3, carga: 'Insulina — uso contínuo', pesoKg: 0.4, origemId: 'FA-01', destinoId: 'B-03' });
        return { s, r: ops.dispatch(s, e.id), alvo: e.id, now };
      }
    },
    {
      id: 'pane',
      titulo: 'Pane e pouso seguro',
      regra: 'Falha de motor: pouso na zona segura mais próxima da rota.',
      link: 'Abrir no rastreamento',
      run(now) {
        const s = data.createSeed(now);
        return { s, r: { ok: true, motivo: 'SDC-0003 está em voo. No rastreamento, use "Falha de motor" ou "Falha grave".' }, alvo: 'SDC-0003', now };
      }
    },
    {
      id: 'temperatura',
      titulo: 'Temperatura fora da faixa',
      regra: 'Fora de 2–8 °C, a equipe médica recebe alerta.',
      link: 'Ver alerta no rastreamento',
      run(now) {
        const s = data.base();
        s.entregas = [];
        const e = newOrder(s, { prioridade: 1, carga: 'Fígado para transplante', pesoKg: 1.5, origemId: 'CT-01', destinoId: 'H-02' });
        const r = ops.dispatch(s, e.id);
        ops.launch(s, e.id, now);
        e.tempOffset = 6;
        const leitura = ops.sensorReading(s, e, now);
        const t = ops.checkTemperature(leitura.temp, e.faixaTemp);
        ops.addLog(s, e.id + ': ' + t.mensagem, 'erro');
        e.alertaTemp = true;
        return { s, r: Object.assign(r, { ok: false, motivo: t.mensagem, rejeitados: [] }), alvo: e.id, now };
      }
    }
  ];

  function renderScenarioResult(sc, out) {
    const box = $('scenario-result');
    const outcome = out.r.ok ? 'is-ok' : 'is-alert';
    const lines = [
      el('p', { class: 'scenario-result__title', text: sc.titulo }),
      el('p', { class: 'scenario-result__rule mono', text: 'Regra: ' + sc.regra }),
      el('p', { class: 'scenario-result__outcome ' + outcome, text: out.r.motivo || (out.r.preemptedId
        ? out.alvo + ' recebeu ' + out.r.droneId + '. ' + out.r.preemptedId + ' voltou para a fila.'
        : out.alvo + ' atribuída a ' + out.r.droneId + '.') })
    ];
    if (out.r.rejeitados && out.r.rejeitados.length) {
      lines.push(el('ul', { class: 'scenario-result__list mono' }, out.r.rejeitados.map((x) => el('li', { text: x.droneId + ': ' + x.motivo }))));
    }
    lines.push(el('a', { class: 'scenario-result__link', href: 'rastreamento.html?id=' + out.alvo, text: (sc.link || 'Ver ' + out.alvo + ' no rastreamento') + ' →' }));
    box.replaceChildren(...lines);
  }

  function initScenarios() {
    $('scenario-list').replaceChildren(...SCENARIOS.map((sc, i) => el('button', {
      type: 'button', class: 'scenario',
      onclick: () => {
        const out = sc.run(Date.now());
        store.reset(() => out.s);
        renderScenarioResult(sc, out);
      }
    }, [el('span', { class: 'scenario__n mono', text: String(i + 1).padStart(2, '0') }), el('span', { text: sc.titulo })])));
  }

  /* ---------- Ações globais ---------- */
  function initActions() {
    $('btn-processar').addEventListener('click', () => {
      const results = store.update((s) => ops.processQueue(s));
      const ok = results.filter((r) => r.ok).length;
      $('ops-msg').replaceChildren(el('p', { class: 'scenario-result__outcome is-ok', text: results.length
        ? ok + ' de ' + results.length + ' pedidos despachados. Veja o registro de decisões.'
        : 'Fila vazia: nada para processar.' }));
    });
    $('btn-reset').addEventListener('click', () => {
      store.reset();
      acked.clear();
      $('ops-msg').replaceChildren(el('p', { class: 'scenario-result__outcome is-ok', text: 'Dados iniciais restaurados.' }));
    });
    $('btn-tour').addEventListener('click', () => SIDEC.bot.startTour());
    $('fila-filtro').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      filtro = Number(b.getAttribute('data-filtro'));
      $('fila-filtro').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderQueue(store.get(), Date.now());
    });
    $('mission-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-drone]');
      if (!b) return;
      selectedDrone = b.getAttribute('data-drone');
      render(store.get());
    });
    doc.addEventListener('click', (e) => {
      const b = e.target.closest('[data-release]');
      if (!b) return;
      const r = store.update((s) => ops.releaseDrone(s, b.getAttribute('data-release'), Date.now()));
      $('ops-msg').replaceChildren(el('p', { class: 'scenario-result__outcome ' + (r.ok ? 'is-ok' : 'is-alert'), text: r.ok ? 'Drone liberado e devolvido à frota. Evento registrado no histórico.' : r.motivo }));
      $('fleet-list').focus();
    });
    $('alert-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ack]');
      if (!b) return;
      acked.add(b.getAttribute('data-ack'));
      renderAlerts(store.get(), Date.now());
    });
    $('queue-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-launch]');
      if (btn) store.update((s) => ops.launch(s, btn.getAttribute('data-launch'), Date.now()));
    });
  }

  /* Relógio da simulação: conclui voos e atualiza o progresso. */
  function loop() {
    if (document.hidden) return; // aba oculta: não gasta CPU; o estado é recalculado ao voltar
    const state = store.get();
    if (ops.tick(state, Date.now()).length) store.update(() => null);
    else render(state);
  }

  const initial = store.get();
  drawMapBase(initial);
  fillPlaces(initial);
  initForm();
  initScenarios();
  initActions();
  store.subscribe(render);
  render(initial);
  setInterval(loop, 1000);
})(window);
