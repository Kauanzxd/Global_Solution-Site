/* SADEC — Entrar (demonstração).
   Não existe autenticação: nada é verificado, enviado ou guardado (nem em localStorage).
   Fluxo: perfil e credenciais -> código de 6 dígitos (sempre) -> acesso rápido -> pronto. */
(function (root) {
  'use strict';
  const doc = root.document;
  const form = doc.getElementById('login-form');
  if (!form) return;
  const $ = (id) => doc.getElementById(id);

  const PROFILES = {
    saude: { userLabel: 'E-mail institucional', ph: 'nome@unidade.org', dest: 'Você vai para o SADEC Saúde', href: 'saude/index.html', cta: 'Abrir o SADEC Saúde', codeMsg: 'Enviamos um código ao celular da sua unidade. Toda conta de saúde usa verificação em duas etapas.' },
    cliente: { userLabel: 'E-mail', ph: 'nome@dominio.com', dest: 'Você vai para o SADEC Delivery', href: 'delivery/index.html', cta: 'Começar a pedir', codeMsg: 'Enviamos um código ao celular cadastrado. Ele confirma que o pedido sai da sua conta.' },
    operador: { userLabel: 'Matrícula', ph: 'OP-0000', dest: 'Você vai para a Central de Operações', href: 'central.html', cta: 'Abrir a Central', codeMsg: 'Enviamos um código ao celular cadastrado na sua matrícula. Missões P1 e P2 exigem esta etapa.' }
  };
  const ORDER = ['form', 'code', 'bio', 'done'];
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const MATRICULA = /^OP-?\d{4,}$/i;
  let profile = 'saude';
  let quick = false;

  /* Pontos de progresso: um por etapa */
  const dots = ORDER.map(() => {
    const li = doc.createElement('li');
    $('login-dots').append(li);
    return li;
  });

  const steps = doc.querySelectorAll('[data-step]');
  function show(name, focusId) {
    steps.forEach((s) => { s.hidden = s.getAttribute('data-step') !== name; });
    const idx = ORDER.indexOf(name);
    dots.forEach((d, i) => {
      d.classList.toggle('is-done', i <= idx);
      d.classList.toggle('is-current', i === idx);
      d.textContent = i === idx ? 'Etapa ' + (i + 1) + ' de ' + ORDER.length : '';
    });
    const midway = name === 'code' || name === 'bio';
    $('login-back').hidden = !midway;
    $('login-home').hidden = midway;
    if (focusId) $(focusId).focus();
  }

  /* Perfis: grupo de rádio com setas (padrão WAI-ARIA) */
  const radios = Array.from(form.querySelectorAll('[data-profile]'));
  function pick(btn, focus) {
    radios.forEach((r) => {
      const on = r === btn;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
    });
    profile = btn.getAttribute('data-profile');
    const p = PROFILES[profile];
    $('login-user-label').textContent = p.userLabel;
    $('login-user').placeholder = p.ph;
    $('login-user').value = '';
    $('login-user').setAttribute('autocomplete', profile === 'operador' ? 'username' : 'email');
    $('login-dest').textContent = p.dest;
    clearErrors();
    if (focus) btn.focus();
  }
  radios.forEach((r, i) => {
    r.addEventListener('click', () => pick(r));
    r.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      pick(radios[(next + radios.length) % radios.length], true);
    });
  });

  function setError(fieldId, msgId, msg) {
    const field = $(fieldId);
    field.classList.toggle('has-error', Boolean(msg));
    field.querySelector('.input').setAttribute('aria-invalid', String(Boolean(msg)));
    if (msg) $(msgId).textContent = msg;
    return !msg;
  }
  function clearErrors() {
    setError('field-user', 'login-user-error', '');
    setError('field-pw', 'login-pw-error', '');
    $('login-errors').hidden = true;
  }

  function validate() {
    const user = $('login-user').value.trim();
    const op = profile === 'operador';
    const userOk = op ? MATRICULA.test(user) : EMAIL.test(user);
    const okUser = setError('field-user', 'login-user-error', userOk ? '' : (op ? 'Use a matrícula no formato OP-0000.' : 'Use um e-mail no formato nome@dominio.com.'));
    const okPw = setError('field-pw', 'login-pw-error', $('login-pw').value.length < 8 ? 'A senha tem pelo menos 8 caracteres.' : '');
    $('login-errors').hidden = okUser && okPw;
    if (!okUser) $('login-user').focus();
    else if (!okPw) $('login-pw').focus();
    return okUser && okPw;
  }

  function toCode() {
    $('login-pw').value = ''; // a senha digitada não fica nem na página
    $('login-code').value = '';
    setError('field-code', 'login-code-error', '');
    $('code-msg').textContent = PROFILES[profile].codeMsg;
    show('code', 'code-title');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) return;
    const btn = form.querySelector('[type="submit"]');
    btn.classList.add('is-loading');
    btn.textContent = 'Entrando…';
    root.setTimeout(() => {
      btn.classList.remove('is-loading');
      btn.textContent = 'Entrar';
      toCode();
    }, 800);
  });

  /* Acesso de demonstração preenche o usuário, mas também passa pelo código */
  $('login-demo').addEventListener('click', () => {
    $('login-user').value = profile === 'operador' ? 'OP-0001' : 'demo@sadec.dev';
    clearErrors();
    toCode();
  });

  $('login-forgot').addEventListener('click', () => { $('login-forgot-msg').hidden = false; });
  $('login-eye').addEventListener('click', () => {
    const pw = $('login-pw');
    const visible = pw.type === 'password';
    pw.type = visible ? 'text' : 'password';
    $('login-eye').setAttribute('aria-pressed', String(visible));
    $('login-eye').setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  });

  $('code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = setError('field-code', 'login-code-error', /^\d{6}$/.test($('login-code').value) ? '' : 'Digite os 6 números do código.');
    if (ok) show('bio', 'bio-title');
    else $('login-code').focus();
  });
  $('login-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('login-resend').addEventListener('click', () => { $('login-resend-msg').hidden = false; });

  function finish(withQuick) {
    quick = withQuick;
    const p = PROFILES[profile];
    const user = $('login-user').value.trim();
    const name = profile === 'operador' ? 'operador' : (user.split('@')[0] || 'visitante');
    $('done-msg').textContent = (quick ? 'Acesso rápido ativado. ' : '') + 'Bem-vindo, ' + name + '. ' + p.dest + '.';
    $('done-cta').textContent = p.cta;
    $('done-cta').setAttribute('href', p.href);
    show('done', 'done-title');
  }
  $('bio-yes').addEventListener('click', () => finish(true));
  $('bio-no').addEventListener('click', () => finish(false));

  $('login-back').addEventListener('click', () => show('form', 'login-user'));
  $('login-exit').addEventListener('click', () => {
    form.reset();
    pick(radios[0]);
    $('login-forgot-msg').hidden = true;
    $('login-resend-msg').hidden = true;
    show('form', 'page-title');
  });

  show('form');
})(window);
