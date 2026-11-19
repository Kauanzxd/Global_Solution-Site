/* SADEC — carrega o widget do chatbot integrado (Node-RED) só quando a API está no ar.
   Assim a página não gera erro de rede quando a demonstração integrada está desligada. */
(function (root) {
  'use strict';
  const SIDEC = root.SIDEC;
  const doc = root.document;
  const alvo = doc.getElementById('sadec-widget');
  if (!alvo || !SIDEC.api) return;
  SIDEC.api.disponivel().then((on) => {
    const estado = doc.getElementById('widget-estado');
    if (!on) {
      estado.textContent = 'O assistente integrado está desligado agora. Rode "npm run api" para conversar com o fluxo do Node-RED. O Drone Bot acima continua funcionando.';
      return;
    }
    estado.textContent = 'Conectado ao fluxo do Node-RED: pergunte por um código SD (ex.: SD1001) ou peça um remédio. Pedidos P1 e P2 não são autorizados pelo chat público.';
    const s = doc.createElement('script');
    s.src = SIDEC.api.base + '/sadec/widget.js';
    s.defer = true;
    doc.body.append(s);
  });
})(window);
