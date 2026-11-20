/* SIDEC — página inicial: painel ao vivo, fluxo em etapas e simulador de subsídio cruzado. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const { ops, store } = SIDEC;

  /* Painel do hero: lê o mesmo estado usado pela central e pelo rastreamento. */
  function renderStrip() {
    if (document.hidden) return; // aba oculta: não gasta CPU
    const state = store.get();
    ops.tick(state, Date.now());
    const fila = ops.sortQueue(state);
    const voo = state.entregas.find((x) => x.status === 'em_voo');
    const prio = doc.getElementById('hero-flight-prio');
    if (!prio) return;
    const lugar = (id) => (ops.byId(state.filiais, id) || ops.byId(state.locais, id) || {}).nome || id;
    if (voo) {
      const p = ops.flightProgress(voo, Date.now());
      const restS = Math.max(0, Math.ceil(((1 - p) * voo.duracaoMs * SIDEC.ops.ESCALA_TEMPO) / 1000)); // tempo da operação
      prio.textContent = 'P' + voo.prioridade;
      prio.setAttribute('data-prio', String(voo.prioridade));
      doc.getElementById('hero-flight').textContent = 'Em voo · ' + voo.carga;
      doc.getElementById('hero-flight-sub').textContent = lugar(voo.origemId) + ' → ' + lugar(voo.destinoId) + ' · em trânsito';
      doc.getElementById('hero-flight-min').textContent = Math.floor(restS / 60) + ':' + String(restS % 60).padStart(2, '0');
      doc.getElementById('hero-progress').value = Math.round(p * 100);
    } else {
      const prox = fila[0];
      prio.textContent = prox ? 'P' + prox.prioridade : '—';
      prio.setAttribute('data-prio', prox ? String(prox.prioridade) : '0');
      doc.getElementById('hero-flight').textContent = prox ? 'Próximo da fila · ' + prox.carga : 'Fila vazia';
      doc.getElementById('hero-flight-sub').textContent = 'Nenhum drone em voo. Decole uma entrega na Central.';
      doc.getElementById('hero-flight-min').textContent = fila.length + ' na fila';
      doc.getElementById('hero-progress').value = 0;
    }
  }

  /* Abas do fluxo "como funciona" (padrão WAI-ARIA tabs, setas e Home/End). */
  function initFlow() {
    const tabs = Array.from(doc.querySelectorAll('[data-flow] [role="tab"]'));
    if (!tabs.length) return;
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        doc.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const t = tabs[(next + tabs.length) % tabs.length];
        select(t);
        t.focus();
      });
    });
  }

  /* Simulador ilustrativo: premissas fixas e explícitas na página. */
  function initSubsidy() {
    const range = doc.getElementById('subsidy-range');
    if (!range) return;
    const TAXA = 9;
    const FUNDO = 0.35;
    const CUSTO_SAUDE = 28;
    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    const num = new Intl.NumberFormat('pt-BR');
    const update = () => {
      const n = Number(range.value);
      const receita = n * TAXA;
      const fundo = receita * FUNDO;
      const saude = Math.floor(fundo / CUSTO_SAUDE);
      doc.getElementById('subsidy-value').textContent = num.format(n);
      doc.getElementById('subsidy-revenue').textContent = brl.format(receita);
      doc.getElementById('subsidy-fund').textContent = brl.format(fundo);
      doc.getElementById('subsidy-health').textContent = num.format(saude);
      doc.getElementById('subsidy-meter').value = saude;
      range.setAttribute('aria-valuetext', num.format(n) + ' entregas comerciais, financiando ' + num.format(saude) + ' entregas de saúde');
    };
    range.addEventListener('input', update);
    doc.getElementById('subsidy').addEventListener('submit', (e) => e.preventDefault());
    update();
  }

  renderStrip();
  setInterval(renderStrip, 1000);
  store.subscribe(renderStrip);
  initFlow();
  initSubsidy();
})(window);
