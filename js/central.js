/* SIDEC — Central de operações: renderiza fila e frota, registra pedidos e roda cenários de teste. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store, data } = SIDEC;
  const { el } = SIDEC.ui;

  const STATUS_ORDER = { em_voo: 0, atribuida: 1, fila: 2, pouso_emergencia: 3, outro_meio: 4, convencional: 5, entregue: 6 };
  const $ = (id) => doc.getElementById(id);
  const place = (state, id) => (ops.findPoint(state, id) || { nome: id }).nome;

  function prioBadge(p) {
    return el('span', { class: 'prio prio--' + p, text: 'P' + p + ' ' + ops.PRIORIDADES[p] });
  }

  function statusBadge(status) {
    return el('span', { class: 'status status--' + status, text: ops.STATUS[status] });
  }

  /* ---------- Fila ---------- */
  function renderQueue(state, now) {
    const fila = ops.sortQueue(state);
    const pos = new Map(fila.map((e, i) => [e.id, i + 1]));
    const rows = state.entregas.slice().sort((a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.prioridade - b.prioridade || a.ordem - b.ordem);

    $('queue-body').replaceChildren(...rows.map((e) => {
      const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
      const statusCell = [statusBadge(e.status)];
      if (drone) statusCell.push(el('span', { class: 'queue__sub mono', text: drone.nome }));
      if (e.status === 'fila') statusCell.push(el('span', { class: 'queue__pos mono', text: '#' + pos.get(e.id) + ' na fila' }));
      if (e.status === 'em_voo') {
        const p = Math.round(ops.flightProgress(e, now) * 100);
        statusCell.push(el('progress', { class: 'queue__progress', max: '100', value: String(p), 'aria-label': 'Progresso ' + p + '%' }));
      }
      if (e.motivo) statusCell.push(el('span', { class: 'queue__reason', text: e.motivo }));

      const actions = [];
      if (e.status === 'atribuida') actions.push(el('button', { type: 'button', class: 'btn btn--primary btn--sm', 'data-launch': e.id, text: 'Decolar' }));
      if (e.droneId) actions.push(el('a', { class: 'btn btn--ghost-light btn--sm', href: 'rastreamento.html?id=' + e.id, text: 'Rastrear' }));

      return el('tr', { class: 'queue__row queue__row--' + e.status }, [
        el('td', { 'data-label': 'Entrega' }, el('div', { class: 'queue__status' }, [el('span', { class: 'mono queue__code', text: e.id }), prioBadge(e.prioridade)])),
        el('td', { 'data-label': 'Carga' }, [el('span', { text: e.carga }), el('span', { class: 'queue__sub mono', text: e.pesoKg + ' kg' })]),
        el('td', { 'data-label': 'Rota' }, [el('span', { text: place(state, e.origemId) }), el('span', { class: 'queue__sub', text: '→ ' + place(state, e.destinoId) })]),
        el('td', { 'data-label': 'Status' }, el('div', { class: 'queue__status' }, statusCell)),
        el('td', { class: 'queue__actions' }, actions)
      ]);
    }));
  }

  /* ---------- Frota ---------- */
  function renderFleet(state) {
    $('fleet-list').replaceChildren(...state.drones.map((d) => {
      const filial = ops.byId(state.filiais, d.filialId);
      return el('li', { class: 'fleet__item fleet__item--' + d.status }, [
        el('div', { class: 'fleet__top' }, [
          el('span', { class: 'fleet__name', text: d.nome }),
          el('span', { class: 'fleet__id mono', text: d.id }),
          statusBadge(d.status)
        ]),
        el('div', { class: 'fleet__battery' }, [
          el('meter', { min: '0', max: '100', low: '35', high: '60', optimum: '100', value: String(d.bateria), 'aria-label': 'Bateria de ' + d.nome }),
          el('span', { class: 'mono', text: d.bateria + '%' })
        ]),
        el('p', { class: 'fleet__meta mono', text: filial.nome + ' · carga máx. ' + d.cargaMaxKg + ' kg · ' + d.consumoKm + '%/km' + (d.entregaId ? ' · ' + d.entregaId : '') })
      ]);
    }));
  }

  function renderKpis(state) {
    const count = (fn) => state.entregas.filter(fn).length;
    $('kpi-fila').textContent = count((e) => e.status === 'fila');
    $('kpi-voo').textContent = count((e) => e.status === 'em_voo');
    $('kpi-livres').textContent = state.drones.filter((d) => d.status === 'disponivel').length + '/' + state.drones.length;
    $('kpi-outro').textContent = count((e) => e.status === 'outro_meio');
  }

  function renderLog(state) {
    const list = state.log || [];
    if (!list.length) {
      $('log-list').replaceChildren(el('li', { class: 'log__empty', text: 'Nenhuma decisão registrada ainda. Processe a fila ou rode um cenário.' }));
      return;
    }
    $('log-list').replaceChildren(...list.slice(0, 14).map((l) => el('li', { class: 'log__item log__item--' + l.tipo, text: l.msg })));
  }

  function render(state) {
    const now = Date.now();
    renderKpis(state);
    renderQueue(state, now);
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
      $('scenario-result').replaceChildren(el('p', { class: 'scenario-result__outcome is-ok', text: results.length
        ? ok + ' de ' + results.length + ' pedidos despachados. Veja o registro de decisões.'
        : 'Fila vazia: nada para processar.' }));
    });
    $('btn-reset').addEventListener('click', () => {
      store.reset();
      $('scenario-result').replaceChildren(el('p', { class: 'scenario-result__outcome is-ok', text: 'Dados iniciais restaurados.' }));
    });
    $('btn-tour').addEventListener('click', () => SIDEC.bot.startTour());
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
  fillPlaces(initial);
  initForm();
  initScenarios();
  initActions();
  store.subscribe(render);
  render(initial);
  setInterval(loop, 1000);
})(window);
