const js = require('@eslint/js');
const globals = require('globals');

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'after-used' }],
  'no-unreachable': 'error',
  'no-constant-condition': 'error',
  eqeqeq: ['error', 'always'],
  'no-restricted-properties': ['error', { property: 'style', message: 'Use classes CSS: estilos inline são proibidos no projeto.' }]
};

module.exports = [
  { ignores: ['**/node_modules/**', 'Java/**', 'ChatBot/node-red/.node-red-*', 'ChatBot/node-red/lib/vendor/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly' }
    },
    rules
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', 'ChatBot/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
    rules
  },
  {
    // widget incorporável do chatbot roda no navegador
    files: ['ChatBot/node-red/widget/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser } },
    rules
  }
];
