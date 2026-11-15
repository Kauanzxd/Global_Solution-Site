/* SIDEC — estado compartilhado entre páginas (localStorage, chave "sidec").
   Os dados lidos do armazenamento são tratados como não confiáveis: estrutura validada e exibidos só via textContent. */
(function (root) {
  'use strict';
  const SIDEC = (root.SIDEC = root.SIDEC || {});
  const KEY = 'sidec';
  const listeners = [];
  let memory = null; // reserva quando o localStorage está bloqueado

  function isValid(s) {
    return Boolean(s) && s.version === SIDEC.data.VERSION &&
      ['filiais', 'locais', 'zonas', 'drones', 'entregas'].every((k) => Array.isArray(s[k]));
  }

  function read() {
    try {
      const raw = root.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (isValid(parsed)) return parsed;
    } catch {
      /* armazenamento indisponível ou corrompido: recria a partir dos dados iniciais */
    }
    return memory && isValid(memory) ? memory : null;
  }

  function write(state) {
    memory = state;
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* sem persistência (modo privado/bloqueado): a sessão segue em memória */
    }
  }

  function notify(state) {
    listeners.forEach((fn) => fn(state));
  }

  const store = {
    get() {
      let state = read();
      if (!state) {
        state = SIDEC.data.createSeed(Date.now());
        write(state);
      }
      return state;
    },
    /* Lê o estado mais recente, aplica a mudança, avança voos concluídos e persiste. */
    update(fn) {
      const state = store.get();
      const result = fn(state);
      SIDEC.ops.tick(state, Date.now());
      write(state);
      notify(state);
      return result;
    },
    reset(builder) {
      const state = (builder || SIDEC.data.createSeed)(Date.now());
      write(state);
      notify(state);
      return state;
    },
    subscribe(fn) {
      listeners.push(fn);
    }
  };

  /* Outra aba alterou o estado: reflete aqui. */
  root.addEventListener('storage', (event) => {
    if (event.key === KEY) notify(store.get());
  });

  SIDEC.store = store;
})(window);
