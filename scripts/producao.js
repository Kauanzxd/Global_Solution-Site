/* SADEC — ponto de entrada de produção (um único serviço, sem dependências extras).
   1. Prepara o banco SQLite no volume persistente (copia o banco demonstrativo só se ainda não existir)
      e aplica as migrações pendentes (cada migração faz backup e roda em transação).
   2. Sobe o Node-RED só na interface interna (127.0.0.1), com o editor desligado.
   3. Escuta na porta pública PORT: serve as páginas do site e repassa ao Node-RED apenas as rotas da API.
   4. /healthz verifica Node-RED, banco, Python e Java. Encerramento limpo em SIGTERM/SIGINT.
   Variáveis: PORT, SADEC_DATA_DIR (padrão /data), SADEC_DB, SADEC_PYTHON, SADEC_JAVA, SADEC_NODE_RED_PORT. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const PORTA = Number(process.env.PORT) || 8080;
const PORTA_NR = Number(process.env.SADEC_NODE_RED_PORT) || 1880;
const DADOS = process.env.SADEC_DATA_DIR || '/data';
const BANCO = process.env.SADEC_DB || path.join(DADOS, 'SADEC_Chatbot.db');
const BANCO_INICIAL = path.join(RAIZ, 'ChatBot', 'SADEC_Chatbot.db');
const PYTHON = process.env.SADEC_PYTHON || 'python3';
const JAVA = process.env.SADEC_JAVA || 'java';
const MIGRACOES = ['migrar.py', 'migrar_002.py', 'migrar_003.py', 'migrar_004.py'];

const log = (msg) => console.log('[SADEC] ' + msg);

/* ---------- 1. Banco persistente ---------- */
function prepararBanco() {
  fs.mkdirSync(path.dirname(BANCO), { recursive: true });
  if (!fs.existsSync(BANCO)) {
    fs.copyFileSync(BANCO_INICIAL, BANCO, fs.constants.COPYFILE_EXCL); // nunca sobrescreve
    log('Banco demonstrativo copiado para ' + BANCO + ' (primeira inicialização).');
  } else {
    log('Banco existente preservado: ' + BANCO);
  }
  for (const m of MIGRACOES) {
    const saida = execFileSync(PYTHON, [path.join(RAIZ, 'ChatBot', 'migracoes', m), 'up', BANCO],
      { encoding: 'utf8', timeout: 60000, env: Object.assign({}, process.env, { PYTHONUTF8: '1' }) });
    log(m + ': ' + saida.trim().split('\n').pop());
  }
}

/* ---------- 2. Checagens de componentes (feitas uma vez; o Node-RED é checado a cada /healthz) ---------- */
function verificar(cmd, args) {
  try { execFileSync(cmd, args, { stdio: 'ignore', timeout: 15000 }); return true; } catch { return false; }
}
const componentes = { python: false, java: false };
function verificarComponentes() {
  componentes.python = verificar(PYTHON, ['-c', 'import sqlite3, json']);
  componentes.java = verificar(JAVA, ['-version']) &&
    fs.existsSync(path.join(RAIZ, 'Java', 'SADEC', 'out', 'br', 'com', 'fiap', 'sadec', 'integracao', 'IntegracaoCLI.class'));
}

/* ---------- 3. Arquivos públicos do site (lista fechada: nada de banco, fontes Java/Python ou .git) ---------- */
const PASTAS_PUBLICAS = ['css', 'js', 'assets', 'delivery', 'saude'];
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.gif': 'image/gif'
};

function arquivoPublico(urlPath) {
  let rel = path.posix.normalize(urlPath).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  if (rel.split('/').some((p) => p.startsWith('.'))) return null;
  const topo = rel.split('/')[0];
  const permitido = rel.includes('/') ? PASTAS_PUBLICAS.includes(topo) : rel.endsWith('.html');
  if (!permitido || !TIPOS[path.extname(rel)]) return null;
  const abs = path.join(RAIZ, rel);
  return abs.startsWith(RAIZ + path.sep) ? abs : null;
}

/* ---------- 4. Rotas da API repassadas ao Node-RED (somente as necessárias) ---------- */
const ROTAS_API = [
  ['GET', /^\/api\/(pedidos|drones|eventos|locais|conta|meus-pedidos|codigos-orgao)$/],
  ['GET', /^\/api\/pedidos\/[A-Za-z0-9-]{1,20}$/],
  ['POST', /^\/api\/(pedidos|contas|sessoes|sessoes\/sair|fila\/processar|codigos-orgao)$/],
  ['POST', /^\/api\/pedidos\/[A-Za-z0-9-]{1,20}\/(decolar|concluir|recebimento)$/],
  ['POST', /^\/api\/drones\/[A-Za-z0-9-]{1,20}\/recuperacao$/],
  ['GET', /^\/sadec(\/widget\.(js|css))?$/],
  ['POST', /^\/sadec\/mensagem$/]
];
const rotaApi = (metodo, p) => ROTAS_API.some(([m, re]) => m === metodo && re.test(p));

const SEGURANCA = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };

function repassar(req, res) {
  const cabecalhos = Object.assign({}, req.headers, { host: '127.0.0.1:' + PORTA_NR, 'x-forwarded-for': req.socket.remoteAddress || '' });
  delete cabecalhos.origin; // mesma origem: o CORS de desenvolvimento não se aplica
  const p = http.request({ host: '127.0.0.1', port: PORTA_NR, method: req.method, path: req.url, headers: cabecalhos, timeout: 30000 }, (r) => {
    res.writeHead(r.statusCode, Object.assign({}, r.headers, SEGURANCA));
    r.pipe(res);
  });
  p.on('timeout', () => p.destroy(new Error('tempo esgotado')));
  p.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end('{"ok":false,"erro":"API indisponível no momento."}');
  });
  req.pipe(p);
}

function saudeNodeRed() {
  return new Promise((ok) => {
    const r = http.get({ host: '127.0.0.1', port: PORTA_NR, path: '/api/drones', timeout: 5000 }, (res) => { res.resume(); ok(res.statusCode === 200); });
    r.on('timeout', () => r.destroy());
    r.on('error', () => ok(false));
  });
}

async function healthz(res) {
  const nodeRed = await saudeNodeRed();
  const banco = fs.existsSync(BANCO);
  const corpo = { ok: nodeRed && banco && componentes.python && componentes.java, node_red: nodeRed, banco, python: componentes.python, java: componentes.java };
  res.writeHead(corpo.ok ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

const servidor = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (urlPath === '/healthz') { healthz(res); return; }
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/sadec')) {
    if (rotaApi(req.method, urlPath)) { repassar(req, res); return; }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"ok":false,"erro":"Rota não encontrada."}');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const arquivo = arquivoPublico(urlPath);
  if (!arquivo) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 — não encontrado'); return; }
  fs.readFile(arquivo, (err, dados) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 — não encontrado'); return; }
    res.writeHead(200, Object.assign({ 'Content-Type': TIPOS[path.extname(arquivo)] }, SEGURANCA));
    res.end(req.method === 'HEAD' ? undefined : dados);
  });
});

/* ---------- Inicialização e encerramento ---------- */
let nodeRed = null;
let encerrando = false;

function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  log('Recebido ' + sinal + '. Encerrando…');
  servidor.close();
  if (nodeRed && nodeRed.exitCode === null) {
    nodeRed.once('exit', () => process.exit(0));
    nodeRed.kill('SIGTERM');
    setTimeout(() => { if (nodeRed.exitCode === null) nodeRed.kill('SIGKILL'); }, 10000).unref();
  } else {
    process.exit(0);
  }
}

function iniciar() {
  verificarComponentes();
  prepararBanco();
  log('Python: ' + (componentes.python ? 'ok' : 'indisponível') + ' | Java: ' + (componentes.java ? 'ok' : 'indisponível'));
  nodeRed = spawn(process.execPath, [require.resolve('node-red/red.js'), '-s', path.join(RAIZ, 'ChatBot', 'node-red', 'settings.js')], {
    cwd: RAIZ,
    stdio: 'inherit',
    env: Object.assign({}, process.env, { NODE_ENV: 'production', SADEC_DB: BANCO, SADEC_PYTHON: PYTHON, SADEC_JAVA: JAVA, SADEC_NODE_RED_PORT: String(PORTA_NR) })
  });
  nodeRed.on('exit', (codigo) => {
    if (encerrando) return;
    log('Node-RED parou (código ' + codigo + '). Encerrando para o Railway reiniciar o serviço.');
    process.exit(1);
  });
  servidor.listen(PORTA, '0.0.0.0', () => log('Site e API em http://0.0.0.0:' + PORTA + ' (Node-RED interno em 127.0.0.1:' + PORTA_NR + ')'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

if (require.main === module) iniciar();
module.exports = { arquivoPublico, rotaApi };
