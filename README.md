# SADEC — Sistema Autônomo de Drones de Cuidado e Entrega

> Rotas aéreas para o que não pode esperar.

Rede conceitual de drones que transporta órgãos, medicamentos e materiais emergenciais com prioridade sobre qualquer outra carga, e usa entregas comerciais para ajudar a sustentar a operação. Projeto da Global Solution FIAP 2026 · CitizenTech.

> **Aviso:** projeto acadêmico. Frota, rotas, mapas, telemetria, missões e Drone Bot são **simulações com dados fictícios**. O site não controla drones reais, não coleta dados pessoais ou médicos, não processa pagamentos e não possui parceria ou integração com hospitais, órgãos públicos ou plataformas de delivery.

## Problema
Órgãos para transplante têm janela de preservação limitada e podem ficar presos no trânsito. Enchentes e deslizamentos isolam bairros. Idosos, pessoas com mobilidade reduzida e moradores de regiões afastadas têm dificuldade para receber medicamentos de uso contínuo. Ao mesmo tempo, veículos de entrega lotam as ruas.

## Objetivo e proposta de valor
Oferecer um meio **complementar** de transporte para cargas críticas, com regras rígidas de prioridade, verificação de autonomia, zonas de pouso seguro e rastreabilidade. Entregas comerciais nos intervalos geram receita para as rotas de saúde (**subsídio cruzado**).

| Prioridade | Carga | Quem solicita |
|---|---|---|
| P1 · Órgãos | Órgãos e tecidos para transplante | Hospitais e Central de Transplantes |
| P2 · Emergência | Água, medicamentos e kits para áreas isoladas | Defesa Civil e prefeituras |
| P3 · Saúde | Medicamentos de uso contínuo e insumos | Cidadãos, UBSs e farmácias |
| P4 · Comercial | Entregas convencionais | Comércio local (parcerias potenciais) |

## Páginas
| Página | O que faz |
|---|---|
| `index.html` | Apresentação, fila da Central ao vivo, etapas de uma missão (abas), prioridades, linha do dia da frota, simulador de subsídio, segurança, impacto e ODS |
| `como-funciona.html` | Os seis passos de uma missão ilustrativa (P3) e as respostas para exceções |
| `sobre.html` | Descrição, problema, objetivo, proposta de valor, público, regulação (ANAC/DECEA, LGPD) e integração com as disciplinas |
| `central.html` | Central de Operações: mapa da frota com drones em movimento, fila por prioridade, frota, nova solicitação, cenários de teste e registro operacional |
| `rastreamento.html` | Mapa esquemático, etapas, telemetria simulada, demonstrações de pane e **registro de recebimento** |
| `orgaos.html` | Missão P1 demonstrativa: janela de preservação, corredor exclusivo, temperatura, reserva de bateria e cadeia de custódia |
| `saude/index.html` | **SADEC Saúde**: pedidos por perfil (cidadão P3, hospital P1 com pré-checagem de autonomia, operador P2), rastreamento médico, simuladores e tutorial |
| `delivery/index.html` | **SADEC Delivery**: restaurantes fictícios, sacola, comparação drone × entrega convencional, pedido P4 na mesma Central e acompanhamento do voo |
| `drone-bot.html` | Conversa com o Drone Bot e atalhos para as cinco intenções |
| `faq.html` | **Ajuda**: perguntas frequentes por assunto (abas + accordion) e formulário de contato validado em JavaScript, com mensagens de erro e de sucesso |
| `integrantes.html` | Nome, RM, turma, foto, GitHub e LinkedIn dos integrantes |
| `entrar.html` | Tela de acesso **demonstrativa** (perfil, senha, código de 6 dígitos, acesso rápido): nada é verificado, enviado ou guardado |

## Regras da Central (implementadas em `js/operations.js`)
1. Fila ordenada por prioridade: **P1 → P2 → P3 → P4**; empate pela ordem de chegada.
2. P1 e P2 podem antecipar uma entrega comercial **antes da decolagem**; entrega **em voo** nunca é realocada.
3. Órgão só decola se `consumo da rota × 1,3 ≤ bateria` (reserva de 30%). Demais cargas: 15% (ilustrativo).
4. A Central escolhe o drone **disponível** mais próximo da filial adequada, com carga e autonomia suficientes; se não houver, indica **transporte alternativo**.
5. Pane de motor ou bateria: pouso na **zona segura mais próxima da rota**. Falha grave: paraquedas, luzes e alerta sonoro. A ocorrência é registrada e o drone segue para **resgate e manutenção**; só volta à frota depois de liberado.
6. Temperatura fora de 2–8 °C: alerta à equipe médica.
7. Recebimento registra **responsável, horário, destinatário, identificação da carga e estado da entrega**.

## Integração com as disciplinas
- **Python:** registro de pedidos, fila de prioridades, autonomia, reserva de bateria, falhas e pouso seguro seguem as mesmas regras do motor `js/operations.js`.
- **Java (DDD):** Drone, Entrega, Filial, Rota, ZonaPouso, Hospital e TransporteOrgao aparecem como entidades da simulação (`js/data.js`).
- **Banco de Dados:** clientes, drones, filiais, entregas, rotas, zonas de pouso, hospitais, transporte de órgãos, leituras de sensores e parceiros.
- **IA e Chatbot:** intenções rastrear entrega, solicitar medicamento, transporte urgente, reagendar e relatar problemas; entidades de carga, prioridade, bairro, horário e hospital.

## Arquitetura do front-end
- HTML5 semântico, CSS3 externo e JavaScript puro em scripts clássicos sob o namespace `window.SIDEC` (sem frameworks nem bibliotecas).
- `operations.js` reúne funções puras testadas em Node; `state.js` compartilha o estado entre páginas via `localStorage` (chave `sidec`), por isso o projeto deve ser servido por HTTP.
- Nenhum `style=""`, `<style>`, `element.style` ou `innerHTML`: o DOM é criado com `textContent` e as mudanças visuais usam classes e atributos SVG.
- Identidade visual "Precisão suave": tokens em `css/variables.css` (Inter Tight, Inter e JetBrains Mono; prioridades sempre com cor e código) e um acento por área: azul no portal e no Delivery, painel escuro na Central e teal na Saúde.
- Movimento com propósito: revelação ao rolar, drones e rotas animados nos mapas, transições de estado e confirmações. Tudo respeita `prefers-reduced-motion` e os laços param com a aba oculta. A Saúde não tem animação de entrada.

```
├── index.html, como-funciona.html, sobre.html, central.html, rastreamento.html, orgaos.html
├── faq.html (Ajuda: FAQ + contato), integrantes.html, drone-bot.html, entrar.html
├── saude/index.html (SADEC Saúde)
├── delivery/index.html (SADEC Delivery)
├── css/   variables · base · components · pages · control · saude · delivery · drone-bot
├── js/    ui · operations · data · state · drone-avatar · chatbot · home · central · tracking
│          orgaos · entrar · saude · delivery-core · delivery · form-validation
├── assets/ icons · images (fundos, restaurantes e integrantes)
├── tests/ operations.test.js · delivery.test.js
└── scripts/serve.js (servidor estático de desenvolvimento, sem dependências)
```

## Tecnologias
HTML5, CSS3, JavaScript (ES2022), Git e GitHub. Ferramentas de desenvolvimento: Node.js (testes com `node:test`) e ESLint.

## Como executar
```bash
npm start
```
Abra `http://localhost:5173`. Sem Node, qualquer servidor estático na raiz funciona (ex.: Live Server do VS Code). Abrir o HTML direto (`file://`) exibe as páginas, mas o estado pode não ser compartilhado entre elas.

## Como testar
```bash
npm install
npm test
npm run lint
```
- `npm test`: 35 testes das regras da Central (prioridade, reserva de 30%, seleção, antecipação, voo protegido, transporte alternativo, pane, manutenção, temperatura, recebimento) e do Delivery (sacola, capacidade da frota, cotação, limite de peso, fases do acompanhamento).
- `npm run lint`: ESLint com zero warnings.
- Manual: na Central, use **Cenários de teste**; no Rastreamento, as **Demonstrações de segurança** e o **Registro de recebimento**.

## Integrantes
| Nome | RM | Turma |
|---|---|---|
| Kauan Gomes dos Santos | 574837 | 1TDSPB |
| Pablo Ackillys Anjos da Silva | 576881 | 1TDSPB |
| Thomaz Rafael Krutman Neves da Rocha | 576834 | 1TDSPB |
| Gustavo Almeida Rodrigues | 576939 | 1TDSPB |
| Cláudio Augusto Silva de Assis | 576661 | 1TDSPB |

## Integrações futuras (não implementadas)
O Drone Bot expõe `SIDEC.bot.respond(texto)` com o mesmo contrato assíncrono de um serviço real. Uma integração com IBM watsonx Assistant e Telegram (com áudio) deve passar por um backend próprio que guarde as credenciais; nenhuma chave deve ficar no front-end.
