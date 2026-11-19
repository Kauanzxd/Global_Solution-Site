/* SIDEC Saúde — pedidos por perfil, rastreamento médico, simuladores e teste da fila.
   Usa o mesmo motor (SIDEC.ops) e o mesmo estado (SIDEC.store) da central: nenhuma regra é duplicada aqui. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store } = SIDEC;
  const { el } = SIDEC.ui;

  const $ = (id) => doc.getElementById(id);
  const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const place = (state, id) => (ops.findPoint(state, id) || { nome: id }).nome;
  const isHealth = (e) => e.prioridade <= 3;
  const ATIVOS = ['em_voo', 'atribuida', 'fila'];
  const FIM = ['entregue', 'outro_meio', 'pouso_emergencia'];
  const RANK = { em_voo: 0, atribuida: 1, fila: 2 };
  const ROLE = { 1: 'Hospital (simulação)', 2: 'Operador da Defesa Civil (simulação)', 3: 'Cidadão (fictício)' };

  /* ---------- Etiqueta de transporte ---------- */
  function readings(state, e, now) {
    if (e.status !== 'em_voo') return [];
    const r = ops.sensorReading(state, e, now);
    const list = [el('span', { class: 'ship__reading', text: 'Bateria ' + num.format(r.bateria) + '%' })];
    if (r.temp !== null) {
      const ok = ops.checkTemperature(r.temp, e.faixaTemp).ok;
      list.push(el('span', { class: 'ship__reading' + (ok ? '' : ' is-alert'), text: num.format(r.temp) + ' °C' + (ok ? '' : ' fora da faixa') }));
    }
    return list;
  }

  function tag(state, e, now) {
    const drone = e.droneId ? ops.byId(state.drones, e.droneId) : null;
    const status = [el('span', { text: ops.STATUS[e.status] })];
    if (e.status === 'em_voo') {
      const p = Math.round(ops.flightProgress(e, now) * 100);
      status.push(el('progress', { class: 'ship__progress', max: '100', value: String(p), 'data-progress': e.id, 'aria-label': 'Progresso do voo de ' + e.id }));
    }
    if (e.motivo) status.push(el('span', { class: 'ship__reason', text: e.motivo }));
    return el('article', { class: 'ship ship--' + e.prioridade, 'aria-label': 'Entrega ' + e.id }, [
      el('p', { class: 'ship__kind', text: 'P' + e.prioridade + ' ' + ops.PRIORIDADES[e.prioridade] }),
      el('p', { class: 'ship__code', text: e.id }),
      el('p', { class: 'ship__cargo', text: e.carga }),
      el('dl', { class: 'ship__route' }, [
        el('dt', { text: 'De' }), el('dd', { text: place(state, e.origemId) }),
        el('dt', { text: 'Para' }), el('dd', { text: place(state, e.destinoId) }),
        el('dt', { text: 'Drone' }), el('dd', { text: drone ? drone.nome : 'a definir' })
      ]),
      el('div', { class: 'ship__readings', 'data-readings': e.id }, readings(state, e, now)),
      el('div', { class: 'ship__status' }, status)
    ]);
  }

  /* ---------- Rastreamento médico ---------- */
  function mostUrgent(state) {
    return state.entregas.filter((e) => isHealth(e) && ATIVOS.includes(e.status))
      .sort((a, b) => a.prioridade - b.prioridade || RANK[a.status] - RANK[b.status] || a.ordem - b.ordem)[0];
  }

  function cardActions(e) {
    const list = [];
    if (e.status === 'atribuida') list.push(el('button', { type: 'button', class: 'btn btn--primary btn--sm', 'data-launch': e.id, text: 'Liberar decolagem' }));
    if (e.droneId) list.push(el('a', { class: 'btn btn--ghost btn--sm', href: '../rastreamento.html?id=' + e.id, text: 'Ver no mapa' }));
    return list.length ? el('div', { class: 'cards__actions' }, list) : null;
  }

  let signature = '';
  function render(state) {
    const now = Date.now();
    const ativos = state.entregas.filter((e) => isHealth(e) && ATIVOS.includes(e.status))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.prioridade - b.prioridade || a.ordem - b.ordem);
    const fim = state.entregas.filter((e) => isHealth(e) && FIM.includes(e.status)).sort((a, b) => b.ordem - a.ordem).slice(0, 8);
    const top = mostUrgent(state);
    const sig = JSON.stringify([top && top.id, ativos.map((e) => e.id + e.status), fim.map((e) => e.id + e.status)]);
    if (sig === signature) { renderLive(state, now); return; }
    signature = sig;

    const heroTag = top
      ? tag(state, top, now)
      : el('div', { class: 'ship' }, el('p', { class: 'ship__empty', text: 'Nenhuma entrega de saúde ativa agora. Faça um pedido abaixo.' }));
    heroTag.id = 'sh-tag';
    $('sh-tag').replaceWith(heroTag);
    const acoes = top ? cardActions(top) : null;
    $('sh-tag-actions').replaceChildren(...(acoes ? [acoes] : []));

    const outros = ativos.filter((e) => !top || e.id !== top.id); // o mais urgente já aparece em destaque
    $('sh-ativos').replaceChildren(...(outros.length
      ? outros.map((e) => el('li', {}, [tag(state, e, now), cardActions(e)]))
      : [el('li', { class: 'cards__empty', text: top ? 'Nenhuma outra entrega de saúde em andamento.' : 'Nenhuma entrega de saúde em andamento. Seus pedidos aparecem aqui.' })]));

    $('sh-historico').replaceChildren(...(fim.length
      ? fim.map((e) => el('li', { class: 'history__item history__item--' + e.status }, [
        el('div', { class: 'history__top' }, [
          el('span', { class: 'history__code', text: e.id }),
          el('span', { class: 'prio prio--' + e.prioridade, text: 'P' + e.prioridade }),
          el('span', { text: ops.STATUS[e.status] })
        ]),
        el('span', { text: e.carga }),
        el('span', { class: 'history__note', text: e.status === 'entregue' ? 'Entregue em ' + place(state, e.destinoId) + '.' : (e.motivo || 'Carga aguarda resgate.') })
      ]))
      : [el('li', { class: 'history__item', text: 'Ainda não há entregas concluídas. Libere uma decolagem para ver o histórico.' })]));
  }

  /* Atualiza só progresso e sensores, sem recriar botões (preserva o foco do teclado). */
  function renderLive(state, now) {
    state.entregas.filter((e) => e.status === 'em_voo').forEach((e) => {
      const p = String(Math.round(ops.flightProgress(e, now) * 100));
      doc.querySelectorAll('[data-progress="' + e.id + '"]').forEach((n) => { n.value = p; });
      doc.querySelectorAll('[data-readings="' + e.id + '"]').forEach((n) => n.replaceChildren(...readings(state, e, now)));
    });
  }

  function stamp() {
    const t = $('sh-tag');
    t.classList.add('is-stamped');
    t.addEventListener('animationend', () => t.classList.remove('is-stamped'), { once: true });
  }

  /* ---------- Perfis (abas WAI-ARIA) ---------- */
  function initRoles() {
    const tabs = Array.from(doc.querySelectorAll('.roles [role="tab"]'));
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !on;
      });
      resetDone();
      updateSummary();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const t = tabs[(next + tabs.length) % tabs.length];
        select(t);
        t.focus();
      });
    });
  }

  /* ---------- Pedidos ---------- */
  const DEFAULTS = { 'c-origem': 'FA-01', 'c-destino': 'B-02', 'h-origem': 'CT-01', 'h-destino': 'H-03', 'o-origem': 'F-SUL', 'o-destino': 'B-05' };

  function fillPlaces(state) {
    doc.querySelectorAll('select[data-places]').forEach((sel) => {
      const tipos = sel.getAttribute('data-places').split(',');
      const items = tipos.includes('base')
        ? state.filiais.map((f) => [f.id, f.nome])
        : state.locais.filter((l) => tipos.includes(l.tipo)).map((l) => [l.id, l.nome]);
      sel.replaceChildren(...items.map(([id, nome]) => el('option', { value: id, text: nome })));
      sel.value = DEFAULTS[sel.id];
    });
  }

  function orderData(form) {
    const opt = form.elements.produto.selectedOptions[0];
    const p = Number(form.getAttribute('data-prioridade'));
    return {
      prioridade: p,
      carga: opt.value,
      pesoKg: opt.getAttribute('data-peso'),
      termico: opt.hasAttribute('data-termico'),
      origemId: form.elements.origemId.value,
      destinoId: form.elements.destinoId.value,
      solicitante: ROLE[p]
    };
  }

  function validate(form) {
    const invalid = Array.from(form.querySelectorAll('[required]')).filter((input) => {
      const bad = input.type === 'checkbox' ? !input.checked : !input.value;
      input.closest('.field').classList.toggle('has-error', bad);
      input.setAttribute('aria-invalid', String(bad));
      return bad;
    });
    if (invalid.length) invalid[0].focus();
    return invalid.length === 0;
  }

  function resultMessage(e, r) {
    if (r.status === 'atribuida') {
      const drone = ops.byId(store.get().drones, r.droneId);
      return e.id + ' registrado. ' + drone.nome + ' foi reservado' + (r.preemptedId ? ' (o pedido comercial ' + r.preemptedId + ' voltou para a fila)' : '') +
        '. Libere a decolagem para iniciar o voo.';
    }
    if (r.status === 'outro_meio') return e.id + ': ' + r.motivo + ' A central aciona outro meio de transporte.';
    return e.id + ' está na fila como P' + e.prioridade + '. Aguardando um drone com carga e bateria suficientes.';
  }

  function initForms() {
    doc.querySelectorAll('.sh-form').forEach((form) => {
      form.addEventListener('change', (ev) => {
        if (ev.target.closest('.field.has-error')) validate(form);
      });
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!validate(form)) return;
        try {
          const { e, r } = store.update((s) => {
            const nova = ops.createOrder(s, orderData(form));
            return { e: nova, r: ops.dispatch(s, nova.id) };
          });
          const actions = [];
          if (r.status === 'atribuida') actions.push(el('button', { type: 'button', class: 'btn btn--primary', 'data-launch': e.id, text: 'Liberar decolagem' }));
          actions.push(el('a', { class: 'btn btn--ghost', href: '#acompanhar', text: 'Acompanhar' }));
          actions.push(el('button', { type: 'button', class: 'btn btn--ghost', 'data-novo': '', text: 'Novo pedido' }));
          showDone(r.status === 'outro_meio', r.status === 'outro_meio' ? 'Sem drone elegível' : e.id + ' registrado', resultMessage(e, r), actions);
          form.elements.produto.value = '';
          if (form.elements.ciente) form.elements.ciente.checked = false;
          updatePrecheck();
          updateSummary();
          stamp();
        } catch (err) {
          showDone(true, 'Não foi possível registrar', err.message, [el('button', { type: 'button', class: 'btn btn--ghost', 'data-novo': '', text: 'Voltar ao pedido' })]);
        }
      });
    });
  }

  /* Pré-checagem do hospital: roda a regra real numa cópia do estado, sem registrar nada. */
  function updatePrecheck() {
    const form = $('form-hospital');
    const box = $('h-precheck');
    if (!form.elements.produto.value) { box.replaceChildren(); return; }
    const copia = JSON.parse(JSON.stringify(store.get()));
    let line;
    try {
      const e = ops.createOrder(copia, orderData(form));
      const r = ops.dispatch(copia, e.id);
      if (r.ok) {
        const d = ops.byId(copia.drones, r.droneId);
        line = el('p', { class: 'precheck__line is-ok' }, [
          'Autonomia confirmada: ' + d.nome + ' pode levar este órgão.',
          el('span', { class: 'precheck__math', text: num.format(e.km) + ' km × ' + num.format(d.consumoKm) + '%/km = ' + num.format(e.consumo) +
            '% × 1,3 (reserva de 30%) = ' + num.format(e.necessario) + '% ≤ bateria de ' + num.format(d.bateria) + '%' })
        ]);
      } else {
        line = el('p', { class: 'precheck__line is-alert', text: (r.motivo || 'Nenhum drone elegível nesta rota.') + ' O pedido seguirá para outro meio de transporte.' });
      }
    } catch (err) {
      line = el('p', { class: 'precheck__line is-alert', text: err.message });
    }
    box.replaceChildren(line);
  }

  /* ---------- Tela de confirmação ---------- */
  function showDone(alert, title, msg, actions) {
    const box = $('pedido-resultado');
    box.closest('.sx-order__form').classList.add('is-done');
    box.className = 'sx-done' + (alert ? ' is-alert' : '');
    box.replaceChildren(
      el('span', { class: 'sx-done__badge', 'aria-hidden': 'true' }),
      el('h2', { class: 'sx-done__title', tabindex: '-1', text: title }),
      el('p', { class: 'sx-done__msg', text: msg }),
      el('div', { class: 'sx-done__actions' }, actions));
    box.querySelector('.sx-done__title').focus();
  }

  function resetDone(focus) {
    const box = $('pedido-resultado');
    box.closest('.sx-order__form').classList.remove('is-done');
    box.className = 'sx-done';
    box.replaceChildren();
    if (focus) {
      const form = activeForm();
      form.elements.produto.focus();
    }
  }

  /* ---------- Resumo ao vivo do pedido ---------- */
  const REGRA = {
    1: 'Só decola se consumo da rota × 1,3 couber na bateria (reserva de 30%). Sem drone elegível, a Central indica outro meio.',
    2: 'Pode antecipar uma entrega comercial que ainda não decolou. Voo em andamento nunca é interrompido.',
    3: 'Atendido depois de órgãos e emergências, por ordem de chegada.'
  };
  const activeForm = () => doc.querySelector('.role-panel:not([hidden]) .sh-form');

  function updateSummary() {
    const form = activeForm();
    if (!form) return;
    const state = store.get();
    const p = Number(form.getAttribute('data-prioridade'));
    const opt = form.elements.produto.selectedOptions[0];
    const a = ops.findPoint(state, form.elements.origemId.value);
    const b = ops.findPoint(state, form.elements.destinoId.value);
    const km = a && b ? ops.distance(a, b) : null;
    const termico = p === 1 || (opt && opt.hasAttribute('data-termico'));
    const rows = [
      ['Prioridade', el('span', { class: 'prio prio--' + p, text: 'P' + p + ' ' + ops.PRIORIDADES[p] })],
      ['Carga', opt && opt.value ? opt.textContent : '—'],
      ['Rota', (a ? a.nome : '—') + ' → ' + (b ? b.nome : '—')],
      ['Distância', km === null ? '—' : num.format(km) + ' km em linha reta'],
      ['Temperatura', termico ? 'Controlada, 2 a 8 °C' : 'Ambiente']
    ];
    $('sx-resumo').replaceChildren(...rows.map(([k, v]) => el('div', {}, [el('dt', { text: k }), el('dd', {}, v)])));
    $('sx-resumo-nota').textContent = REGRA[p];
  }

  /* ---------- Simuladores ---------- */
  function initTemperature() {
    const range = $('temp-range');
    const update = () => {
      const v = Number(range.value);
      const t = ops.checkTemperature(v);
      $('temp-valor').textContent = num.format(v) + ' °C';
      $('temp-meter').value = v;
      $('temp-meter').textContent = num.format(v) + ' °C';
      range.setAttribute('aria-valuetext', num.format(v) + ' graus Celsius');
      const out = $('temp-saida');
      out.className = 'sim__out ' + (t.ok ? 'is-ok' : 'is-alert');
      out.textContent = t.ok ? 'Carga protegida: ' + num.format(v) + ' °C está entre 2 e 8 °C.' : t.mensagem;
    };
    range.addEventListener('input', update);
    $('sim-temp').addEventListener('submit', (e) => e.preventDefault());
    update();
  }

  function initAutonomy() {
    const km = $('aut-km');
    const bat = $('aut-bat');
    const tipo = $('aut-tipo');
    const update = () => {
      const a = ops.estimateAutonomy({ km: Number(km.value), consumoKm: 3, bateria: Number(bat.value), prioridade: Number(tipo.value) });
      $('aut-km-valor').textContent = num.format(a.km) + ' km';
      $('aut-bat-valor').textContent = bat.value + '%';
      $('aut-need').value = Math.min(100, a.necessario);
      $('aut-have').value = Number(bat.value);
      $('aut-need-valor').textContent = num.format(a.necessario) + '%';
      $('aut-have-valor').textContent = bat.value + '%';
      const out = $('aut-saida');
      out.className = 'sim__out ' + (a.ok ? 'is-ok' : 'is-alert');
      out.textContent = a.ok
        ? 'Pode decolar: consumo de ' + num.format(a.consumo) + '% mais ' + Math.round(a.reserva * 100) + '% de reserva cabe na bateria, com ' + num.format(a.sobra) + '% de folga.'
        : 'Não decola: faltam ' + num.format(-a.sobra) + '% de bateria. A central procura outro drone ou outro meio de transporte.';
    };
    [km, bat, tipo].forEach((n) => n.addEventListener('input', update));
    $('sim-autonomia').addEventListener('submit', (e) => e.preventDefault());
    update();
  }

  /* ---------- Teste: quem decola primeiro? ---------- */
  const ROUNDS = [
    [[3, 'Insulina para morador do Parque das Águas', '09h02'], [1, 'Rim para transplante no Hospital Vale Verde', '09h20'],
      [4, 'Refeição de restaurante parceiro', '08h55'], [2, 'Água para área alagada', '09h10']],
    [[3, 'Amostras de exame da UBS Morro Azul', '10h05'], [3, 'Losartana de uso contínuo', '09h48'],
      [2, 'Kit de primeiros socorros para abrigo', '10h12'], [4, 'Encomenda de marketplace', '09h30']],
    [[1, 'Córneas para transplante', '14h40'], [1, 'Coração para transplante', '14h25'],
      [2, 'Medicamentos básicos para abrigo', '14h10'], [3, 'Metformina de uso contínuo', '13h55']]
  ];
  let round = -1;

  function newRound() {
    round = (round + 1) % ROUNDS.length;
    const itens = ROUNDS[round].map(([prioridade, carga, hora], i) => ({ id: 'Q' + i, prioridade, carga, hora, ordem: Number(hora.replace('h', '')), status: 'fila' }));
    const certo = ops.sortQueue({ entregas: itens }).map((e) => e.id); // mesma regra da central
    const picks = [];
    const shuffled = itens.slice().sort(() => Math.random() - 0.5);
    $('quiz-saida').className = 'sim__out';
    $('quiz-saida').textContent = '';
    $('quiz-list').replaceChildren(...shuffled.map((e) => {
      const pick = el('span', { class: 'quiz__pick', 'aria-hidden': 'true' });
      const btn = el('button', { type: 'button', class: 'quiz__card', 'aria-pressed': 'false', 'data-quiz': e.id }, [
        el('span', { class: 'prio prio--' + e.prioridade, text: 'P' + e.prioridade }),
        el('span', { class: 'quiz__text' }, [e.carga, el('span', { class: 'quiz__time', text: 'Chegou às ' + e.hora })]),
        pick
      ]);
      btn.addEventListener('click', () => {
        if (picks.includes(e.id) || picks.length === itens.length) return;
        picks.push(e.id);
        pick.textContent = String(picks.length);
        btn.classList.add('is-picked');
        btn.setAttribute('aria-pressed', 'true');
        if (picks.length === itens.length) finishQuiz(itens, certo, picks);
      });
      return el('li', {}, btn);
    }));
  }

  function finishQuiz(itens, certo, picks) {
    picks.forEach((id, i) => {
      doc.querySelector('[data-quiz="' + id + '"]').classList.add(certo[i] === id ? 'is-right' : 'is-wrong');
    });
    const acertou = certo.every((id, i) => picks[i] === id);
    const nome = (id) => itens.find((e) => e.id === id).carga;
    const out = $('quiz-saida');
    out.className = 'sim__out ' + (acertou ? 'is-ok' : 'is-alert');
    out.textContent = (acertou ? 'Ordem certa! ' : 'Ordem da central: ' + certo.map((id, i) => (i + 1) + 'º ' + nome(id)).join('; ') + '. ') +
      'Prioridade menor decola antes; no empate, sai primeiro quem chegou antes.';
  }

  /* ---------- Ações globais ---------- */
  function initActions() {
    doc.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-launch]');
      if (!btn) return;
      const id = btn.getAttribute('data-launch');
      const r = store.update((s) => ops.launch(s, id, Date.now()));
      if (btn.closest('#pedido-resultado')) {
        showDone(!r.ok, r.ok ? id + ' decolou' : 'Decolagem bloqueada', r.ok ? 'O drone está a caminho. Bateria, temperatura e progresso aparecem em Acompanhar.' : r.motivo, [
          el('a', { class: 'btn btn--primary', href: '#acompanhar', text: 'Acompanhar o voo' }),
          el('button', { type: 'button', class: 'btn btn--ghost', 'data-novo': '', text: 'Novo pedido' })
        ]);
      }
    });
    doc.addEventListener('click', (e) => { if (e.target.closest('[data-novo]')) resetDone(true); });
    doc.querySelectorAll('.sh-form').forEach((f) => f.addEventListener('change', updateSummary));
    $('btn-tour').addEventListener('click', () => SIDEC.bot.startTour());
    $('quiz-novo').addEventListener('click', newRound);
    ['h-item', 'h-origem', 'h-destino'].forEach((id) => $(id).addEventListener('change', updatePrecheck));
  }

  function loop() {
    if (document.hidden) return; // aba oculta: não gasta CPU; o estado é recalculado ao voltar
    const state = store.get();
    if (ops.tick(state, Date.now()).length) store.update(() => null);
    else render(state);
  }

  const initial = store.get();
  fillPlaces(initial);
  initRoles();
  initForms();
  initTemperature();
  initAutonomy();
  newRound();
  initActions();
  updateSummary();
  store.subscribe(render);
  render(initial);
  setInterval(loop, 1000);
})(window);
