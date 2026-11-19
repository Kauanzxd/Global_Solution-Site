/* SIDEC — interações compartilhadas: menu mobile, accordion e utilitários de DOM. */
(function (root) {
  'use strict';
  const SIDEC = (root.SIDEC = root.SIDEC || {});
  const doc = root.document;
  doc.documentElement.classList.add('js');

  /* Cria elementos com texto seguro (textContent), sem innerHTML. */
  function el(tag, attrs, children) {
    const node = doc.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach((c) => {
      if (c !== null && c !== undefined && c !== false) node.append(c);
    });
    return node;
  }

  function initMenu() {
    const toggle = doc.querySelector('.nav-toggle');
    const nav = doc.getElementById('site-nav');
    if (!toggle || !nav) return;
    const label = toggle.querySelector('.visually-hidden');
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      label.textContent = open ? 'Fechar menu' : 'Abrir menu';
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      setOpen(open);
      if (open) nav.querySelector('a').focus();
    });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    // botão "Menu" da barra de abas do celular abre o mesmo painel
    const tabMenu = doc.querySelector('[data-open-menu]');
    if (tabMenu) tabMenu.addEventListener('click', () => {
      const open = !nav.classList.contains('is-open');
      setOpen(open);
      tabMenu.setAttribute('aria-expanded', String(open));
      if (open) nav.querySelector('a').focus();
    });
    doc.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && !toggle.contains(e.target) && !(tabMenu && tabMenu.contains(e.target))) setOpen(false);
    });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); }); // âncoras internas (#secao) não trocam de página
    root.matchMedia('(min-width: 1240px)').addEventListener('change', () => setOpen(false));
  }

  /* Accordion acessível: botão com aria-expanded controla o painel; painel fechado fica inerte. */
  function initAccordions() {
    doc.querySelectorAll('[data-accordion]').forEach((acc) => {
      const triggers = acc.querySelectorAll('.accordion__trigger');
      triggers.forEach((btn) => {
        const panel = doc.getElementById(btn.getAttribute('aria-controls'));
        panel.inert = btn.getAttribute('aria-expanded') !== 'true';
        btn.addEventListener('click', () => {
          const open = btn.getAttribute('aria-expanded') !== 'true';
          btn.setAttribute('aria-expanded', String(open));
          panel.classList.toggle('is-open', open);
          panel.inert = !open;
        });
      });
      acc.addEventListener('keydown', (e) => {
        const list = Array.from(triggers);
        const i = list.indexOf(doc.activeElement);
        if (i < 0) return;
        const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        list[(next + list.length) % list.length].focus();
      });
    });
  }

  /* Revelação ao rolar: só marca a classe; o CSS só anima sem "reduzir movimento".
     Sem IntersectionObserver o conteúdo fica visível (nunca escondido por falta de JS). */
  function initReveal() {
    const items = doc.querySelectorAll('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in root)) { items.forEach((n) => n.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    items.forEach((n) => io.observe(n));
  }

  /* Abas acessíveis ([data-tabs]): setas, Home/End; cada aba mostra o painel de aria-controls. */
  function initTabs() {
    doc.querySelectorAll('[data-tabs]').forEach((list) => {
      const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
      function select(tab, focus) {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          doc.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        });
        if (focus) tab.focus();
      }
      tabs.forEach((t, i) => {
        t.addEventListener('click', () => select(t));
        t.addEventListener('keydown', (e) => {
          const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
          if (next === undefined) return;
          e.preventDefault();
          select(tabs[(next + tabs.length) % tabs.length], true);
        });
      });
    });
  }

  initMenu();
  initAccordions();
  initTabs();
  initReveal();

  SIDEC.ui = { el };
})(window);
