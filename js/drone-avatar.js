/* SIDEC — avatar do Drone Bot em SVG inline.
   Fonte do desenho: assets/avatars/drone-bot.json. O "path" original foi apenas dividido nos seus subcaminhos
   (corpo, braços, hélices) para animar partes isoladas; nenhuma coordenada foi alterada. */
(function (root) {
  'use strict';
  const SIDEC = (root.SIDEC = root.SIDEC || {});
  const NS = 'http://www.w3.org/2000/svg';
  const doc = root.document;

  const BODY = 'M50 30C66 30 72 38 72 50C72 62 66 70 50 70C34 70 28 62 28 50C28 38 34 30 50 30Z';
  const ARMS = [
    'M62 36C66 36 74 30 78 26C80 24 82 26 82 28C82 30 80 32 76 36C72 40 68 42 62 40Z',
    'M62 64C66 64 74 70 78 74C80 76 82 74 82 72C82 70 80 68 76 64C72 60 68 58 62 60Z',
    'M38 36C34 36 26 30 22 26C20 24 18 26 18 28C18 30 20 32 24 36C28 40 32 42 38 40Z',
    'M38 64C34 64 26 70 22 74C20 76 18 74 18 72C18 70 20 68 24 64C28 60 32 58 38 60Z'
  ];
  const PROPS = [
    ['tl', 'M23 20C24 20 25 21 25 22L25 23C30 23 34 22 36 22C37 22 37.5 23 37.5 24C37.5 25 37 26 36 26C34 26 30 25 25 25L25 26C25 27 24 28 23 28C22 28 21 27 21 26L21 25C16 25 12 26 10 26C9 26 8.5 25 8.5 24C8.5 23 9 22 10 22C12 22 16 23 21 23L21 22C21 21 22 20 23 20Z'],
    ['tr', 'M77 20C78 20 79 21 79 22L79 23C84 23 88 22 90 22C91 22 91.5 23 91.5 24C91.5 25 91 26 90 26C88 26 84 25 79 25L79 26C79 27 78 28 77 28C76 28 75 27 75 26L75 25C70 25 66 26 64 26C63 26 62.5 25 62.5 24C62.5 23 63 22 64 22C66 22 70 23 75 23L75 22C75 21 76 20 77 20Z'],
    ['bl', 'M23 72C24 72 25 73 25 74L25 75C30 75 34 74 36 74C37 74 37.5 75 37.5 76C37.5 77 37 78 36 78C34 78 30 77 25 77L25 78C25 79 24 80 23 80C22 80 21 79 21 78L21 77C16 77 12 78 10 78C9 78 8.5 77 8.5 76C8.5 75 9 74 10 74C12 74 16 75 21 75L21 74C21 73 22 72 23 72Z'],
    ['br', 'M77 72C78 72 79 73 79 74L79 75C84 75 88 74 90 74C91 74 91.5 75 91.5 76C91.5 77 91 78 90 78C88 78 84 77 79 77L79 78C79 79 78 80 77 80C76 80 75 79 75 78L75 77C70 77 66 78 64 78C63 78 62.5 77 62.5 76C62.5 75 63 74 64 74C66 74 70 75 75 75L75 74C75 73 76 72 77 72Z']
  ];
  const EYES = { x: 50, y: 48, spacing: 14, scale: 1.1 };

  function svgEl(tag, attrs, children) {
    const node = doc.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    (children || []).forEach((c) => node.append(c));
    return node;
  }

  function eye(cx) {
    const w = 4 * EYES.scale;
    const h = 6 * EYES.scale;
    return svgEl('g', { class: 'db-eye' }, [
      svgEl('rect', { x: (cx - w / 2).toFixed(2), y: (EYES.y - h / 2).toFixed(2), width: w.toFixed(2), height: h.toFixed(2), rx: (w / 2).toFixed(2) })
    ]);
  }

  /* label: texto acessível; sem label o avatar é decorativo (aria-hidden). */
  function create(options) {
    const opts = options || {};
    const svg = svgEl('svg', { class: 'db ' + (opts.className || ''), viewBox: '0 0 100 100', focusable: 'false' }, [
      svgEl('g', { class: 'db-float' }, [
        svgEl('circle', { class: 'db-ring', cx: '50', cy: '50', r: '26' }),
        svgEl('g', { class: 'db-body' }, [svgEl('path', { d: BODY })].concat(ARMS.map((d) => svgEl('path', { d })))),
        svgEl('g', { class: 'db-props' }, PROPS.map(([pos, d]) => svgEl('g', { class: 'db-prop db-prop--' + pos }, [svgEl('path', { d })]))),
        svgEl('g', { class: 'db-eyes' }, [eye(EYES.x - EYES.spacing / 2), eye(EYES.x + EYES.spacing / 2)])
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
    slot.append(create({ label: slot.getAttribute('data-drone-avatar') || '', className: slot.getAttribute('data-avatar-class') || '' }));
  });

  SIDEC.droneAvatar = { create, setState };
})(window);
