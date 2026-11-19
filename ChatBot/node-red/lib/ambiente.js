/* SADEC — prepara o ambiente da API ao iniciar o Node-RED:
   encontra o Python 3 e o Java (mesmo sem estarem no PATH) e compila a parte Java se faltar.
   Respeita SADEC_PYTHON e SADEC_JAVA quando definidos. Só lê arquivos do projeto e do usuário. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const CLASSE = path.join(RAIZ, 'Java', 'SADEC', 'out', 'br', 'com', 'fiap', 'sadec', 'integracao', 'IntegracaoCLI.class');

function funciona(cmd, args, esperado) {
  try {
    const saida = execFileSync(cmd, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
    return esperado ? String(saida).trim() === esperado : true;
  } catch {
    return false;
  }
}

function subpastas(pasta) {
  try { return fs.readdirSync(pasta).map((n) => path.join(pasta, n)); } catch { return []; }
}

function candidatosPython() {
  const lista = [process.env.SADEC_PYTHON, 'python', 'python3', 'py'];
  const apps = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps');
  subpastas(apps).filter((p) => /PythonSoftwareFoundation\.Python\.3/.test(p)).forEach((p) => lista.push(path.join(p, 'python.exe')));
  subpastas(path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python')).forEach((p) => lista.push(path.join(p, 'python.exe')));
  return lista.filter(Boolean);
}

function pastasJdk() {
  const lista = [];
  if (process.env.JAVA_HOME) lista.push(process.env.JAVA_HOME);
  subpastas(path.join(os.homedir(), '.jdks')).forEach((p) => lista.push(p));
  ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft'].forEach((b) => subpastas(b).forEach((p) => lista.push(p)));
  return lista;
}

function preparar() {
  const python = candidatosPython().find((c) => funciona(c, ['-c', 'import sys; print(sys.version_info[0])'], '3'));
  if (python) process.env.SADEC_PYTHON = python;
  else console.warn('[SADEC] Python 3 não encontrado. Defina SADEC_PYTHON com o caminho do python.');

  const javas = [process.env.SADEC_JAVA, 'java'].concat(pastasJdk().map((p) => path.join(p, 'bin', 'java'))).filter(Boolean);
  const java = javas.find((c) => funciona(c, ['-version']));
  if (java) process.env.SADEC_JAVA = java;
  else console.warn('[SADEC] Java não encontrado. Defina SADEC_JAVA com o caminho do java.');

  if (!fs.existsSync(CLASSE)) {
    const javac = ['javac'].concat(pastasJdk().map((p) => path.join(p, 'bin', 'javac'))).find((c) => funciona(c, ['-version']));
    if (!javac) {
      console.warn('[SADEC] Classes Java não compiladas e javac não encontrado. Veja "Como executar" no README.');
    } else {
      const fontes = [];
      const varrer = (d) => subpastas(d).forEach((p) => (fs.statSync(p).isDirectory() ? varrer(p) : (p.endsWith('.java') && fontes.push(p))));
      varrer(path.join(RAIZ, 'Java', 'SADEC', 'src'));
      varrer(path.join(RAIZ, 'Java', 'SADEC', 'test'));
      try {
        execFileSync(javac, ['--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-d', path.join(RAIZ, 'Java', 'SADEC', 'out')].concat(fontes), { stdio: 'pipe', timeout: 120000 });
        console.log('[SADEC] Parte Java compilada em Java/SADEC/out.');
      } catch (e) {
        console.warn('[SADEC] Falha ao compilar a parte Java: ' + String(e.stderr || e.message).slice(0, 300));
      }
    }
  }
  console.log('[SADEC] Python: ' + (process.env.SADEC_PYTHON || 'não encontrado') + ' | Java: ' + (process.env.SADEC_JAVA || 'não encontrado'));
}

module.exports = { preparar };
