// Servidor de produção: só as páginas do site e as rotas da API são públicas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { arquivoPublico, rotaApi } = require('../scripts/producao.js');

test('páginas e assets do site são públicos', () => {
  for (const p of ['/', '/central.html', '/saude/', '/delivery/index.html', '/css/base.css', '/js/api.js', '/assets/icons/drone-bot.svg']) {
    assert.ok(arquivoPublico(p), p);
  }
});

test('banco, código-fonte, segredos e arquivos ocultos nunca são servidos', () => {
  for (const p of ['/ChatBot/SADEC_Chatbot.db', '/package.json', '/identificacao.txt', '/.git/config', '/js/../ChatBot/SADEC_Chatbot.db',
    '/../package.json', '/scripts/producao.js', '/Java/SADEC/src/x.java', '/Python/sadec.py', '/tests/x.js', '/css/.env', '/README.md']) {
    assert.equal(arquivoPublico(p), null, p);
  }
});

test('só as rotas da API usadas pelo site passam para o Node-RED; o editor não', () => {
  assert.ok(rotaApi('GET', '/api/pedidos'));
  assert.ok(rotaApi('POST', '/api/pedidos/SD1001/decolar'));
  assert.ok(rotaApi('POST', '/api/drones/DR-05/recuperacao'));
  assert.ok(rotaApi('POST', '/sadec/mensagem'));
  assert.equal(rotaApi('DELETE', '/api/pedidos'), false);
  assert.equal(rotaApi('GET', '/admin'), false);
  assert.equal(rotaApi('GET', '/api/pedidos/SD1001/../../admin'), false);
  assert.equal(rotaApi('POST', '/api/pedidos/SD1001/apagar'), false);
});
