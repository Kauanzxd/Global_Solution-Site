/* SADEC — avatar do Drone Bot.
   Usa o desenho original (assets/icons/drone-bot.svg; versão cinza para fundo escuro) dentro de um <svg>,
   para funcionar tanto em HTML quanto aninhado em mapas SVG (rastreamento e delivery).
   Os estados (pensando, falando, feliz, alerta) são classes CSS animadas em drone-bot.css. */
(function (root) {
  'use strict';
  const SIDEC = (root.SIDEC = root.SIDEC || {});
  const NS = 'http://www.w3.org/2000/svg';
  const doc = root.document;
  const base = (doc.body && doc.body.getAttribute('data-base')) || '';

  function svgEl(tag, attrs, children) {
    const node = doc.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    (children || []).forEach((c) => node.append(c));
    return node;
  }

  /* label: texto acessível; sem label o avatar é decorativo (aria-hidden).
     tone: 'gray' usa a versão cinza, indicada sobre fundo escuro. */
  function create(options) {
    const opts = options || {};
    const file = opts.tone === 'gray' ? 'drone-cinza.svg' : 'drone-bot.svg';
    const svg = svgEl('svg', { class: 'db ' + (opts.className || ''), viewBox: '0 0 100 100', focusable: 'false' }, [
      svgEl('g', { class: 'db-float' }, [
        svgEl('circle', { class: 'db-ring', cx: '50', cy: '50', r: '44' }),
        svgEl('image', { class: 'db-img', href: base + 'assets/icons/' + file, x: '0', y: '0', width: '100', height: '100' })
      ])
    ]);
    if (opts.label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', opts.label);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    return svg;
  }

  const STATES = ['is-thinking', 'is-talking', 'is-happy', 'is-alert'];
  const timers = new WeakMap();

  /* Troca o estado visual (classe CSS). Com duração, volta ao repouso sozinho. */
  function setState(svg, state, ms) {
    if (!svg) return;
    clearTimeout(timers.get(svg));
    STATES.forEach((s) => svg.classList.remove(s));
    if (state) svg.classList.add('is-' + state);
    if (state && ms) timers.set(svg, setTimeout(() => svg.classList.remove('is-' + state), ms));
  }

  doc.querySelectorAll('[data-drone-avatar]').forEach((slot) => {
    slot.append(create({
      label: slot.getAttribute('data-drone-avatar') || '',
      className: slot.getAttribute('data-avatar-class') || '',
      tone: slot.getAttribute('data-avatar-tone') || ''
    }));
  });

  SIDEC.droneAvatar = { create, setState };
})(window);
