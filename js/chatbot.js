/* SIDEC — Drone Bot: assistente DEMONSTRATIVO baseado em regras.
   Ponto de integração futura: SIDEC.bot.respond(texto) -> Promise<resposta>. Uma versão com IBM watsonx Assistant
   deve chamar um backend próprio (proxy) que guarda as credenciais; nunca colocar chaves no frontend. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { el } = SIDEC.ui;
  const avatar = SIDEC.droneAvatar;

  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const page = (doc.body.getAttribute('data-page') || '');
  const base = doc.body.getAttribute('data-base') || '';

  /* ---------- Entendimento (intenções + entidades) ---------- */
  const INTENTS = [
    ['reclamar', /reclam|problema|nao chegou|atras|defeito|errad|report|danific/],
    ['reagendar', /reagend|remarc|mudar (o )?horario|adiar|outro horario|trocar horario/],
    ['rastrear', /sdc[-\s]?\d{1,4}/],
    ['urgente', /urgen|emergenc|orgao|transplante|enchente|deslizamento|socorro|defesa civil/],
    ['remedio', /remedio|medicament|farmacia|receita|uso continuo|insulina/],
    ['delivery', /delivery|comida|lanche|restaurante|padaria|mercado|carrinho/],
    ['rastrear', /rastre|onde esta|acompanh|status|minha entrega|meu pedido/],
    ['prioridades', /prioridad|nive(l|is)|fila/],
    ['seguranca', /seguran|paraquedas|pane|queda|falha|cair|risco/],
    ['tutorial', /tutorial|tour|guia|me mostr|como usar/],
    ['sobre', /o que e|sidec|como funciona|quem (faz|criou)|projeto/],
    ['saudacao', /^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey)\b/]
  ];

  const CARGAS = [
    ['órgão', 1, /orgao|rim|coracao|figado|cornea|pulmao|transplante/],
    ['suprimentos de emergência', 2, /agua|kit|primeiros socorros|enchente|deslizamento|mantimento/],
    ['medicamento', 3, /remedio|medicament|insulina|receita/],
    ['exames', 3, /exame|amostra|sangue/],
    ['pedido comercial', 4, /comida|refeicao|lanche|encomenda|compra|marketplace/]
  ];

  function entities(text) {
    const t = norm(text);
    const state = SIDEC.store.get();
    const found = {};
    const code = t.match(/sdc[-\s]?(\d{1,4})/);
    if (code) found.codigo = 'SDC-' + code[1].padStart(4, '0');
    const carga = CARGAS.find(([, , re]) => re.test(t));
    if (carga) { found.tipoCarga = carga[0]; found.prioridade = 'P' + carga[1]; }
    const p = t.match(/\b(?:p|prioridade\s*)([1-4])\b/);
    if (p) found.prioridade = 'P' + p[1];
    const bairro = state.locais.find((l) => l.tipo === 'bairro' && t.includes(norm(l.nome)));
    if (bairro) found.bairro = bairro.nome;
    const hospital = state.locais.find((l) => l.tipo === 'hospital' && t.includes(norm(l.nome).replace('hospital ', '')));
    if (hospital) found.hospital = hospital.nome;
    const hora = t.match(/\b([01]?\d|2[0-3])\s?(?:h|:)\s?([0-5]\d)?\b/);
    if (hora) found.horario = hora[1].padStart(2, '0') + 'h' + (hora[2] || '00');
    return found;
  }

  /* Sem palavra-chave de intenção, a entidade de carga decide (ex.: "levar um rim" → urgente). */
  function intentOf(text, ent) {
    const t = norm(text);
    const hit = INTENTS.find(([, re]) => re.test(t));
    if (hit) return hit[0];
    if (ent && ['P1', 'P2'].includes(ent.prioridade)) return 'urgente';
    if (ent && ent.prioridade === 'P3') return 'remedio';
    return 'ajuda';
  }

  const link = (href, text) => ({ href: base + href, text });

  function trackReply(ent) {
    const state = SIDEC.store.get();
    const e = ent.codigo && SIDEC.ops.byId(state.entregas, ent.codigo);
    if (e) {
      const d = e.droneId ? SIDEC.ops.byId(state.drones, e.droneId) : null;
      const destino = SIDEC.ops.findPoint(state, e.destinoId);
      return {
        text: e.id + ' (' + SIDEC.ops.PRIORIDADES[e.prioridade] + '): ' + SIDEC.ops.STATUS[e.status].toLowerCase() +
          (d ? ', drone ' + d.nome : '') + ', destino ' + destino.nome + '.' + (e.motivo ? ' ' + e.motivo : ''),
        links: [link('rastreamento.html?id=' + e.id, 'Abrir rastreamento de ' + e.id)]
      };
    }
    const ativos = state.entregas.filter((x) => ['em_voo', 'atribuida', 'fila'].includes(x.status)).slice(0, 3);
    return {
      text: (ent.codigo ? 'Não encontrei ' + ent.codigo + ' na simulação. ' : '') + 'Informe o código da entrega (ex.: SDC-0003). Algumas ativas agora:',
      chips: ativos.map((x) => 'Rastrear ' + x.id)
    };
  }

  const REPLIES = {
    saudacao: () => ({ text: 'Olá! Sou o Drone Bot, assistente do SADEC. Posso rastrear entregas, explicar as prioridades, a segurança e mostrar a central passo a passo.' }),
    ajuda: () => ({ text: 'Não entendi bem. Tente uma das opções abaixo ou escreva, por exemplo, "rastrear SDC-0003".' }),
    rastrear: trackReply,
    remedio: (ent) => ({
      text: 'Pedidos de medicamento de uso contínuo são prioridade 3 (Saúde). O cidadão, a UBS ou a farmácia registra o pedido e a central escolhe um drone com carga e autonomia suficientes' +
        (ent.bairro ? ' para ' + ent.bairro : '') + '. Nesta demonstração, faça o pedido no SADEC Saúde.',
      links: [link('saude/index.html#pedir', 'Pedir medicamento no SADEC Saúde')]
    }),
    urgente: (ent) => ({
      text: (ent.tipoCarga === 'órgão'
        ? 'Transporte de órgãos é prioridade 1: só hospitais e a Central de Transplantes solicitam, e o drone só é liberado se a bateria cobrir a rota com 30% de reserva.'
        : 'Emergências (água, medicamentos, kits) são prioridade 2, solicitadas pela Defesa Civil e prefeituras.') +
        ' Em uma emergência real, ligue 192 (SAMU) ou 199 (Defesa Civil).',
      links: [link('central.html#cenarios', 'Ver cenário de prioridade na Central')]
    }),
    reagendar: (ent) => ({
      text: ent.codigo && ent.horario
        ? 'Reagendamento demonstrativo de ' + ent.codigo + ' para ' + ent.horario + ' anotado. Nenhuma operação real foi alterada.'
        : 'Para reagendar, informe o código e o novo horário, por exemplo: "reagendar SDC-0001 para 14h30".'
    }),
    reclamar: (ent) => ({
      text: 'Sinto muito pelo problema. Este é um protocolo demonstrativo, nada foi registrado' + (ent.codigo ? ' para ' + ent.codigo : '') +
        '. Para detalhes, use o formulário de contato (nenhum dado é enviado).',
      links: [link('faq.html#contato', 'Abrir formulário de contato')]
    }),
    delivery: () => ({
      text: 'Pedidos de comida e mercado são prioridade 4 (Comercial). Eles ajudam a financiar a rede, mas cedem o drone para órgãos e emergências enquanto não decolaram. Experimente no protótipo do SADEC Delivery.',
      links: [link('delivery/index.html', 'Abrir o SADEC Delivery')]
    }),
    prioridades: () => ({
      text: 'A fila segue quatro níveis: P1 Órgãos, P2 Emergência, P3 Saúde e P4 Comercial. P1 e P2 podem reorganizar uma entrega comercial que ainda não decolou, mas nada em voo é interrompido.',
      links: [link('central.html#fila', 'Ver a fila ao vivo')]
    }),
    seguranca: () => ({
      text: 'Com bateria baixa ou falha de motor, o drone pousa na zona segura mais próxima da rota. Em falha grave, aciona paraquedas, luzes e alerta sonoro, e a carga aguarda resgate. Fora da faixa térmica, a equipe médica é alertada.',
      links: [link('rastreamento.html', 'Testar no rastreamento')]
    }),
    sobre: () => ({
      text: 'O SADEC é um conceito de rede de drones adaptados que leva órgãos, medicamentos e ajuda emergencial, financiada em parte por entregas comerciais. Tudo aqui é simulado com dados fictícios.',
      links: [link('sobre.html', 'Conhecer o projeto')]
    }),
    tutorial: () => (TOURS[page]
      ? { text: 'Vamos lá! Vou destacar cada parte desta página.', action: 'tour' }
      : { text: 'Há tutoriais guiados no SADEC Saúde, no SADEC Delivery, na Central e no Rastreamento.', links: [link('saude/index.html?tour=1', 'Como pedir um medicamento'), link('delivery/index.html?tour=1', 'Como pedir por drone no Delivery'), link('central.html?tour=1', 'Tutorial da Central'), link('rastreamento.html?tour=1', 'Tutorial do Rastreamento')] })
  };

  /* Implementação local por regras. Retorna Promise para manter o mesmo contrato de um backend real. */
  function respond(text) {
    const ent = entities(text);
    const intent = intentOf(text, ent);
    const reply = REPLIES[intent](ent);
    return Promise.resolve(Object.assign({ intent, entities: ent }, reply));
  }

  /* ---------- Tutoriais guiados ---------- */
  const TOURS = {
    saude: [
      ['.roles', 'Escolha o pedido', 'Medicamento (P3), órgão (P1) ou socorro (P2). Cada um tem prioridade diferente na fila.'],
      ['#pedido', 'Preencha e confira', 'Poucos campos e um resumo ao lado com prioridade, rota e controle de temperatura. Nenhum dado pessoal é pedido.'],
      ['#acompanhar', 'Acompanhe o voo', 'Libere a decolagem e veja bateria, temperatura e progresso na etiqueta da entrega.'],
      ['#simuladores', 'Entenda as regras', 'Mude temperatura e bateria, teste a fila e reveja o passo a passo.']
    ],
    delivery: [
      ['#lojas', 'Escolha a loja', 'Restaurante, padaria ou mercado: todos fictícios. Cada pedido é de uma loja só.'],
      ['#cardapio', 'Monte o carrinho', 'Use + e − em cada produto. O peso do pedido é somado para escolher o drone.'],
      ['#dl-modos', 'Drone ou convencional', 'Compare prazo e taxa. Pedido acima da carga máxima dos drones vai pela entrega convencional.'],
      ['#carrinho', 'Confirme o pedido', 'Ele entra na fila da central como prioridade 4 (comercial). Nenhum pagamento é feito.'],
      ['#acompanhar', 'Acompanhe o voo', 'Veja o preparo, a decolagem e o drone cruzando a rota até a sua porta.']
    ],
    central: [
      ['#fila', 'Fila por prioridade', 'Os pedidos ficam ordenados de P1 (órgãos) a P4 (comercial). Empates respeitam a ordem de chegada.'],
      ['#frota', 'Frota', 'Cada drone mostra base, bateria, carga máxima e status. Indisponíveis nunca recebem missão.'],
      ['#nova-solicitacao', 'Nova solicitação', 'Registre um pedido fictício. Ele entra na fila na posição da sua prioridade.'],
      ['#cenarios', 'Cenários de teste', 'Cada botão monta uma situação e aplica as regras reais do motor.'],
      ['#registro', 'Registro de decisões', 'Toda decisão aparece aqui com o motivo e os números usados.']
    ],
    rastreamento: [
      ['#busca', 'Escolha a entrega', 'Selecione um código. O rastreamento usa o mesmo pedido e o mesmo drone da Central.'],
      ['#mapa', 'Mapa esquemático', 'Cidade-modelo fictícia: bases, hospitais, zonas de pouso e a rota do drone.'],
      ['#etapas', 'Etapas da entrega', 'Do pedido à confirmação de recebimento.'],
      ['#telemetria', 'Telemetria', 'Bateria, posição, temperatura e vibração calculadas pela simulação.'],
      ['#seguranca', 'Demonstrações de segurança', 'Simule pane, falha grave ou temperatura fora da faixa e veja a resposta.']
    ]
  };

  let tour = null;

  function renderTour() {
    const steps = TOURS[page];
    const [selector, title, text] = steps[tour.i];
    doc.querySelectorAll('.is-tour-target').forEach((n) => n.classList.remove('is-tour-target'));
    const target = doc.querySelector(selector);
    if (target) {
      target.classList.add('is-tour-target');
      target.scrollIntoView({ behavior: root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    }
    tour.count.textContent = 'Etapa ' + (tour.i + 1) + ' de ' + steps.length;
    tour.title.textContent = title;
    tour.text.textContent = text;
    tour.prev.disabled = tour.i === 0;
    tour.next.textContent = tour.i === steps.length - 1 ? 'Concluir' : 'Avançar';
    tour.progress.setAttribute('value', String(tour.i + 1));
    tour.progress.setAttribute('max', String(steps.length));
    tour.title.focus();
  }

  function endTour() {
    if (!tour) return;
    doc.querySelectorAll('.is-tour-target').forEach((n) => n.classList.remove('is-tour-target'));
    tour.box.remove();
    tour = null;
  }

  function startTour() {
    if (!TOURS[page]) return;
    endTour();
    const title = el('h2', { class: 'tour__title', tabindex: '-1' });
    const count = el('p', { class: 'tour__count mono' });
    const text = el('p', { class: 'tour__text' });
    const progress = el('progress', { class: 'tour__progress', value: '1', max: '1', 'aria-hidden': 'true' });
    const prev = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Voltar', onclick: () => { tour.i -= 1; renderTour(); } });
    const next = el('button', {
      type: 'button', class: 'btn btn--primary btn--sm',
      onclick: () => { if (tour.i === TOURS[page].length - 1) endTour(); else { tour.i += 1; renderTour(); } }
    });
    const close = el('button', { type: 'button', class: 'tour__close', 'aria-label': 'Encerrar tutorial', text: '×', onclick: endTour });
    const box = el('section', { class: 'tour', 'aria-label': 'Tutorial guiado', role: 'region' }, [
      el('div', { class: 'tour__head' }, [el('span', { class: 'tour__avatar' }, avatar.create()), count, close]),
      progress, title, text,
      el('div', { class: 'tour__actions' }, [prev, next])
    ]);
    doc.body.append(box);
    tour = { i: 0, box, title, count, text, prev, next, progress };
    renderTour();
  }

  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tour) endTour(); });

  /* ---------- Widget ---------- */
  const SUGESTOES = ['Rastrear SDC-0003', 'Como funcionam as prioridades?', 'E se o drone falhar?', 'Preciso de um remédio'];
  if (TOURS[page]) SUGESTOES.unshift('Tutorial desta página');

  const launcherAvatar = avatar.create();
  const headAvatar = avatar.create();
  const log = el('div', { class: 'chat__log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa com o Drone Bot' });
  const chips = el('div', { class: 'chat__chips' });
  const input = el('input', { id: 'chat-input', class: 'input', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Pergunte algo…' });
  const form = el('form', { class: 'chat__form' }, [
    el('label', { class: 'visually-hidden', for: 'chat-input', text: 'Mensagem para o Drone Bot' }),
    input,
    el('button', { type: 'submit', class: 'btn btn--primary', text: 'Enviar' })
  ]);
  const closeBtn = el('button', { type: 'button', class: 'chat__close', 'aria-label': 'Fechar Drone Bot', text: '×' });
  const panel = el('section', { id: 'chat-panel', class: 'chat__panel', role: 'dialog', 'aria-labelledby': 'chat-title', hidden: true }, [
    el('header', { class: 'chat__head' }, [
      el('span', { class: 'chat__head-avatar' }, headAvatar),
      el('div', {}, [
        el('h2', { id: 'chat-title', class: 'chat__title', text: 'Drone Bot' }),
        el('p', { class: 'chat__subtitle', text: 'Assistente demonstrativo · respostas por regras' })
      ]),
      closeBtn
    ]),
    log, chips, form
  ]);
  const launcher = el('button', { type: 'button', class: 'chat__launcher', 'aria-expanded': 'false', 'aria-controls': 'chat-panel' }, [
    launcherAvatar, el('span', { class: 'visually-hidden', text: 'Abrir Drone Bot, assistente do SADEC' })
  ]);
  // Na página do Drone Bot a conversa fica embutida no conteúdo; nas demais, flutua no canto.
  const inlineHost = doc.getElementById('bot-inline');
  if (inlineHost) {
    panel.hidden = false;
    panel.setAttribute('role', 'region');
    panel.classList.add('is-open', 'chat__panel--inline');
    closeBtn.hidden = true;
    inlineHost.append(panel);
  } else {
    doc.body.append(el('div', { class: 'chat' }, [panel, launcher]));
  }

  function setChips(list) {
    chips.replaceChildren(...list.map((label) => el('button', { type: 'button', class: 'chat__chip', text: label, onclick: () => send(label) })));
  }

  function addMessage(who, reply) {
    const msg = el('div', { class: 'chat__msg chat__msg--' + who }, el('p', { text: reply.text }));
    // reply.entities continua disponível para integrações; não é exibido como rótulo técnico.
    (reply.links || []).forEach((l) => msg.append(el('a', { class: 'chat__link', href: l.href, text: l.text })));
    log.append(msg);
    log.scrollTop = log.scrollHeight;
  }

  let busy = false;
  function send(text, retry) {
    const clean = String(text).trim().slice(0, 200);
    if (!clean || busy) return;
    busy = true;
    if (!retry) addMessage('user', { text: clean });
    const typing = el('div', { class: 'chat__msg chat__msg--bot chat__typing', role: 'status' }, [el('span'), el('span'), el('span'), el('span', { class: 'visually-hidden', text: 'Drone Bot está digitando' })]);
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    avatar.setState(headAvatar, 'thinking');
    // Usa a função pública: uma integração futura que substitua SIDEC.bot.respond também passa por aqui.
    Promise.resolve()
      .then(() => SIDEC.bot.respond(clean))
      .then((reply) => new Promise((resolve) => {
        setTimeout(() => resolve(reply), Math.min(1200, 450 + String(reply.text || '').length * 4)); // "digitação" proporcional
      }))
      .then((reply) => {
        addMessage('bot', reply);
        avatar.setState(headAvatar, reply.intent === 'reclamar' || reply.intent === 'urgente' ? 'alert' : 'talking', 1400);
        setChips(reply.chips && reply.chips.length ? reply.chips : SUGESTOES);
        if (reply.action === 'tour') { closePanel(); startTour(); }
      })
      .catch(() => {
        addMessage('bot', { text: 'Não consegui responder agora. Sua mensagem não se perdeu: use "Tentar de novo".' });
        chips.replaceChildren(el('button', { type: 'button', class: 'chat__chip', text: 'Tentar de novo', onclick: () => send(clean, true) }));
      })
      .finally(() => {
        typing.remove();
        busy = false;
      });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
    input.value = '';
  });

  let closeTimer = null;
  function openPanel() {
    clearTimeout(closeTimer);
    panel.hidden = false;
    panel.classList.remove('is-closing');
    root.requestAnimationFrame(() => panel.classList.add('is-open'));
    launcher.setAttribute('aria-expanded', 'true');
    launcher.classList.add('is-active');
    if (!log.childElementCount) {
      addMessage('bot', REPLIES.saudacao());
      setChips(SUGESTOES);
    }
    avatar.setState(headAvatar, 'happy', 1200);
    input.focus();
  }

  function closePanel() {
    panel.classList.remove('is-open');
    panel.classList.add('is-closing');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('is-active');
    closeTimer = setTimeout(() => { panel.hidden = true; panel.classList.remove('is-closing'); }, 220);
  }

  launcher.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  launcher.addEventListener('pointerenter', () => avatar.setState(launcherAvatar, 'happy', 900));
  closeBtn.addEventListener('click', () => { closePanel(); launcher.focus(); });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePanel(); launcher.focus(); }
  });

  if (new URLSearchParams(root.location.search).get('tour') === '1') root.addEventListener('load', startTour);

  if (inlineHost) {
    addMessage('bot', REPLIES.saudacao());
    setChips(SUGESTOES);
  }

  // Atalhos fora do chat (ex.: página do Drone Bot) enviam uma pergunta pronta.
  doc.querySelectorAll('[data-bot-ask]').forEach((btn) => btn.addEventListener('click', () => {
    if (!inlineHost && panel.hidden) openPanel();
    send(btn.getAttribute('data-bot-ask'));
  }));

  SIDEC.bot = { respond, startTour, open: openPanel, intentOf, entities };
})(window);
