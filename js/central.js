/* SIDEC — Central de operações: troca entre rede real (API) e simulação, peças visuais comuns
   (indicadores, fila, cartões de drone, alertas, registro) e o painel da simulação
   (mapa esquemático, nova solicitação e cenários de teste das regras). O painel da rede real fica em central-api.js. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store, data } = SIDEC;
  const { el } = SIDEC.ui;

  const $ = (id) => doc.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const STATUS_ORDER = { em_voo: 0, atribuida: 1, fila: 2, pouso_emergencia: 3, outro_meio: 4, convencional: 5, entregue: 6 };
  const KM_POR_MIN = 60000 / ops.SIM_MS_PER_KM; // velocidade de cruzeiro da simulação (48 km/h)
  const place = (state, id) => (ops.findPoint(state, id) || { nome: id }).nome;
  const num = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const mmss = (s) => (s >= 60 ? Math.floor(s / 60) + ' min ' : '') + String(s % 60).padStart(2, '0') + ' s';
  const nivel = (b) => (b < 35 ? 'low' : (b < 60 ? 'mid' : 'high'));

  function svg(tag, attrs, children) {
    const node = doc.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    [].concat(children || []).forEach((c) => node.append(c));
    return node;
  }

  /* ===================== Peças visuais comuns (usadas também por central-api.js) ===================== */
  const MODO_KEY = 'sadec_central_modo';
  const ui = {
    modo: () => doc.body.getAttribute('data-modo'),
    filtro: 0,

    /* Troca de modo: o CSS mostra só os painéis do modo ativo; cada módulo redesenha os comuns. */
    definirModo(m, lembrar) {
      doc.body.setAttribute('data-modo', m);
      doc.querySelectorAll('.cx-modo [data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-modo') === m)));
      $('mapa-hint').textContent = m === 'real' ? 'Ruas de São Paulo · posição estimada' : 'Cidade-modelo da simulação';
      $('frota-hint').textContent = m === 'real' ? 'Drones gravados no banco da Central' : 'Toque num drone para destacá-lo no mapa';
      ui.mensagem('');
      if (lembrar) { try { root.localStorage.setItem(MODO_KEY, m); } catch { /* sem armazenamento: só nesta visita */ } }
      doc.dispatchEvent(new root.CustomEvent('cx:modo', { detail: m }));
    },
    modoSalvo() {
      try { return root.localStorage.getItem(MODO_KEY); } catch { return null; }
    },

    mensagem(texto, ok) {
      $('ops-msg').replaceChildren(...(texto ? [el('p', { class: 'cx-msg__text ' + (ok === false ? 'is-alert' : 'is-ok'), text: texto })] : []));
    },

    barra(f, classe) {
      return svg('svg', { viewBox: '0 0 100 6', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
        svg('rect', { width: '100', height: '6', rx: '3', class: 'cx-bar__track' }),
        svg('rect', { width: String(Math.max(0, Math.min(100, Math.round(f * 100)))), height: '6', rx: '3', class: 'cx-bar__fill ' + (classe || '') })
      ]);
    },

    /* Indicadores do topo */
    kpis({ voo, vooSub, fila, prios, livres, total, frotaSub, alertas, alertasSub }) {
      $('kpi-voo').textContent = String(voo);
      $('kpi-voo-sub').textContent = vooSub;
      $('kpi-fila').textContent = String(fila);
      $('kpi-fila-prio').replaceChildren(...[1, 2, 3, 4].map((p) => el('li', { class: 'cx-kpi__prio' + (prios[p] ? '' : ' is-zero') }, [
        el('span', { class: 'prio-chip prio-chip--' + p, text: 'P' + p }), el('span', { class: 'mono', text: String(prios[p] || 0) })
      ])));
      $('kpi-frota').textContent = String(livres);
      $('kpi-frota-total').textContent = '/' + total;
      $('kpi-frota-sub').textContent = frotaSub;
      $('kpi-alertas').textContent = String(alertas);
      $('kpi-alertas-sub').textContent = alertasSub;
      doc.querySelector('.cx-kpi--alerta').classList.toggle('is-ativo', alertas > 0);
    },

    /* Cartão do voo mais prioritário, sobre o mapa */
    voo(v) {
      const card = $('ops-flight');
      card.setAttribute('data-prio', v ? String(v.prio) : '0');
      $('flight-prio').className = 'prio-chip' + (v ? ' prio-chip--' + v.prio : '');
      $('flight-prio').textContent = v ? 'P' + v.prio : '—';
      $('flight-id').textContent = v ? v.id : 'sem voo';
      $('flight-title').textContent = v ? v.titulo : 'Nenhum voo agora';
      $('flight-label').textContent = v ? v.label : 'Processe a fila: órgãos decolam pelo operador; as demais saem sozinhas.';
      $('flight-eta').textContent = v ? v.eta : '';
      $('flight-bar').setAttribute('width', v ? String(Math.round(v.f * 100)) : '0');
      card.setAttribute('href', v ? 'rastreamento.html?id=' + encodeURIComponent(v.id) : 'rastreamento.html');
    },

    /* Linha da fila: prioridade, carga, rota, estado e a ação possível agora */
    linhaFila({ id, prio, titulo, sub, estado, estadoClasse, acao, motivo, ativo, eta }) {
      return el('li', { class: 'cx-q' + (ativo ? ' is-ativo' : ''), 'data-id': id }, [
        el('span', { class: 'prio-chip prio-chip--' + prio, text: 'P' + prio }),
        el('button', { type: 'button', class: 'cx-q__main', 'data-focar': id }, [
          el('span', { class: 'cx-q__title', text: titulo }),
          el('span', { class: 'cx-q__sub', text: sub })
        ]),
        el('span', { class: 'cx-q__side' }, [
          el('span', { class: 'cx-q__estado ' + (estadoClasse || ''), text: estado }),
          eta ? el('span', { class: 'cx-q__eta mono', 'data-eta': id, text: eta }) : null
        ]),
        acao || el('a', { class: 'cx-q__go', href: 'rastreamento.html?id=' + encodeURIComponent(id), 'aria-label': 'Rastrear ' + id, text: '→' }),
        motivo ? el('p', { class: 'cx-q__reason', text: motivo }) : null
      ]);
    },
    vazio(texto) {
      return el('li', { class: 'cx-empty', text: texto });
    },

    /* Cartão de drone: bateria com nível de cor, autonomia e missão; atualizado no lugar a cada segundo */
    cartaoDrone({ id, nome, codigo, status, statusTxt, bateria, meta, missao, acao, ativo }) {
      return el('li', { class: 'cx-drone' + (ativo ? ' is-ativo' : ''), 'data-drone': id, 'data-status': status }, [
        el('button', { type: 'button', class: 'cx-drone__sel', 'data-sel-drone': id, 'aria-pressed': String(Boolean(ativo)) }, [
          el('span', { class: 'cx-drone__nome', text: nome }),
          el('span', { class: 'cx-drone__id mono', text: codigo }),
          el('span', { class: 'status status--' + status, text: statusTxt })
        ]),
        el('div', { class: 'cx-drone__bat', role: 'meter', 'aria-label': 'Bateria de ' + nome, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(bateria)), 'data-level': nivel(bateria) }, [
          el('span', { class: 'cx-drone__barra' }, ui.barra(bateria / 100, 'cx-bar__fill--bat')),
          el('span', { class: 'cx-drone__pct mono', text: num(bateria) + '%' })
        ]),
        el('p', { class: 'cx-drone__meta', text: meta }),
        missao ? el('p', { class: 'cx-drone__missao', text: missao }) : null,
        acao || null
      ]);
    },
    atualizarDrone(id, bateria, meta, missao) {
      const li = doc.querySelector('#fleet-list [data-drone="' + id + '"]');
      if (!li) return;
      const m = li.querySelector('.cx-drone__bat');
      m.setAttribute('aria-valuenow', String(Math.round(bateria)));
      m.setAttribute('data-level', nivel(bateria));
      li.querySelector('.cx-bar__fill').setAttribute('width', String(Math.max(0, Math.min(100, Math.round(bateria)))));
      li.querySelector('.cx-drone__pct').textContent = num(bateria) + '%';
      li.querySelector('.cx-drone__meta').textContent = meta;
      const ms = li.querySelector('.cx-drone__missao');
      if (ms && missao) ms.textContent = missao;
    },

    alerta({ id, kind, label, text, acao }) {
      return el('li', { class: 'cx-alert cx-alert--' + kind }, [
        el('span', { class: 'cx-alert__icon', 'aria-hidden': 'true' }),
        el('div', { class: 'cx-alert__body' }, [el('p', { class: 'cx-alert__label', text: label }), el('p', { class: 'cx-alert__text', text: text })]),
        acao || el('button', { type: 'button', class: 'btn btn--ghost-light btn--sm', 'data-ack': id, text: 'Reconhecer' })
      ]);
    },

    log(itens) {
      $('log-list').replaceChildren(...(itens.length ? itens.map((l) => el('li', { class: 'cx-logi cx-logi--' + (l.tipo || 'info') }, [
        l.hora ? el('span', { class: 'cx-logi__hora mono', text: l.hora }) : null,
        el('span', { class: 'cx-logi__msg', text: l.msg })
      ])) : [el('li', { class: 'cx-empty', text: 'Nenhuma decisão registrada ainda. Processe a fila ou rode um cenário.' })]));
    },

    mmss, num, nivel
  };
  SIDEC.central = ui;

  /* ===================== Simulação ===================== */
  let selectedDrone = null;
  const acked = new Set();  // alertas reconhecidos nesta sessão
  let lastKeys = {};
  function keyed(id, key, build) {
    if (lastKeys[id] === key) return false;
    lastKeys[id] = key;
    build();
    return true;
  }
  const ativo = () => ui.modo() === 'sim';

  /* Bateria ao vivo: durante o voo vem do sensor simulado; parado, do cadastro do drone. */
  function liveBattery(state, d, now) {
    const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
    if (e && e.status === 'em_voo') return ops.sensorReading(state, e, now).bateria;
    return d.bateria;
  }
  // segundos da operação (tempo realista); a espera real é ESCALA_TEMPO vezes menor
  const remainingS = (e, now) => Math.max(0, Math.round((1 - ops.flightProgress(e, now)) * e.duracaoMs * ops.ESCALA_TEMPO / 1000));
  /* P2 comum, P3 e P4 saem sozinhos: preparo da loja e intervalo de 5 min entre saídas da filial */
  function saidaSim(state, e, now) {
    if (e.preparoAte > now) return 'Preparo: ' + Math.ceil((e.preparoAte - now) * ops.ESCALA_TEMPO / 60000) + ' min';
    const falta = ops.proximaSaida(state, ops.byId(state.drones, e.droneId)) - now;
    return falta > 0 ? 'Sai em ' + Math.ceil(falta * ops.ESCALA_TEMPO / 60000) + ' min' : 'Saindo agora';
  }

  function topFlight(state) {
    return state.entregas.filter((e) => e.status === 'em_voo').sort((a, b) => a.prioridade - b.prioridade || a.ordem - b.ordem)[0] || null;
  }

  function alerts(state, now) {
    const list = [];
    state.entregas.forEach((e) => {
      if (e.status === 'outro_meio') list.push({ id: 'om-' + e.id, kind: 'alerta', label: 'Sem drone elegível · ' + e.id + ' · P' + e.prioridade, text: e.motivo || 'Indicar transporte alternativo.' });
      if (e.status === 'pouso_emergencia') list.push({ id: 'pe-' + e.id, kind: 'alerta', label: 'Pouso de emergência · ' + e.id, text: 'Ocorrência registrada. Resgate da carga e manutenção do drone.' });
      if (e.status === 'em_voo' && e.alertaTemp) list.push({ id: 'tp-' + e.id, kind: 'alerta', label: 'Temperatura · ' + e.id, text: 'Contêiner fora de 2–8 °C. Equipe médica avisada.' });
    });
    state.drones.forEach((d) => {
      const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
      if (e && e.status === 'em_voo' && liveBattery(state, d, now) < 35) {
        list.push({ id: 'bt-' + d.id + '-' + e.id, kind: 'aviso', label: 'Bateria baixa · ' + d.nome + ' · P' + e.prioridade, text: 'Abaixo de 35%: acompanhe a rota restante e o pouso alternativo.' });
      }
      if (d.status === 'aguardando_liberacao') list.push({ id: 'lb-' + d.id, kind: 'aviso', label: 'Aguardando liberação · ' + d.nome, text: 'Inspeção concluída. O drone só volta à frota depois de liberado.', release: d.id });
      if (d.status === 'manutencao') list.push({ id: 'mn-' + d.id, kind: 'info', label: 'Manutenção · ' + d.nome, text: 'Fora da frota até ser liberado pela equipe.' });
    });
    return list.filter((a) => !acked.has(a.id));
  }

  function renderKpis(state, now, lista) {
    const voo = state.entregas.filter((e) => e.status === 'em_voo');
    const espera = state.entregas.filter((e) => e.status === 'fila' || e.status === 'atribuida');
    const prios = {};
    espera.forEach((e) => { prios[e.prioridade] = (prios[e.prioridade] || 0) + 1; });
    const livres = state.drones.filter((d) => d.status === 'disponivel');
    const media = livres.length ? Math.round(livres.reduce((s, d) => s + d.bateria, 0) / livres.length) : 0;
    const top = topFlight(state);
    ui.kpis({
      voo: voo.length,
      vooSub: top ? 'Mais urgente: ' + top.id + ' · chega em ' + mmss(remainingS(top, now)) : 'Nenhum drone no ar',
      fila: espera.length, prios,
      livres: livres.length, total: state.drones.length,
      frotaSub: livres.length ? 'Bateria média dos livres: ' + media + '%' : 'Nenhum drone livre agora',
      alertas: lista.length,
      alertasSub: lista.length ? lista[0].label : 'Tudo sob controle'
    });
  }

  function renderFlight(state, now) {
    const e = topFlight(state);
    ui.voo(e ? {
      prio: e.prioridade, id: e.id,
      titulo: e.carga.split(' — ')[0] + ' · ' + place(state, e.origemId) + ' → ' + place(state, e.destinoId),
      label: 'Chega em', eta: mmss(remainingS(e, now)), f: ops.flightProgress(e, now)
    } : null);
  }

  function estadoSim(e, pos) {
    if (e.status === 'em_voo') return 'em voo';
    if (e.status === 'atribuida') return 'drone reservado';
    if (e.status === 'fila') return '#' + pos + ' na fila';
    return ops.STATUS[e.status].toLowerCase();
  }

  function renderQueue(state, now) {
    const fila = ops.sortQueue(state);
    const pos = new Map(fila.map((e, i) => [e.id, i + 1]));
    const rows = state.entregas.slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.prioridade - b.prioridade || a.ordem - b.ordem);
    const shown = rows.filter((e) => !ui.filtro || e.prioridade === ui.filtro);
    $('fila-count').textContent = shown.length + ' de ' + rows.length;
    const sel = selectedDrone ? (ops.byId(state.drones, selectedDrone) || {}).entregaId : null;
    const key = 'sim|' + ui.filtro + '|' + sel + '|' + shown.map((e) => e.id + e.status + (e.motivo || '') + (pos.get(e.id) || '')).join(',');
    const built = keyed('fila', key, () => $('queue-body').replaceChildren(...(shown.length ? shown.map((e) => ui.linhaFila({
      id: e.id, prio: e.prioridade, titulo: e.carga, ativo: e.id === sel,
      sub: e.id + ' · ' + place(state, e.origemId) + ' → ' + place(state, e.destinoId),
      estado: estadoSim(e, pos.get(e.id)), estadoClasse: 'is-' + e.status,
      eta: e.status === 'em_voo' ? mmss(remainingS(e, now)) : null,
      acao: e.status !== 'atribuida' ? null : (e.decolagemManual
        ? el('button', { type: 'button', class: 'btn btn--light btn--sm', 'data-launch': e.id, text: 'Decolar' })
        : el('span', { class: 'cx-q__auto', 'data-saida': e.id, title: 'Saída automática: 5 min entre saídas da filial', text: saidaSim(state, e, now) })),
      motivo: e.motivo
    })) : [ui.vazio('Nenhuma entrega com essa prioridade.')])));
    if (!built) {
      shown.filter((e) => e.status === 'em_voo').forEach((e) => {
        const n = doc.querySelector('[data-eta="' + e.id + '"]');
        if (n) n.textContent = mmss(remainingS(e, now));
      });
      shown.filter((e) => e.status === 'atribuida' && !e.decolagemManual).forEach((e) => {
        const n = doc.querySelector('[data-saida="' + e.id + '"]');
        if (n) n.textContent = saidaSim(state, e, now);
      });
    }
  }

  function metaDrone(state, d, b) {
    const filial = ops.byId(state.filiais, d.filialId);
    return filial.nome + ' · ' + d.cargaMaxKg + ' kg · ~' + Math.round(b / d.consumoKm / KM_POR_MIN) + ' min de voo';
  }
  function missaoDrone(state, d, now) {
    const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
    if (!e) return null;
    return 'P' + e.prioridade + ' · ' + e.id + ' → ' + place(state, e.destinoId) + (e.status === 'em_voo' ? ' · chega em ' + mmss(remainingS(e, now)) : (e.decolagemManual ? ' · aguarda decolagem do operador' : ' · saída automática'));
  }

  function renderFleet(state, now) {
    const key = 'sim|' + selectedDrone + '|' + state.drones.map((d) => d.id + d.status + (d.entregaId || '')).join(',');
    if (keyed('frota', key, () => $('fleet-list').replaceChildren(...state.drones.map((d) => {
      const b = liveBattery(state, d, now);
      return ui.cartaoDrone({
        id: d.id, nome: d.nome, codigo: d.id, status: d.status, statusTxt: ops.STATUS[d.status], bateria: b, ativo: d.id === selectedDrone,
        meta: metaDrone(state, d, b), missao: missaoDrone(state, d, now),
        acao: d.status === 'aguardando_liberacao' ? el('button', { type: 'button', class: 'btn btn--light btn--sm cx-drone__acao', 'data-release': d.id, text: 'Liberar drone' }) : null
      });
    })))) return;
    state.drones.forEach((d) => {
      const b = liveBattery(state, d, now);
      ui.atualizarDrone(d.id, b, metaDrone(state, d, b), missaoDrone(state, d, now));
    });
  }

  let lastAlertKey = '';
  function renderAlerts(list) {
    const key = 'sim|' + list.map((a) => a.id + a.text).join('|');
    $('alert-count').textContent = String(list.length);
    if (key === lastAlertKey) return; // não recria os botões a cada segundo (preserva o foco)
    lastAlertKey = key;
    $('alert-list').replaceChildren(...(list.length ? list.map((a) => ui.alerta(Object.assign({}, a, {
      acao: a.release ? el('button', { type: 'button', class: 'btn btn--light btn--sm', 'data-release': a.release, text: 'Liberar drone' }) : null
    }))) : [ui.vazio('Nada pendente. Tudo sob controle.')]));
  }

  function renderLog(state) {
    const list = state.log || [];
    const key = list.length + '|' + (list[0] && list[0].msg);
    if (lastKeys.log === key) return;
    lastKeys.log = key;
    ui.log(list.slice(0, 18));
  }

  /* ---------- Mapa esquemático da cidade-modelo ---------- */
  const K = 10; // unidades SVG por km (grade de 20 × 16 km)
  const titled = (node, text) => { node.append(svg('title', {}, text)); return node; };
  function drawMapBase(state) {
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

  function dronePos(state, d, now) {
    const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
    if (e && e.status === 'em_voo' && e.trajeto) return ops.positionAt(e.trajeto, ops.flightProgress(e, now));
    if (e && e.status === 'pouso_emergencia' && e.evento) return { x: e.evento.x, y: e.evento.y };
    return { x: d.x, y: d.y };
  }

  // Cada drone tem um grupo fixo; só o translate muda, e o CSS anima a transição de 1 s.
  const droneNodes = new Map();
  function renderMap(state, now) {
    const routes = [];
    state.drones.forEach((d) => {
      const e = d.entregaId ? ops.byId(state.entregas, d.entregaId) : null;
      const pos = dronePos(state, d, now);
      if (e && e.status === 'em_voo' && e.trajeto) {
        routes.push(svg('path', { class: 'map__route map__route--p' + e.prioridade + (d.id === selectedDrone ? ' is-selected' : ''), d: e.trajeto.map((p, i) => (i ? 'L' : 'M') + p.x * K + ' ' + p.y * K).join(' ') }));
      }
      let g = droneNodes.get(d.id);
      if (!g) {
        g = svg('g', { class: 'map__fleet-drone', 'data-sel-drone': d.id }, [svg('circle', { class: 'map__fleet-halo', r: 5 }), svg('circle', { class: 'map__fleet-dot', r: 2.6 }), svg('text', { class: 'map__label map__label--drone', y: -5 }, d.nome.replace('SDC-', ''))]);
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
    const clock = $('ops-clock');
    clock.textContent = new Date().toLocaleTimeString('pt-BR');
    if (!ativo()) return;
    const now = Date.now();
    const lista = alerts(state, now);
    renderKpis(state, now, lista);
    renderMap(state, now);
    renderFlight(state, now);
    renderQueue(state, now);
    renderFleet(state, now);
    renderAlerts(lista);
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
      regra: 'Só decola se bateria ≥ ida e volta × 1,3.',
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
    lines.push(el('a', { class: 'scenario-result__link', href: 'rastreamento.html?id=' + out.alvo, text: sc.link || 'Ver ' + out.alvo + ' no rastreamento' }));
    $('scenario-result').replaceChildren(...lines);
  }

  function initScenarios() {
    $('scenario-list').replaceChildren(...SCENARIOS.map((sc) => el('button', {
      type: 'button', class: 'cx-scenario',
      onclick: () => {
        const out = sc.run(Date.now());
        store.reset(() => out.s);
        renderScenarioResult(sc, out);
      }
    }, [el('span', { class: 'cx-scenario__t', text: sc.titulo }), el('span', { class: 'cx-scenario__r', text: sc.regra })])));
  }

  /* ---------- Ações ---------- */
  function initActions() {
    $('btn-processar').addEventListener('click', () => {
      if (!ativo()) return;
      const results = store.update((s) => ops.processQueue(s));
      const ok = results.filter((r) => r.ok).length;
      ui.mensagem(results.length ? ok + ' de ' + results.length + ' pedidos despachados. Veja o registro de decisões.' : 'Fila vazia: nada para processar.', true);
    });
    $('btn-reset').addEventListener('click', () => {
      store.reset();
      acked.clear();
      ui.mensagem('Dados iniciais da simulação restaurados.', true);
    });
    $('btn-tour').addEventListener('click', () => SIDEC.bot.startTour());
    doc.querySelector('.cx-modo').addEventListener('click', (e) => {
      const b = e.target.closest('[data-modo]');
      if (b && !b.disabled) ui.definirModo(b.getAttribute('data-modo'), true);
    });
    $('fila-filtro').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      ui.filtro = Number(b.getAttribute('data-filtro'));
      $('fila-filtro').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      doc.dispatchEvent(new root.CustomEvent('cx:filtro'));
    });
    doc.addEventListener('cx:filtro', () => { if (ativo()) render(store.get()); });
    doc.addEventListener('cx:modo', () => {
      lastKeys = {};
      lastAlertKey = '';
      $('scenario-result').replaceChildren();
      render(store.get());
    });
    // Selecionar drone (cartão ou mapa) destaca a rota; na fila, a entrega do drone
    doc.addEventListener('click', (e) => {
      if (!ativo()) return;
      const sel = e.target.closest('[data-sel-drone]');
      const foco = e.target.closest('[data-focar]');
      if (sel) selectedDrone = selectedDrone === sel.getAttribute('data-sel-drone') ? null : sel.getAttribute('data-sel-drone');
      else if (foco) {
        const ent = ops.byId(store.get().entregas, foco.getAttribute('data-focar'));
        selectedDrone = ent && ent.droneId ? ent.droneId : null;
        if (!ent || !ent.droneId) root.location.href = 'rastreamento.html?id=' + encodeURIComponent(foco.getAttribute('data-focar'));
      } else return;
      render(store.get());
    });
    doc.addEventListener('click', (e) => {
      const b = e.target.closest('[data-release]');
      if (!b || !ativo()) return;
      const r = store.update((s) => ops.releaseDrone(s, b.getAttribute('data-release'), Date.now()));
      ui.mensagem(r.ok ? 'Drone liberado e devolvido à frota. Evento registrado no histórico.' : r.motivo, r.ok);
      $('fleet-list').focus();
    });
    $('alert-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ack]');
      if (!b || !ativo()) return;
      acked.add(b.getAttribute('data-ack'));
      render(store.get());
    });
    $('queue-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-launch]');
      if (btn && ativo()) store.update((s) => ops.launch(s, btn.getAttribute('data-launch'), Date.now()));
    });
  }

  /* Relógio da simulação: conclui voos e atualiza o progresso (a simulação segue mesmo fora da tela). */
  function loop() {
    if (doc.hidden) return; // aba oculta: não gasta CPU; o estado é recalculado ao voltar
    const state = store.get();
    if (ops.tick(state, Date.now()).length) store.update(() => null);
    else render(state);
  }

  // Links para os painéis da simulação abrem nela; para os códigos de órgão, na rede real
  const hash = root.location.hash;
  if (hash === '#cenarios' || hash === '#nova-solicitacao') ui.definirModo('sim', false);
  const initial = store.get();
  drawMapBase(initial);
  fillPlaces(initial);
  initForm();
  initScenarios();
  initActions();
  store.subscribe(render);
  render(initial);
  root.setInterval(loop, 1000);
})(window);
