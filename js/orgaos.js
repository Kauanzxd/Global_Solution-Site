/* SADEC — Missão P1 demonstrativa (orgaos.html).
   Tudo aqui é simulação: o relógio parte de valores fictícios e o drone percorre a rota uma única vez.
   Com "reduzir movimento" o drone fica parado no ponto atual; com a aba oculta, nada é recalculado. */
(function (root) {
  'use strict';
  const doc = root.document;
  const page = doc.querySelector('[data-mission]');
  if (!page) return;

  const path = doc.getElementById('mission-path');
  const drone = page.querySelector('[data-mission-drone]');
  const pulse = page.querySelector('[data-mission-drone-pulse]');
  const elapsedEl = page.querySelector('[data-mission-elapsed]');
  const kmEl = page.querySelector('[data-mission-km]');
  const cpEl = page.querySelector('[data-mission-cp]');
  const windowEl = page.querySelector('[data-mission-window]');
  const status = doc.getElementById('mission-status');

  const START_MIN = 146;      // 2 h 26 em preservação no início da demonstração
  const TOTAL_KM = 9.8;
  const FROM = 0.62;          // fração da rota já percorrida (6,1 km)
  const FLIGHT_MS = 90000;    // duração da demonstração até o pouso
  const reduce = root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = Date.now();
  const len = path.getTotalLength();

  const fmtKm = (n) => n.toFixed(1).replace('.', ',');

  function frame() {
    if (doc.hidden) return;
    const ms = Date.now() - t0;
    const k = reduce ? 0 : Math.min(1, ms / FLIGHT_MS);
    const frac = FROM + (1 - FROM) * k;
    const p = path.getPointAtLength(len * frac);
    drone.setAttribute('cx', p.x.toFixed(1));
    drone.setAttribute('cy', p.y.toFixed(1));
    pulse.setAttribute('cx', p.x.toFixed(1));
    pulse.setAttribute('cy', p.y.toFixed(1));
    kmEl.textContent = fmtKm(TOTAL_KM * frac) + ' / ' + fmtKm(TOTAL_KM) + ' km';
    cpEl.textContent = frac < 0.8 ? '2' : '3';
    const min = START_MIN + Math.floor(ms / 60000);
    elapsedEl.textContent = Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
    windowEl.setAttribute('data-progress', String(Math.round(frac * 10)));
    if (reduce) return; // movimento reduzido: um único quadro, sem laço
    if (k >= 1) {
      page.classList.add('is-landed');
      return;
    }
    root.requestAnimationFrame(frame);
  }

  root.requestAnimationFrame(frame);
  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden && !page.classList.contains('is-landed')) root.requestAnimationFrame(frame);
  });

  const MSG = {
    call: 'Demonstração: em uma operação real, a Central ligaria para a equipe receptora do Centro B. Nenhuma ligação é feita.',
    abort: 'Demonstração: o voo seria abortado e o SDC-07 seguiria para a zona de pouso seguro mais próxima. A ocorrência ficaria registrada e o drone iria para manutenção.'
  };

  page.querySelectorAll('[data-demo-action]').forEach((btn) => btn.addEventListener('click', () => {
    status.textContent = MSG[btn.getAttribute('data-demo-action')];
    status.classList.add('is-success');
  }));
})(window);
