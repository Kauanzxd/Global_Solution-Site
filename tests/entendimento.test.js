// Entendimento local do chatbot (usado sem a IA da Groq): intenções e entidades por palavras-chave.
const test = require('node:test');
const assert = require('node:assert/strict');
const { entender } = require('../ChatBot/node-red/lib/entendimento.js');

test('reconhece as cinco intenções principais e os dados da mensagem', () => {
  assert.equal(entender('Onde está o SD1001?').intencao, 'rastrear_entrega');
  const remedio = entender('quero pedir meu remédio no Capão');
  assert.equal(remedio.intencao, 'pedir_remedio');
  assert.equal(remedio.bairro, 'Capão Redondo');
  const orgao = entender('precisamos levar um rim para o InCor');
  assert.equal(orgao.intencao, 'solicitar_transporte_urgente');
  assert.equal(orgao.hospital, 'InCor');
  assert.equal(orgao.prioridade, 'nivel_1_orgaos');
  const reag = entender('reagendar o SD1002 para a noite');
  assert.equal(reag.intencao, 'reagendar_entrega');
  assert.equal(reag.horario, 'noite');
  assert.equal(entender('tem um drone caído na minha rua').intencao, 'reportar_problema');
});

test('assunto fora do escopo vira "desconhecido" (o bot explica o que sabe fazer)', () => {
  assert.equal(entender('qual a capital da França?').intencao, 'desconhecido');
  assert.equal(entender('me conta uma piada').intencao, 'desconhecido');
  assert.equal(entender('').intencao, 'desconhecido');
});
