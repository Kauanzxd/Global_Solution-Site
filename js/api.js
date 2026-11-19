/* SADEC — cliente da API de integração (Node-RED em http://localhost:1880 no desenvolvimento; mesma origem quando publicado).
   Os pedidos reais da demonstração integrada vêm do SQLite pela API; sem API, o site continua
   no modo simulado (motor local), e a interface diz claramente qual modo está ativo.
   Nunca lança exceção: devolve sempre { ok, status, dados, erro, detalhes }. */
(function (root) {
  'use strict';
  const SIDEC = (root.SIDEC = root.SIDEC || {});
  const doc = root.document;
  const meta = doc.querySelector('meta[name="sadec-api"]');
  // Desenvolvimento (npm start na porta 5173 ou arquivo local): API em localhost:1880.
  // Publicado: site e API na mesma origem, sem CORS.
  const dev = root.location.protocol === 'file:' || root.location.port === '5173';
  const BASE = (meta && meta.content) || (dev ? 'http://localhost:1880' : root.location.origin);
  const TEMPO_LIMITE_MS = 8000;
  const CHAVE_SESSAO = 'sadec_sessao';

  /* Sessão da conta (uma conta para portal, Saúde e Delivery). "Manter conectado" usa localStorage;
     sem ele, a sessão some ao fechar o navegador (sessionStorage). Só o token e o resumo da conta ficam aqui. */
  function lerArmazenado(area) {
    try {
      const s = JSON.parse(root[area].getItem(CHAVE_SESSAO) || 'null');
      return s && s.token && s.expira_em > new Date().toISOString() ? s : null;
    } catch { return null; }
  }
  const sessao = {
    atual: () => lerArmazenado('sessionStorage') || lerArmazenado('localStorage'),
    salvar(dados, manter) {
      sessao.limpar();
      try { root[manter ? 'localStorage' : 'sessionStorage'].setItem(CHAVE_SESSAO, JSON.stringify(dados)); } catch { /* armazenamento bloqueado: sessão só nesta página */ }
    },
    limpar() {
      ['localStorage', 'sessionStorage'].forEach((a) => { try { root[a].removeItem(CHAVE_SESSAO); } catch { /* sem armazenamento */ } });
    }
  };

  function cabecalhos(corpo) {
    const h = corpo ? { 'Content-Type': 'application/json' } : {};
    const s = sessao.atual();
    if (s) h.Authorization = 'Bearer ' + s.token;
    return h;
  }

  async function chamar(metodo, caminho, corpo) {
    const ctrl = new AbortController();
    const timer = root.setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS);
    try {
      const resp = await root.fetch(BASE + caminho, {
        method: metodo,
        headers: cabecalhos(corpo),
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: ctrl.signal
      });
      const texto = await resp.text();
      if (!texto) return { ok: false, status: resp.status, erro: 'A Central respondeu sem conteúdo.' };
      let json;
      try { json = JSON.parse(texto); } catch { return { ok: false, status: resp.status, erro: 'Resposta inválida da Central.' }; }
      // Sessão vencida ou encerrada em outro lugar: esquece o token guardado
      if (resp.status === 401 && sessao.atual()) sessao.limpar();
      return { ok: resp.ok && json.ok === true, status: resp.status, dados: json.dados, erro: json.erro || null, detalhes: json.detalhes || null };
    } catch (e) {
      return { ok: false, status: 0, rede: true, erro: e.name === 'AbortError' ? 'A Central demorou para responder.' : 'Central de integração indisponível (API desligada).' };
    } finally {
      root.clearTimeout(timer);
    }
  }

  let disponivelCache = null;
  /* Verifica uma vez por página se a API está no ar. */
  function disponivel() {
    if (!disponivelCache) disponivelCache = chamar('GET', '/api/locais').then((r) => r.ok);
    return disponivelCache;
  }

  /* Texto de erro para mostrar ao usuário, com os detalhes de validação quando houver. */
  function mensagemErro(r) {
    const det = Array.isArray(r.detalhes) ? ' ' + r.detalhes.join(' ') : '';
    return (r.erro || 'Não foi possível concluir.') + det;
  }

  /* Cabeçalho: o link "Entrar" mostra a conta conectada (abre entrar.html, onde dá para sair). */
  function mostrarConta() {
    const s = sessao.atual();
    if (!s || !s.conta) return;
    const primeiro = String(s.conta.nome || '').split(' ')[0] || 'Conta';
    doc.querySelectorAll('a[href$="entrar.html"]').forEach((a) => {
      a.textContent = primeiro;
      a.setAttribute('aria-label', 'Conta de ' + s.conta.nome + ' (' + s.conta.email + ')');
      a.classList.add('is-conta');
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mostrarConta);
  else mostrarConta();

  SIDEC.api = {
    base: BASE,
    sessao,
    disponivel,
    mensagemErro,
    get: (caminho) => chamar('GET', caminho),
    post: (caminho, corpo) => chamar('POST', caminho, corpo || {})
  };
})(window);
