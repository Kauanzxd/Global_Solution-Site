/* SADEC — Central de Operações: modo "Rede real" (API do Node-RED, SQLite, Java e Python).
   Pedidos, drones e histórico do banco; mapa de ruas reais com as rotas ativas; decolar, concluir,
   processar a fila (Java), recuperação de drones e códigos de órgão (só operador).
   Sem telemetria real: posição e bateria em voo são estimadas pela decolagem, distância e autonomia. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { el } = SIDEC.ui;
  const ui = SIDEC.central;
  const $ = (id) => doc.getElementById(id);
  if (!ui) return;

  const STATUS = { aguardando: 'na fila', atribuida: 'drone reservado', em_voo: 'em voo', entregue: 'entregue', reagendada: 'reagendada',
    outro_meio: 'outro meio', aguardando_resgate: 'aguardando resgate', livre: 'disponível', atribuido: 'reservado', aguardando_comercial: 'reservado (comercial)',
    em_voo_comercial: 'em voo (comercial)', pouso_emergencia: 'pouso de emergência', manutencao: 'manutenção', aguardando_liberacao: 'aguardando liberação' };
  // classes de cor dos selos de status (mesma paleta da simulação)
  const SELO = { livre: 'disponivel', atribuido: 'atribuido', aguardando_comercial: 'atribuido', em_voo: 'em_voo', em_voo_comercial: 'em_voo',
    pouso_emergencia: 'pouso_emergencia', manutencao: 'manutencao', aguardando_liberacao: 'aguardando_liberacao' };
  const ORDEM = { em_voo: 0, atribuida: 1, aguardando: 2, reagendada: 3, aguardando_resgate: 4, outro_meio: 5, entregue: 6 };
  const ATIVOS = ['aguardando', 'reagendada', 'atribuida', 'em_voo', 'aguardando_resgate', 'outro_meio'];
  const CARGA = { orgao: 'Órgão', remedio: 'Remédio', kit_emergencia: 'Kit de emergência', exame: 'Exame', encomenda: 'Encomenda' };
  const carga = (p) => CARGA[p.tipo_carga] || p.tipo_carga;
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ativo = () => ui.modo() === 'real';

  let pedidos = [];
  let drones = [];
  let eventos = [];
  let rede = [];
  let foco = null;   // pedido em foco no mapa
  let mapa = null;
  let conta = null;
  let mostrarEntregues = false;
  const acked = new Set();

  const operador = () => conta && conta.perfil === 'operador';
  const est = (p) => SIDEC.mapaOsm.estimarVoo(p, Date.now());

  /* Bateria estimada: no ar, desconta o trecho já voado (distância ÷ autonomia do drone no banco) */
  function bateria(d) {
    const p = pedidos.find((x) => x.drone_codigo === d.codigo && x.status === 'em_voo');
    if (!p) return d.bateria_pct;
    return Math.max(0, d.bateria_pct - (p.distancia_km || 0) / d.autonomia_km * 100 * est(p).f);
  }

  function alertas() {
    const lista = [];
    pedidos.forEach((p) => {
      if (p.status === 'outro_meio') lista.push({ id: 'om-' + p.codigo, kind: 'alerta', label: 'Sem drone elegível · ' + p.codigo + ' · P' + p.prioridade, text: p.motivo || 'Indicar transporte alternativo.' });
      if (p.status === 'aguardando_resgate') lista.push({ id: 'rs-' + p.codigo, kind: 'alerta', label: 'Aguardando resgate · ' + p.codigo, text: 'Pouso de emergência registrado. Recolher a carga e reenviar.' });
      if (p.status === 'em_voo' && est(p).chegou) lista.push({ id: 'ch-' + p.codigo, kind: 'aviso', label: 'Chegada prevista passou · ' + p.codigo, text: 'Confirme a entrega em ' + p.destino + '.', concluir: p.codigo });
    });
    drones.forEach((d) => {
      const b = bateria(d);
      if (['em_voo', 'em_voo_comercial'].includes(d.status) && b < 35) lista.push({ id: 'bt-' + d.codigo, kind: 'aviso', label: 'Bateria baixa · ' + d.codigo, text: 'Estimada em ' + Math.round(b) + '%. Acompanhe a rota restante.' });
      if (d.status === 'pouso_emergencia') lista.push({ id: 'pe-' + d.codigo, kind: 'alerta', label: 'Pouso de emergência · ' + d.codigo, text: 'Drone em solo fora da base. Conclua o resgate.', drone: [d.codigo, 'concluir_resgate', 'Concluir resgate'] });
      if (d.status === 'manutencao') lista.push({ id: 'mn-' + d.codigo, kind: 'info', label: 'Manutenção · ' + d.codigo, text: 'Fora da frota até a inspeção terminar.', drone: [d.codigo, 'concluir_manutencao', 'Concluir manutenção'] });
      if (d.status === 'aguardando_liberacao') lista.push({ id: 'lb-' + d.codigo, kind: 'aviso', label: 'Aguardando liberação · ' + d.codigo, text: 'Inspeção concluída. Libere para voltar à frota.', drone: [d.codigo, 'liberar', 'Liberar drone'] });
    });
    return lista.filter((a) => !acked.has(a.id));
  }

  function botaoPedido(p) {
    if (p.status === 'atribuida' && p.decolagem_manual) return el('button', { type: 'button', class: 'btn btn--light btn--sm', 'data-api-pedido': p.codigo, 'data-api-acao': 'decolar', text: 'Decolar' });
    if (p.status === 'atribuida') return el('span', { class: 'cx-q__auto', 'data-saida': p.codigo, title: 'Saída automática: 5 min entre saídas da filial', text: saidaTexto(p) });
    if (p.status === 'em_voo') return el('button', { type: 'button', class: 'btn ' + (est(p).chegou ? 'btn--light' : 'btn--ghost-light') + ' btn--sm', 'data-api-pedido': p.codigo, 'data-api-acao': 'concluir', text: 'Concluir' });
    return null;
  }
  function botaoDrone(acao) {
    return el('button', { type: 'button', class: 'btn btn--light btn--sm cx-drone__acao', 'data-api-drone': acao[0], 'data-api-acao': acao[1], text: acao[2] });
  }
  const ACAO_DRONE = { pouso_emergencia: 'concluir_resgate', manutencao: 'concluir_manutencao', aguardando_liberacao: 'liberar' };
  const ROTULO_DRONE = { concluir_resgate: 'Concluir resgate', concluir_manutencao: 'Concluir manutenção', liberar: 'Liberar drone' };

  /* P3, P4 e P2 comum saem sozinhos: mostra quanto falta (minutos da operação) para a saída da filial */
  function saidaTexto(p) {
    const faltam = Math.ceil(Math.max(0, (p.saida_em || 0) - Date.now()) * SIDEC.mapaOsm.ESCALA_TEMPO / 60000);
    if (p.prioridade === 4 && faltam <= 0) return 'Aguarda a loja';
    return faltam > 0 ? 'Sai em ' + faltam + ' min' : 'Saindo agora';
  }

  function etaTexto(p) {
    const e = est(p);
    if (!e.chegada) return null;
    return e.chegou ? 'chegou' : 'faltam ' + e.faltamMin + ' de ' + e.duracaoMin + ' min';
  }

  let ultimaFila = '';
  let ultimaFrota = '';
  let ultimosAlertas = '';
  function desenhar(reenquadrar) {
    if (!ativo()) return;
    const ativos = pedidos.filter((p) => ATIVOS.includes(p.status));
    const voando = pedidos.filter((p) => p.status === 'em_voo').sort((a, b) => a.prioridade - b.prioridade);
    const espera = pedidos.filter((p) => ['aguardando', 'reagendada', 'atribuida'].includes(p.status));
    const prios = {};
    espera.forEach((p) => { prios[p.prioridade] = (prios[p.prioridade] || 0) + 1; });
    const livres = drones.filter((d) => d.status === 'livre');
    const lista = alertas();
    const top = voando[0];
    ui.kpis({
      voo: voando.length,
      vooSub: top ? 'Mais urgente: ' + top.codigo + ' · ' + (etaTexto(top) || '') : 'Nenhum drone no ar',
      fila: espera.length, prios,
      livres: livres.length, total: drones.length,
      frotaSub: livres.length ? 'Bateria média dos livres: ' + Math.round(livres.reduce((s, d) => s + d.bateria_pct, 0) / livres.length) + '%' : 'Nenhum drone livre agora',
      alertas: lista.length,
      alertasSub: lista.length ? lista[0].label : 'Tudo sob controle'
    });

    const fv = top ? est(top) : null;
    ui.voo(top ? { prio: top.prioridade, id: top.codigo, titulo: carga(top) + ' · ' + (top.origem || 'Filial') + ' → ' + top.destino, label: fv.chegou ? 'Chegada prevista passou' : 'Chega em', eta: fv.chegou ? 'chegou' : fv.faltamMin + ' min', f: fv.f } : null);

    // Mapa: rotas dos pedidos ativos com drone; o pedido em foco fica destacado
    if (!mapa) mapa = SIDEC.mapaOsm.criar($('cx-osm-svg'), { aoEscolher: (id) => { foco = foco === id ? null : id; desenhar(true); } });
    const rotas = ativos.filter((p) => p.rota && p.rota.length >= 2 && ['atribuida', 'em_voo'].includes(p.status))
      .map((p) => ({ id: p.codigo, pontos: p.rota, progresso: est(p).f, prio: p.prioridade, drone: p.drone_codigo ? p.drone_codigo + ' · ' + p.codigo : null }));
    if (foco && !rotas.some((r) => r.id === foco)) foco = null;
    mapa.mostrar({ rotas, rede, foco }, reenquadrar);

    // Fila
    const visiveis = pedidos.filter((p) => (mostrarEntregues || p.status !== 'entregue') && (!ui.filtro || p.prioridade === ui.filtro))
      .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || a.prioridade - b.prioridade || b.codigo.localeCompare(a.codigo));
    const entregues = pedidos.filter((p) => p.status === 'entregue').length;
    $('fila-count').textContent = visiveis.length + ' de ' + pedidos.length;
    const chaveFila = foco + '|' + ui.filtro + '|' + mostrarEntregues + '|' + visiveis.map((p) => p.codigo + p.status + (est(p).chegou ? 'c' : '')).join(',');
    if (chaveFila !== ultimaFila) {
      ultimaFila = chaveFila;
      $('queue-body').replaceChildren(...(visiveis.length ? visiveis.map((p) => ui.linhaFila({
        id: p.codigo, prio: p.prioridade, titulo: carga(p) + ' · ' + p.codigo, ativo: p.codigo === foco,
        sub: (p.origem || 'Filial') + ' → ' + p.destino + ' · ' + String(p.distancia_km || 0).replace('.', ',') + ' km' + (p.drone_codigo ? ' · ' + p.drone_codigo : ''),
        estado: STATUS[p.status] || p.status, estadoClasse: 'is-' + p.status, eta: p.status === 'em_voo' ? etaTexto(p) : null,
        acao: botaoPedido(p), motivo: p.motivo
      })) : [ui.vazio('Nenhum pedido com esse filtro.')]).concat(entregues ? [el('li', { class: 'cx-q__more' },
        el('button', { type: 'button', class: 'cx-link', 'data-entregues': '1', text: mostrarEntregues ? 'Ocultar entregues' : 'Mostrar entregues (' + entregues + ')' }))] : []));
    } else {
      visiveis.filter((p) => p.status === 'em_voo').forEach((p) => {
        const n = doc.querySelector('[data-eta="' + p.codigo + '"]');
        if (n) n.textContent = etaTexto(p);
      });
      visiveis.filter((p) => p.status === 'atribuida' && !p.decolagem_manual).forEach((p) => {
        const n = doc.querySelector('[data-saida="' + p.codigo + '"]');
        if (n) n.textContent = saidaTexto(p);
      });
    }

    // Frota
    const missao = (d) => {
      const p = pedidos.find((x) => x.drone_codigo === d.codigo && ['atribuida', 'em_voo'].includes(x.status));
      return p ? 'P' + p.prioridade + ' · ' + p.codigo + ' → ' + p.destino + (p.status === 'em_voo' ? ' · ' + etaTexto(p) : (p.decolagem_manual ? ' · aguarda decolagem do operador' : ' · saída automática')) : null;
    };
    const meta = (d) => d.filial + ' · ~' + Math.round(d.autonomia_km * bateria(d) / 100) + ' km de alcance';
    const chaveFrota = foco + '|' + drones.map((d) => d.codigo + d.status + (missao(d) ? 'm' : '')).join(',');
    if (chaveFrota !== ultimaFrota) {
      ultimaFrota = chaveFrota;
      const pedidoFoco = pedidos.find((p) => p.codigo === foco);
      $('fleet-list').replaceChildren(...drones.map((d) => ui.cartaoDrone({
        id: d.codigo, nome: d.codigo, codigo: d.modelo, status: SELO[d.status] || d.status, statusTxt: STATUS[d.status] || d.status,
        bateria: bateria(d), meta: meta(d), missao: missao(d), ativo: Boolean(pedidoFoco && pedidoFoco.drone_codigo === d.codigo),
        acao: ACAO_DRONE[d.status] ? botaoDrone([d.codigo, ACAO_DRONE[d.status], ROTULO_DRONE[ACAO_DRONE[d.status]]]) : null
      })));
    } else {
      drones.forEach((d) => ui.atualizarDrone(d.codigo, bateria(d), meta(d), missao(d)));
    }

    // Alertas
    const chaveAlertas = lista.map((a) => a.id).join('|');
    $('alert-count').textContent = String(lista.length);
    if (chaveAlertas !== ultimosAlertas) {
      ultimosAlertas = chaveAlertas;
      $('alert-list').replaceChildren(...(lista.length ? lista.map((a) => ui.alerta(Object.assign({}, a, {
        acao: a.drone ? botaoDrone(a.drone)
          : (a.concluir ? el('button', { type: 'button', class: 'btn btn--light btn--sm', 'data-api-pedido': a.concluir, 'data-api-acao': 'concluir', text: 'Concluir' }) : null)
      }))) : [ui.vazio('Nada pendente. Tudo sob controle.')]));
    }
  }

  function desenharLog() {
    if (!ativo()) return;
    ui.log(eventos.slice(0, 18).map((e) => ({
      hora: String(e.data_hora || '').slice(11, 16),
      msg: (e.pedido_codigo ? e.pedido_codigo + ': ' : (e.drone_codigo ? e.drone_codigo + ': ' : '')) + e.descricao + (e.responsavel ? ' (' + e.responsavel + ')' : ''),
      tipo: /emerg|resgate|recus|outro meio/i.test(e.descricao) ? 'erro' : (e.status_novo === 'entregue' ? 'ok' : 'info')
    })));
  }

  async function carregar(reenquadrar) {
    const [p, d, ev] = await Promise.all([SIDEC.api.get('/api/pedidos'), SIDEC.api.get('/api/drones'), SIDEC.api.get('/api/eventos')]);
    if (!p.ok || !d.ok) { if (ativo()) ui.mensagem(SIDEC.api.mensagemErro(p.ok ? d : p), false); return; }
    pedidos = p.dados;
    drones = d.dados;
    eventos = ev.ok ? ev.dados : [];
    desenhar(reenquadrar);
    desenharLog();
  }

  /* Conta: o operador decola, conclui, processa a fila e emite códigos; os demais só acompanham */
  async function carregarConta() {
    const s = SIDEC.api.sessao.atual();
    const r = s ? await SIDEC.api.get('/api/conta') : { ok: false };
    conta = r.ok ? r.dados : null;
    $('cx-conta-nome').textContent = conta ? conta.nome : 'Entrar como operador';
    $('cx-conta-ini').textContent = conta ? conta.nome.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() : 'OP';
    $('cx-conta').classList.toggle('is-operador', Boolean(operador()));
    $('codigo-form').hidden = !operador();
    if (!operador()) {
      $('api-conta').replaceChildren(conta ? 'Conectado como ' + conta.nome + '. ' : '', 'Decolar, concluir, processar a fila e emitir códigos exigem conta de operador. ', el('a', { href: 'entrar.html#central', text: 'Entrar como operador' }));
      $('codigo-lista').replaceChildren();
      return;
    }
    $('api-conta').textContent = 'Cada código vale para um transporte de órgão do hospital escolhido. Informe o código ao hospital.';
    if (!$('codigo-hospital').options.length) {
      $('codigo-hospital').replaceChildren(...rede.map((x) => el('option', { value: x.nome, text: x.nome })));
    }
    await carregarCodigos();
  }

  async function carregarCodigos() {
    const r = await SIDEC.api.get('/api/codigos-orgao');
    if (!r.ok) { $('api-conta').textContent = SIDEC.api.mensagemErro(r); return; }
    $('codigo-lista').replaceChildren(...(r.dados.length ? r.dados.slice(0, 8).map((c) => el('li', { class: 'cx-code' + (c.status === 'usado' ? ' is-usado' : '') }, [
      el('span', { class: 'cx-code__cod mono', text: c.codigo }),
      el('span', { class: 'cx-code__info', text: c.hospital }),
      el('span', { class: 'cx-code__st', text: c.status === 'usado' ? 'usado em ' + c.pedido_codigo : 'ativo até ' + hhmm(new Date(c.expira_em).getTime()) })
    ])) : [ui.vazio('Nenhum código emitido.')]));
  }

  /* ---------- Ações ---------- */
  async function acao(b) {
    if (b.disabled) return;
    b.disabled = true;
    const tipo = b.getAttribute('data-api-acao');
    let r;
    if (b.hasAttribute('data-api-pedido')) r = await SIDEC.api.post('/api/pedidos/' + b.getAttribute('data-api-pedido') + '/' + tipo);
    else r = await SIDEC.api.post('/api/drones/' + b.getAttribute('data-api-drone') + '/recuperacao', { acao: tipo });
    b.disabled = false;
    const nomes = { decolar: 'Decolagem registrada', concluir: 'Entrega concluída', concluir_resgate: 'Resgate concluído', concluir_manutencao: 'Manutenção concluída', liberar: 'Drone liberado' };
    ui.mensagem(r.ok ? nomes[tipo] + ' e gravado no histórico da Central.' : SIDEC.api.mensagemErro(r), r.ok);
    await carregar(false);
  }

  async function processarFila() {
    const r = await SIDEC.api.post('/api/fila/processar');
    if (!r.ok) { ui.mensagem(SIDEC.api.mensagemErro(r), false); return; }
    const n = r.dados.processados.length;
    ui.mensagem(n ? n + ' pedido(s) avaliados pela Central Java: ' + r.dados.processados.map((x) => x.codigo + (x.atribuido ? ' → ' + x.drone_codigo : ' → outro meio')).join(', ') + '.' : 'Fila vazia na Central.', true);
    await carregar(true);
  }

  function ligarEventos() {
    $('btn-processar').addEventListener('click', () => { if (ativo()) processarFila(); });
    doc.addEventListener('click', (ev) => {
      if (!ativo()) return;
      const b = ev.target.closest('[data-api-acao]');
      if (b) { acao(b); return; }
      const ack = ev.target.closest('#alert-list [data-ack]');
      if (ack) { acked.add(ack.getAttribute('data-ack')); ultimosAlertas = ''; desenhar(false); return; }
      const ent = ev.target.closest('[data-entregues]');
      if (ent) { mostrarEntregues = !mostrarEntregues; desenhar(false); return; }
      const f = ev.target.closest('[data-focar]');
      if (f) { foco = foco === f.getAttribute('data-focar') ? null : f.getAttribute('data-focar'); desenhar(true); return; }
      const sel = ev.target.closest('[data-sel-drone]');
      if (sel) {
        const p = pedidos.find((x) => x.drone_codigo === sel.getAttribute('data-sel-drone') && ['atribuida', 'em_voo'].includes(x.status));
        foco = p && foco !== p.codigo ? p.codigo : null;
        ultimaFrota = '';
        desenhar(true);
        if (!p) ui.mensagem(sel.getAttribute('data-sel-drone') + ' não está em missão agora.', true);
        return;
      }
      const z = ev.target.closest('[data-cx-zoom]');
      if (z && mapa) {
        const k = z.getAttribute('data-cx-zoom');
        if (k === 'fit') { foco = null; desenhar(true); } else mapa.zoom(k === 'in' ? 1 : -1);
      }
    });
    $('codigo-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const r = await SIDEC.api.post('/api/codigos-orgao', { hospital: $('codigo-hospital').value });
      ui.mensagem(r.ok ? 'Código ' + r.dados.codigo + ' emitido para ' + r.dados.hospital + '. Vale para um único transporte.' : SIDEC.api.mensagemErro(r), r.ok);
      carregarCodigos();
    });
    doc.addEventListener('cx:filtro', () => { ultimaFila = ''; desenhar(false); });
    doc.addEventListener('cx:modo', () => {
      ultimaFila = ''; ultimaFrota = ''; ultimosAlertas = '';
      $('cx-osm').hidden = !ativo();
      if (ativo()) { desenhar(true); desenharLog(); }
    });
  }

  async function iniciar() {
    const botao = doc.querySelector('.cx-modo [data-modo="real"]');
    const online = await SIDEC.api.disponivel();
    $('cx-modo-real').textContent = online ? 'API · São Paulo' : 'API desligada';
    if (!online) {
      botao.title = 'Rode "npm run api" para ver os pedidos reais da demonstração integrada.';
      $('api-conta').textContent = 'API desligada. Rode "npm run api" para ver os pedidos reais.';
      return;
    }
    botao.disabled = false;
    const locais = await SIDEC.api.get('/api/locais');
    if (locais.ok) rede = locais.dados.filter((l) => l.tipo === 'hospital' && typeof l.lat === 'number');
    ligarEventos();
    await carregarConta();
    await carregar(false);
    // Rede real por padrão quando a API está no ar (a escolha do operador é lembrada)
    const hash = root.location.hash;
    const preferido = hash === '#codigos' ? 'real' : (hash === '#cenarios' || hash === '#nova-solicitacao' ? 'sim' : (ui.modoSalvo() || 'real'));
    if (preferido === 'real') ui.definirModo('real', false);
    root.setInterval(() => { if (!doc.hidden) carregar(false); }, 5000);
  }

  iniciar();
})(window);
