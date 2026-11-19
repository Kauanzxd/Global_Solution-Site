/* SADEC — entendimento local do chatbot (sem IA).
   Usado quando não há GROQ_API_KEY ou a IA não responde: classifica a intenção e extrai as entidades
   por palavras-chave, no mesmo formato JSON que a IA devolve. Assim o chat nunca fica sem resposta. */
'use strict';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tem = (texto, lista) => lista.some((p) => texto.includes(p));

/* Ordem importa: "reagendar o SD1002" é reagendamento, "meu pedido atrasou" é problema. */
const INTENCOES = [
  ['reagendar_entrega', ['reagend', 'remarc', 'mudar o horario', 'trocar o horario', 'adiar', 'outro horario', 'outro periodo', 'mudar o periodo', 'nao vou estar em casa']],
  ['reportar_problema', ['problema', 'reclama', 'caido', 'caiu', 'danific', 'quebr', 'errad', 'atrasou', 'atrasad', 'barulho', 'chegou aberta', 'insatisfeit', 'denunci', 'luz de alerta']],
  ['solicitar_transporte_urgente', ['orgao', 'transplant', ' rim ', 'figado', 'coracao', 'cornea', 'pulmao', 'emergencia', 'urgente', 'enchente', 'alagad', 'alagamento', 'ilhad', 'deslizamento', 'socorro', 'defesa civil', 'primeiros socorros', 'mantimento']],
  ['rastrear_entrega', ['rastre', 'onde esta', 'onde ta', 'cade', 'status', 'ja saiu', 'decolou', 'a caminho', 'acompanhar', 'quanto tempo', 'previsao', 'chegando']],
  ['pedir_remedio', ['remedio', 'medicament', 'medicacao', 'insulina', 'comprimido', 'receita', 'farmacia', 'uso continuo', 'pressao alta']],
  ['despedida', ['tchau', 'obrigad', 'valeu', 'ate mais', 'falou', 'era so isso']],
  ['ajuda', ['ajuda', 'o que voce faz', 'como funciona', 'help', 'menu', 'o que voce sabe']],
  ['saudacao', ['bom dia', 'boa tarde', 'boa noite', 'tudo bem', ' e ai ', ' opa ', ' ola ', ' oi ']]
];

const CARGAS = [
  ['orgao', ['orgao', 'transplant', ' rim ', 'figado', 'coracao', 'cornea', 'pulmao', 'tecido']],
  ['kit_emergencia', ['kit', 'primeiros socorros', ' agua ', 'mantimento']],
  ['exame', ['exame', 'amostra', 'vacina', 'insumo']],
  ['remedio', ['remedio', 'medicament', 'medicacao', 'insulina', 'comprimido']],
  ['encomenda', ['encomenda', 'pacote', 'compra', 'lanche', 'ifood', 'shopee', 'aliexpress']]
];

const BAIRROS = [
  ['Capão Redondo', ['capao']], ['Jardim Ângela', ['jardim angela', 'jd angela']], ['Brasilândia', ['brasilandia']],
  ['Paraisópolis', ['paraisopolis']], ['Itaquera', ['itaquera']], ['Parelheiros', ['parelheiros']],
  ['Centro', [' centro ', ' se ', 'republica']], ['Mooca', ['mooca']]
];

const HOSPITAIS = [
  ['Hospital das Clínicas', ['hospital das clinicas', 'clinicas', ' hc ']], ['InCor', ['incor', 'instituto do coracao']],
  ['Santa Casa', ['santa casa']], ['Hospital São Paulo', ['hospital sao paulo', ' hsp ', 'unifesp']],
  ['Hospital do Servidor Público', ['servidor', 'hspe']]
];

const HORARIOS = [['manha', [' manha', ' cedo ']], ['tarde', [' tarde', 'depois do almoco']], ['noite', [' noite']]];

function primeiro(texto, tabela) {
  const achado = tabela.find(([, palavras]) => tem(texto, palavras));
  return achado ? achado[0] : null;
}

function entender(mensagem) {
  const t = ' ' + norm(mensagem).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  let intencao = primeiro(t, INTENCOES) || 'desconhecido';
  if (intencao === 'desconhecido' && /\bsd\s?\d{4,5}\b/.test(t)) intencao = 'rastrear_entrega';
  const tipoCarga = primeiro(t, CARGAS);
  const urgencia = tem(t, ['emergencia', 'enchente', 'alagad', 'ilhad', 'deslizamento', 'defesa civil', 'socorro']);
  return {
    intencao,
    tipo_carga: tipoCarga,
    prioridade: tipoCarga === 'orgao' ? 'nivel_1_orgaos' : (urgencia ? 'nivel_2_emergencia' : null),
    bairro: primeiro(t, BAIRROS),
    hospital: primeiro(t, HOSPITAIS),
    horario: primeiro(t, HORARIOS),
    formato: tem(t, [' em audio', ' por audio', ' por voz']) ? 'audio' : (tem(t, [' em texto', ' por escrito']) ? 'texto' : null),
    fonte: 'local'
  };
}

module.exports = { entender };
