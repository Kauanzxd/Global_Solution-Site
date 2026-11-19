/* SADEC — Entrar e criar conta.
   Com a Central (API) no ar: cadastro e login reais (POST /api/contas e /api/sessoes); a mesma conta vale
   para o portal, o SADEC Saúde e o SADEC Delivery. O código de 6 dígitos e o acesso rápido são etapas
   simuladas (nenhum SMS é enviado). Sem a API, o fluxo continua só como demonstração e nada é guardado.
   Fluxo: perfil e credenciais -> código de 6 dígitos (sempre) -> acesso rápido -> pronto. */
(function (root) {
  'use strict';
  const doc = root.document;
  const SIDEC = root.SIDEC;
  const form = doc.getElementById('login-form');
  if (!form) return;
  const $ = (id) => doc.getElementById(id);

  const PROFILES = {
    saude: { api: 'unidade_saude', ph: 'nome@unidade.org', dest: 'Você vai para o SADEC Saúde', href: 'saude/index.html', cta: 'Abrir o SADEC Saúde', demo: 'hospital@sadec.demo', codeMsg: 'Enviamos um código ao celular da sua unidade. Toda conta de saúde usa verificação em duas etapas.' },
    cliente: { api: 'cliente', ph: 'nome@dominio.com', dest: 'Você vai para o SADEC Delivery', href: 'delivery/index.html', cta: 'Começar a pedir', demo: 'cliente@sadec.demo', codeMsg: 'Enviamos um código ao celular cadastrado. Ele confirma que o pedido sai da sua conta.' },
    governo: { api: 'governo', ph: 'nome@orgao.gov.br', dest: 'Você vai para o envio de socorro (P2) do SADEC Saúde', href: 'saude/index.html#pedido', cta: 'Enviar socorro', demo: 'governo@sadec.demo', codeMsg: 'Enviamos um código ao celular do órgão público. Envio de socorro exige verificação em duas etapas.' },
    operador: { api: 'operador', ph: 'nome@sadec.demo', dest: 'Você vai para a Central de Operações', href: 'central.html', cta: 'Abrir a Central', demo: 'operador@sadec.demo', codeMsg: 'Enviamos um código ao celular cadastrado. Missões P1 e P2 exigem esta etapa.' }
  };
  const DO_PERFIL_API = { unidade_saude: 'saude', cliente: 'cliente', governo: 'governo', operador: 'operador' };
  const SENHA_DEMO = 'sadec2026'; // contas fictícias criadas pela migração 002 (ver README)
  const ORDER = ['form', 'code', 'bio', 'done'];
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let profile = 'saude';
  let online = false;
  let pendente = null; // login aceito pela API, aguardando a etapa do código
  let nomeDemo = '';

  /* Pontos de progresso: um por etapa */
  const dots = ORDER.map(() => {
    const li = doc.createElement('li');
    $('login-dots').append(li);
    return li;
  });

  const steps = doc.querySelectorAll('[data-step]');
  function show(name, focusId) {
    steps.forEach((s) => { s.hidden = s.getAttribute('data-step') !== name; });
    const idx = Math.max(0, ORDER.indexOf(name));
    dots.forEach((d, i) => {
      d.classList.toggle('is-done', i <= idx);
      d.classList.toggle('is-current', i === idx);
      d.textContent = i === idx ? 'Etapa ' + (i + 1) + ' de ' + ORDER.length : '';
    });
    const midway = name === 'code' || name === 'bio' || name === 'signup';
    $('login-back').hidden = !midway;
    $('login-home').hidden = midway;
    $('login-novo').hidden = name !== 'form';
    if (focusId) $(focusId).focus();
  }

  /* Grupos de rádio com setas (padrão WAI-ARIA) */
  function radioGroup(radios, onPick) {
    function pick(btn, focus) {
      radios.forEach((r) => {
        const on = r === btn;
        r.setAttribute('aria-checked', String(on));
        r.tabIndex = on ? 0 : -1;
      });
      onPick(btn);
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
    return pick;
  }

  const radios = Array.from(form.querySelectorAll('[data-profile]'));
  const pickProfile = radioGroup(radios, (btn) => {
    profile = btn.getAttribute('data-profile');
    const p = PROFILES[profile];
    $('login-user-label').textContent = profile === 'saude' ? 'E-mail institucional' : 'E-mail';
    $('login-user').placeholder = p.ph;
    $('login-dest').textContent = p.dest;
    clearErrors();
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
  function erroGeral(id, texto) {
    $(id).textContent = texto;
    $(id).hidden = false;
  }

  function validate() {
    const okUser = setError('field-user', 'login-user-error', EMAIL.test($('login-user').value.trim()) ? '' : 'Use um e-mail no formato nome@dominio.com.');
    const okPw = setError('field-pw', 'login-pw-error', $('login-pw').value.length < 6 ? 'A senha tem pelo menos 6 caracteres.' : '');
    if (!(okUser && okPw)) erroGeral('login-errors', 'Confira os campos destacados.');
    else $('login-errors').hidden = true;
    if (!okUser) $('login-user').focus();
    else if (!okPw) $('login-pw').focus();
    return okUser && okPw;
  }

  function carregando(btn, ligado, texto) {
    btn.classList.toggle('is-loading', ligado);
    btn.disabled = ligado;
    btn.textContent = texto;
  }

  function toCode(perfilKey) {
    $('login-pw').value = ''; // a senha digitada não fica nem na página
    $('signup-pw').value = '';
    $('login-code').value = '';
    setError('field-code', 'login-code-error', '');
    $('code-msg').textContent = PROFILES[perfilKey].codeMsg;
    show('code', 'code-title');
  }

  /* Login real na Central; a sessão só é guardada depois da etapa do código. */
  async function entrarNaApi(email, senha, perfilApi) {
    const r = await SIDEC.api.post('/api/sessoes', { email, senha, perfil: perfilApi, manter: $('login-keep').checked });
    if (!r.ok) return r;
    pendente = { dados: r.dados, manter: $('login-keep').checked };
    toCode(DO_PERFIL_API[r.dados.conta.perfil]);
    return r;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const btn = form.querySelector('[type="submit"]');
    carregando(btn, true, 'Entrando…');
    if (online) {
      const r = await entrarNaApi($('login-user').value.trim(), $('login-pw').value, PROFILES[profile].api);
      carregando(btn, false, 'Entrar');
      if (!r.ok) {
        erroGeral('login-errors', SIDEC.api.mensagemErro(r));
        $('login-pw').focus();
      }
      return;
    }
    root.setTimeout(() => {
      carregando(btn, false, 'Entrar');
      nomeDemo = $('login-user').value.trim().split('@')[0];
      toCode(profile);
    }, 600);
  });

  /* Conta de demonstração do perfil escolhido (fictícia); também passa pelo código */
  $('login-demo').addEventListener('click', () => {
    $('login-user').value = PROFILES[profile].demo;
    $('login-pw').value = SENHA_DEMO;
    clearErrors();
    form.requestSubmit();
  });

  /* Face ID de demonstração (celular): o navegador não acessa biometria aqui; segue pela conta de demonstração */
  $('login-faceid').addEventListener('click', () => $('login-demo').click());

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

  function mostrarPronto(conta, prefixo) {
    const chave = conta ? DO_PERFIL_API[conta.perfil] : profile;
    const p = PROFILES[chave];
    const nome = conta ? conta.nome.split(' ')[0] : (nomeDemo || 'visitante');
    const inst = conta && conta.instituicao ? ' (' + conta.instituicao + ')' : '';
    $('done-title').textContent = conta ? 'Conectado' : 'Tudo pronto!';
    $('done-msg').textContent = prefixo + 'Bem-vindo, ' + nome + inst + '. ' + p.dest + '.' +
      (conta ? ' A mesma conta vale no portal, no Saúde e no Delivery.' : ' Demonstração sem a Central: nada foi guardado.');
    $('done-cta').textContent = p.cta;
    $('done-cta').setAttribute('href', p.href);
    $('done-central').hidden = !conta || conta.perfil !== 'operador';
    $('login-exit').textContent = conta ? 'Sair da conta' : 'Sair e voltar ao início';
    show('done', 'done-title');
  }

  function finish(withQuick) {
    if (pendente) {
      SIDEC.api.sessao.salvar(pendente.dados, pendente.manter);
      mostrarPronto(pendente.dados.conta, withQuick ? 'Acesso rápido ativado (simulação). ' : '');
      pendente = null;
      return;
    }
    mostrarPronto(null, withQuick ? 'Acesso rápido ativado. ' : '');
  }
  $('bio-yes').addEventListener('click', () => finish(true));
  $('bio-no').addEventListener('click', () => finish(false));

  $('login-back').addEventListener('click', () => {
    pendente = null;
    show('form', 'login-user');
  });
  $('login-exit').addEventListener('click', async () => {
    if (SIDEC.api.sessao.atual()) await SIDEC.api.post('/api/sessoes/sair');
    SIDEC.api.sessao.limpar();
    form.reset();
    pickProfile(radios[0]);
    $('login-forgot-msg').hidden = true;
    $('login-resend-msg').hidden = true;
    show('form', 'page-title');
  });

  /* ---------- Criar conta ---------- */
  const signup = $('signup-form');
  let signupPerfil = 'cliente';
  let hospitaisCarregados = false;
  const DEST_SIGNUP = { cliente: 'Pedidos no Delivery e remédios de uso contínuo no Saúde.', unidade_saude: 'Pedidos de saúde em nome do hospital. Órgãos exigem o código da Central.' };
  radioGroup(Array.from(signup.querySelectorAll('[data-signup]')), (btn) => {
    signupPerfil = btn.getAttribute('data-signup');
    $('signup-dest').textContent = DEST_SIGNUP[signupPerfil];
    $('field-s-inst').hidden = signupPerfil !== 'unidade_saude';
  });

  async function carregarHospitais() {
    if (hospitaisCarregados || !online) return;
    const r = await SIDEC.api.get('/api/locais');
    if (!r.ok) return;
    hospitaisCarregados = true;
    const opcoes = r.dados.filter((l) => l.tipo === 'hospital').map((l) => {
      const o = doc.createElement('option');
      o.value = l.nome;
      o.textContent = l.nome;
      return o;
    });
    const vazio = doc.createElement('option');
    vazio.value = '';
    vazio.textContent = 'Selecione (' + opcoes.length + ' hospitais)';
    $('signup-inst').replaceChildren(vazio, ...opcoes);
  }

  $('login-signup-open').addEventListener('click', () => {
    $('signup-errors').hidden = true;
    if (!online) erroGeral('signup-errors', 'A Central está desligada: para criar uma conta, ligue a API (npm run api).');
    carregarHospitais();
    show('signup', 'signup-title');
  });
  $('signup-login').addEventListener('click', () => show('form', 'login-user'));

  signup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = $('signup-nome').value.trim();
    const email = $('signup-email').value.trim();
    const senha = $('signup-pw').value;
    const inst = $('signup-inst').value;
    const ok = [
      setError('field-s-nome', 'signup-nome-error', nome.length < 2 ? 'Informe seu nome.' : ''),
      setError('field-s-email', 'signup-email-error', EMAIL.test(email) ? '' : 'Use um e-mail no formato nome@dominio.com.'),
      setError('field-s-inst', 'signup-inst-error', signupPerfil === 'unidade_saude' && !inst ? 'Escolha o hospital.' : ''),
      setError('field-s-pw', 'signup-pw-error', senha.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : '')
    ].every(Boolean);
    if (!ok) {
      erroGeral('signup-errors', 'Confira os campos destacados.');
      return;
    }
    if (!online) {
      erroGeral('signup-errors', 'A Central está desligada: para criar uma conta, ligue a API (npm run api).');
      return;
    }
    const btn = signup.querySelector('[type="submit"]');
    carregando(btn, true, 'Criando conta…');
    const r = await SIDEC.api.post('/api/contas', { nome, email, senha, perfil: signupPerfil, instituicao: signupPerfil === 'unidade_saude' ? inst : undefined });
    const login = r.ok ? await entrarNaApi(email, senha, signupPerfil) : r;
    carregando(btn, false, 'Criar conta e entrar');
    if (!login.ok) erroGeral('signup-errors', SIDEC.api.mensagemErro(login));
  });

  /* ---------- Início: verifica a Central e uma sessão já aberta ---------- */
  show('form');
  SIDEC.api.disponivel().then((ok) => {
    online = ok;
    $('login-note').textContent = ok
      ? 'Conta gravada na Central SADEC (banco de demonstração). Não use uma senha real. Contas de teste: senha ' + SENHA_DEMO + '.'
      : 'Central desligada: modo demonstração, nada é verificado nem guardado.';
    const s = SIDEC.api.sessao.atual();
    if (ok && s) {
      SIDEC.api.get('/api/conta').then((r) => { if (r.ok) mostrarPronto(r.dados, 'Você já está conectado. '); });
    }
  });
})(window);
