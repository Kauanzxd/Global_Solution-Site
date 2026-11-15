/* SIDEC — validação do formulário de contato (demonstração: nada é enviado nem armazenado). */
(function (root) {
  'use strict';
  const form = root.document.getElementById('contact-form');
  if (!form) return;

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const rules = {
    nome: (v) => (v.trim().length >= 3 ? '' : 'Informe seu nome (mínimo de 3 caracteres).'),
    email: (v) => {
      if (!v.trim()) return 'Informe seu e-mail.';
      return EMAIL.test(v.trim()) ? '' : 'Digite um e-mail válido, como nome@exemplo.com.';
    },
    assunto: (v) => (v ? '' : 'Selecione um assunto.'),
    mensagem: (v) => {
      const len = v.trim().length;
      if (!len) return 'Escreva sua mensagem.';
      return len >= 20 ? '' : 'A mensagem precisa de pelo menos 20 caracteres (faltam ' + (20 - len) + ').';
    },
    consentimento: (v, input) => (input.checked ? '' : 'Confirme que leu o aviso sobre dados fictícios.')
  };

  const status = form.querySelector('.form-status');
  const counter = form.querySelector('[data-counter]');
  let attempted = false;

  function validate(name) {
    const input = form.elements[name];
    const message = rules[name](input.value, input);
    const field = input.closest('.field');
    const error = field.querySelector('.field__error');
    field.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    error.textContent = message;
    return !message;
  }

  Object.keys(rules).forEach((name) => {
    const input = form.elements[name];
    input.addEventListener('blur', () => { if (attempted || input.value) validate(name); });
    input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (attempted) validate(name);
    });
  });

  if (counter) {
    const msg = form.elements.mensagem;
    const update = () => { counter.textContent = msg.value.length + '/1000'; };
    msg.addEventListener('input', update);
    update();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    attempted = true;
    const invalid = Object.keys(rules).filter((name) => !validate(name));
    status.className = 'form-status';
    if (invalid.length) {
      status.classList.add('is-error');
      status.textContent = invalid.length === 1
        ? 'Corrija 1 campo destacado para continuar.'
        : 'Corrija os ' + invalid.length + ' campos destacados para continuar.';
      form.elements[invalid[0]].focus();
      return;
    }
    status.classList.add('is-success');
    status.textContent = 'Mensagem validada com sucesso. Esta é uma demonstração acadêmica: nenhum dado foi enviado ou armazenado.';
    form.reset();
    attempted = false;
    if (counter) counter.textContent = '0/1000';
    status.focus();
  });
})(window);
