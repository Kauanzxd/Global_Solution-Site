/* SADEC — widget do chatbot (servido pelo Node-RED em /sadec/widget.js).
   Incorporação:  <script src="http://localhost:1880/sadec/widget.js" defer></script>
   Se houver um elemento #sadec-widget na página, o painel abre dentro dele; senão vira botão flutuante.
   Conversa com POST /sadec/mensagem (mesmo fluxo do Webchat e do Telegram). Não usa nem expõe chaves. */
(function () {
  'use strict';
  var script = document.currentScript;
  var BASE = script ? script.src.replace(/\/sadec\/widget\.js.*$/, '') : 'http://localhost:1880';
  var sessao = 'w' + Math.random().toString(36).slice(2, 12);

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = BASE + '/sadec/widget.css';
  document.head.appendChild(css);

  function criar(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto) n.textContent = texto;
    return n;
  }

  var alvo = document.getElementById('sadec-widget');
  var raiz = criar('div', 'sdw' + (alvo ? ' sdw--inline' : ''));
  var botao = criar('button', 'sdw__abrir', 'Falar com o SADEC');
  botao.type = 'button';
  botao.setAttribute('aria-expanded', 'false');
  var painel = criar('section', 'sdw__painel');
  painel.setAttribute('aria-label', 'Assistente SADEC');
  var topo = criar('div', 'sdw__topo');
  topo.appendChild(criar('strong', null, 'Assistente SADEC'));
  var fechar = criar('button', 'sdw__fechar', '×');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar');
  topo.appendChild(fechar);
  var log = criar('ol', 'sdw__log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  var form = criar('form', 'sdw__form');
  var rotulo = criar('label', 'sdw__oculto', 'Mensagem');
  rotulo.setAttribute('for', 'sdw-texto');
  var campo = criar('input', 'sdw__campo');
  campo.id = 'sdw-texto';
  campo.maxLength = 500;
  campo.autocomplete = 'off';
  campo.placeholder = 'Ex.: onde está o SD1001?';
  var enviar = criar('button', 'sdw__enviar', 'Enviar');
  enviar.type = 'submit';
  form.appendChild(rotulo);
  form.appendChild(campo);
  form.appendChild(enviar);
  painel.appendChild(topo);
  painel.appendChild(log);
  painel.appendChild(form);
  painel.appendChild(criar('p', 'sdw__nota', 'Demonstração acadêmica. Em emergência real, ligue 192 (SAMU) ou 199 (Defesa Civil).'));
  if (!alvo) raiz.appendChild(botao);
  raiz.appendChild(painel);
  (alvo || document.body).appendChild(raiz);

  function abrir(sim) {
    raiz.classList.toggle('is-aberto', sim);
    botao.setAttribute('aria-expanded', String(sim));
    if (sim && !alvo) campo.focus();
  }
  function falar(quem, texto, extra) {
    var li = criar('li', 'sdw__msg sdw__msg--' + quem + (extra ? ' ' + extra : ''), texto);
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }

  botao.addEventListener('click', function () { abrir(!raiz.classList.contains('is-aberto')); });
  fechar.addEventListener('click', function () { abrir(false); if (!alvo) botao.focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && raiz.classList.contains('is-aberto') && !alvo) abrir(false); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var texto = campo.value.trim();
    if (!texto) return;
    falar('eu', texto);
    campo.value = '';
    enviar.disabled = true;
    var espera = falar('bot', 'Digitando…', 'is-carregando');
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 15000);
    fetch(BASE + '/sadec/mensagem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessao: sessao, texto: texto }), signal: ctrl.signal
    }).then(function (r) { return r.json(); }).then(function (j) {
      espera.remove();
      falar('bot', (j && j.resposta) || 'Não recebi resposta. Tente de novo.');
    }).catch(function () {
      espera.remove();
      falar('bot', 'O assistente está indisponível agora (Node-RED desligado?).', 'is-erro');
    }).finally(function () {
      clearTimeout(timer);
      enviar.disabled = false;
    });
  });

  if (alvo) abrir(true);
  falar('bot', 'Olá! Posso rastrear uma entrega (ex.: SD1001), pedir remédio de uso contínuo ou registrar um problema.');
})();
