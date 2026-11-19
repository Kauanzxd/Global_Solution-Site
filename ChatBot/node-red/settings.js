/* Configuração do Node-RED do SADEC.
   Rodar a partir da raiz do projeto:  npm run api
   Variáveis de ambiente (nenhuma chave fica no código):
     SADEC_DB, SADEC_PYTHON, SADEC_JAVA  — caminhos (têm padrão)
     GROQ_API_KEY, TELEGRAM_BOT_TOKEN    — só para o chatbot com IA/Telegram
     NODE_RED_CREDENTIAL_SECRET          — chave para cifrar credenciais salvas pelo editor */
'use strict';
const path = require('path');
const fs = require('fs');
const lerWidget = (nome) => fs.readFileSync(path.join(__dirname, 'widget', nome), 'utf8');

process.env.SADEC_DB = process.env.SADEC_DB || path.join(__dirname, '..', 'SADEC_Chatbot.db');
// Encontra Python e Java (mesmo fora do PATH) e compila a parte Java se ainda não estiver compilada.
require('./lib/ambiente.js').preparar();

module.exports = {
  uiHost: '127.0.0.1', // só aceita conexões da própria máquina
  uiPort: Number(process.env.PORT) || 1880,
  // O editor aplica CORS "*" em tudo que está sob a sua raiz; em /admin ele não afeta a API (/api, /sadec).
  httpAdminRoot: '/admin',
  httpNodeRoot: '/',
  userDir: __dirname,
  flowFile: path.join(__dirname, '..', 'fluxo-node-red-sadec.json'),
  flowFilePretty: true,
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || undefined,
  // O site roda em outra porta: CORS só para ele.
  httpNodeCors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: 'GET,POST',
    allowedHeaders: 'Content-Type, Authorization'
  },
  // Núcleo compartilhado: endpoints da API e chatbot usam as mesmas regras (Python + Java + SQLite).
  functionGlobalContext: {
    sadecApi: require('./lib/sadec-api.js'),
    // Entendimento por palavras-chave quando a IA (Groq) não está configurada ou não responde
    sadecNlu: require('./lib/entendimento.js'),
    // Widget incorporável do chatbot: /sadec/widget.js e /sadec/widget.css
    sadecWidget: { js: lerWidget('widget.js'), css: lerWidget('widget.css') }
  },
  logging: { console: { level: 'info', metrics: false, audit: false } },
  editorTheme: { projects: { enabled: false } }
};
