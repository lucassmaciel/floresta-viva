# Floresta Viva — Design da dApp de reflorestamento na Amazônia

Data: 15/11/2026 · Entrega do trabalho: **16/11/2026, 23h59**
Fonte dos requisitos: `Guia do Trabalho Prático — dApp na Ethereum.docx` (na raiz da pasta).

## 1. Intenção e porquê

Trabalho prático de faculdade (equipe de até 4): uma dApp completa na Ethereum Sepolia que
demonstre domínio do ciclo contrato → deploy → frontend → apresentação. O objetivo concreto é
**nota máxima** nos critérios do guia (seção 6 do docx), entregue **a tempo** (amanhã).

Tema: **financiamento coletivo de reflorestamento na Amazônia**. Comunidades/viveiros
cadastrados criam projetos de plantio (ex.: "500 mudas de castanheira em Manacapuru") com meta
em ETH e prazo. O público apoia. O dinheiro é liberado **em duas parcelas**: 50% ao bater a meta
(para comprar mudas) e 50% só depois que a comunidade registra uma prova do plantio e o
verificador (dono do contrato) a valida. Se algo falhar, os apoiadores recuperam o que ficou
retido no contrato.

**Por que blockchain** (argumento da apresentação): o doador vê onde está cada wei, a regra de
liberação é código público que ninguém pode mudar, e a prova do plantio (hash) fica gravada para
sempre — "o doador só paga a segunda metade pelo que foi plantado".

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
- Cumprir 100% dos requisitos do contrato (7 grupos de recursos, ≥6 funções com regra de negócio,
  controle de acesso, NatSpec, marcações `// [Recurso: ...]`).
- Cumprir os 9 itens obrigatórios do frontend.
- Código fácil de explicar na arguição por qualquer membro (nomes em português, comentários
  didáticos, sem truques).
- Demo de 5 min que mostre: conectar, ler, apoiar com ETH, provocar erro tratado, evento e
  Etherscan — incluindo um fluxo de sucesso e um de reembolso.

**Não-objetivos**
- Armazenar fotos/laudos (só o hash `bytes32` vai on-chain; o arquivo fica com a comunidade).
- Verificação descentralizada (oráculos, votação de apoiadores). O dono é o verificador.
- Tokens, NFTs de certificado, créditos de carbono.
- Leitura sem carteira conectada (RPC público) — só se sobrar tempo.
- Slides prontos neste momento (podem ser feitos depois, a partir do README).

**Anti-objetivos** (falharia mesmo "funcionando")
- Qualquer caminho que permita sacar mais do que o devido ou travar ETH sem saída
  (critério "Falhas que permitem burlar regras ou perder ETH" zera segurança).
- Recurso obrigatório declarado mas sem uso real.
- Frontend com framework, bundler ou etapa de build (o guia exige HTML/CSS/JS puros).
- Precisar refazer o deploy na véspera por bug descoberto tarde.
- Código que os membros não consigam explicar.

## 3. Restrições (do guia)

- Solidity `^0.8.24`; Remix IDE + MetaMask ("Injected Provider") para compilar/implantar.
- Sepolia, Chain ID 11155111 (`0xaa36a7`).
- Web3.js **4.x via CDN**; sem React/Vue.
- Hospedagem **Vercel** (Hobby), deploy a partir de repositório **público** no GitHub.
- Arquivos do frontend: `index.html`, `style.css`, `app.js`, `contrato.js` (ABI + endereço).
- Estrutura do repositório conforme o guia (adaptada ao nome da dApp):
  ```
  contracts/FlorestaViva.sol
  frontend/index.html, style.css, app.js, contrato.js
  docs/slides.pdf, docs/prints/
  README.md
  ```
- README com o conteúdo mínimo do guia, incluindo **declaração de uso de IA**.
- Nada de chave privada/frase de recuperação no repositório.

## 4. Abordagens consideradas

| | Abordagem | Trade-off |
|---|---|---|
| A | Saque integral ao bater a meta; verificação só como selo | Mais simples, mas a verificação não tem consequência e o argumento "por que blockchain" fica fraco |
| **B** | **Duas parcelas: 50% na meta, 50% após verificação; cancelamento devolve o retido** | **Escolhida pela equipe.** Verificação com efeito real, dois caminhos de reembolso, mostra checks-effects-interactions. Custa ~2 funções e uma conta de proporção |
| C | Marcos genéricos (N parcelas) | Flexível, mas complexo demais para um dia; laço sobre marcos complica gas |

Outros temas avaliados antes (vaquinha genérica, ingressos, escrow de serviços, castanha justa,
brigadas contra queimadas). A equipe escolheu **reflorestamento + abordagem B**.

## 5. Atores e contas da demo

- **Dono / Verificador** — quem implanta o contrato (`immutable`). Cadastra/desativa comunidades,
  verifica plantio, cancela projetos.
- **Comunidade** — endereço cadastrado pelo dono. Cria projetos, registra prova, saca parcelas.
- **Apoiador** — qualquer endereço. Apoia com ETH, pede reembolso.

Demo com **3 contas na MetaMask** (uma por papel), todas com SepoliaETH. O dono **não pode** ser
cadastrado como comunidade (evita confusão de papéis).

## 6. Contrato `FlorestaViva.sol`

### 6.1 Estados (enum `Status`)

```
                 meta atingida (no apoiar)
   Captando ────────────────────────────▶ Financiado ──registrarPlantio──▶ Plantado ──verificarPlantio──▶ Verificado
      │                                       │                                │
      │ dono (suspeita), ou                   │ após prazoPlantio sem prova:    │ dono (prova rejeitada), ou
      │ qualquer um após prazo sem meta       │ dono ou qualquer um             │ qualquer um após prazoVerificacao
      └──────────────────────────────▶  Cancelado  ◀───────────────────────────┘
```

**Nenhum estado não-final depende só do dono para sair**: todo projeto em `Captando`,
`Financiado` ou `Plantado` tem um prazo a partir do qual qualquer pessoa pode movê-lo para
`Cancelado` (função `encerrarPorPrazo`). Assim, mesmo que o dono perca a chave ou abandone o
contrato, nenhum ETH fica preso **por inação do dono**. Valores devidos e ainda não sacados
(parcelas da comunidade, reembolsos não pedidos) ficam no contrato até o dono do direito pedir —
comportamento normal de *pull payment*, documentado no README. Uma comunidade cujo endereço
rejeite ETH (contrato sem `receive`) não consegue sacar; é responsabilidade do dono cadastrar
contas comuns (limitação documentada).
`enum Status { Captando, Financiado, Plantado, Verificado, Cancelado }`

`Verificado` e `Cancelado` são finais.

### 6.2 Regras de dinheiro

- `apoiar(id)` aceita ETH enquanto `Captando` e antes do prazo de captação. O apoio que faz
  `arrecadado >= meta` muda o estado para `Financiado` na mesma transação (o excedente é aceito;
  apoios seguintes revertem por estado inválido). Ao financiar, grava
  `prazoPlantio = block.timestamp + duracaoPlantio`.
- **Valor liberado à comunidade** (calculado, não armazenado):
  - `Financiado` ou `Plantado`: `primeiraParcela = arrecadado * 50 / 100`
  - `Verificado`: `arrecadado` (tudo)
  - `Captando` ou `Cancelado`: o que já foi sacado (nada novo)
  - `disponivelParaSaque = liberado − sacado`
- `sacar(id)` (só a comunidade do projeto) envia `disponivelParaSaque`. Pull payment: nunca
  enviamos ETH automaticamente dentro de outras funções.
- **Cancelamento** grava `saldoReembolsavel = arrecadado − sacado` no momento em que acontece. Se
  a comunidade não sacou a primeira parcela antes do cancelamento, ela perde esse direito (vai
  para os apoiadores). Documentar no README.
- **Reembolso** (`pedirReembolso(id)`, só em `Cancelado`):
  `valor = contribuicao * saldoReembolsavel / arrecadado`. Zera a contribuição antes de enviar.
  A checagem `contribuicao == 0 → NadaAReembolsar` vem **antes** da divisão (projeto cancelado
  sem apoios tem `arrecadado == 0`).
  - Meta não atingida → nada foi sacado → reembolso integral.
  - Cancelado após saque da 1ª parcela → cada um recebe ~50% proporcional.
  - **Sem resto preso**: o projeto acumula `contribuicoesReembolsadas` (soma das contribuições
    já reembolsadas) e `totalReembolsado` (wei já devolvidos). Se, após este pedido,
    `contribuicoesReembolsadas == arrecadado` (é o último apoiador), ele recebe
    `saldoReembolsavel − totalReembolsado`, absorvendo os wei do arredondamento.
- Toda transferência via `call{value: ...}` com verificação de sucesso (erro
  `TransferenciaFalhou`), seguindo **checks-effects-interactions** e protegida por um
  modificador próprio de reentrância.
- O contrato **não** tem `receive`/`fallback`: ETH enviado direto é rejeitado (o único jeito de
  apoiar é `apoiar`).

### 6.3 Regras de cancelamento

**`cancelarProjeto(id, motivo)` — só o dono:**
- `Captando`: enquanto `block.timestamp < prazoCaptacao` (projeto suspeito); depois disso só `encerrarPorPrazo`.
- `Financiado`: **só depois de vencido `prazoPlantio`** sem registro de plantio (protege a
  comunidade de cancelamento arbitrário).
- `Plantado`: enquanto `block.timestamp < prazoVerificacao` (prova rejeitada).
- `Verificado`/`Cancelado`: reverte.

**Sem corrida após os prazos** (decisão do Claude): depois que um prazo vence, só
`encerrarPorPrazo` decide o destino do projeto. `verificarPlantio` e `cancelarProjeto` em
`Plantado` exigem `block.timestamp < prazoVerificacao` (senão `PrazoEncerrado`);
`registrarPlantio` exige `block.timestamp < prazoPlantio`; `apoiar` exige
`block.timestamp < prazoCaptacao`. Todo `encerrarPorPrazo` usa `>=` no mesmo limite, então em
nenhum segundo um projeto está "aberto" e "encerrável" ao mesmo tempo. Testes cobrem a fronteira.
Em `Financiado` após `prazoPlantio`, `cancelarProjeto` do dono e `encerrarPorPrazo` têm o mesmo
efeito (incluindo −1 de reputação), então a ordem não importa.

**`encerrarPorPrazo(id)` — qualquer pessoa** (decisão da equipe: o atraso nunca trava ETH):
- `Captando`, `prazoCaptacao` vencido e meta não atingida → `Cancelado`
  ("meta não atingida"). Reembolso integral.
- `Financiado`, `prazoPlantio` vencido sem prova → `Cancelado` ("plantio não registrado no
  prazo"). Apoiadores recuperam o retido.
- `Plantado`, `prazoVerificacao` vencido sem decisão do dono → `Cancelado` ("verificação não
  realizada no prazo"). **O retido volta aos apoiadores** (decisão da equipe: o doador só paga a
  2ª metade pelo que foi verificado). A comunidade mantém a 1ª parcela.
- Antes do prazo correspondente reverte com `PrazoNaoEncerrado(agora, prazo)`; em outros
  estados, `EstadoInvalido`.

`prazoVerificacao = block.timestamp + prazoVerificacaoSeg`, gravado em `registrarPlantio`.
`prazoVerificacaoSeg` é **`immutable`**, definido no `constructor(uint256 prazoVerificacaoMin)`
(na demo, poucos minutos; o README diz que em produção seria ~7 dias).

**Reputação da comunidade:**
- `+1` ao ser verificada.
- `−1` ao cancelar a partir de `Financiado` (por qualquer caminho), quando o dono rejeita a
  prova em `Plantado`, ou quando o dono cancela um projeto `Captando` por suspeita (decisão do
  Claude: senão o cancelamento por suspeita não teria consequência).
- **Sem penalidade** quando o cancelamento vem do vencimento do prazo de verificação (a falha
  foi do verificador) ou de meta não atingida.

### 6.4 Reputação e limites

- `Comunidade { string nome; bool ativa; int256 reputacao; uint256[] projetos }` (ou com
  contagem; o builder decide o formato exato).
- `int256 public constant REPUTACAO_MINIMA = -2;` — abaixo disso a comunidade não cria projetos
  (`ReputacaoInsuficiente(int256 atual)`). Uso natural de `int`.
- `uint256 public constant MAX_PROJETOS_ATIVOS = 3;` — laço `for` em `_contarProjetosAtivos`
  percorre os projetos da comunidade. Tamanho limitado por
  `MAX_PROJETOS_POR_COMUNIDADE = 20` (verificado em `criarProjeto`), então o laço é limitado.
- `uint256 public constant PERCENTUAL_PRIMEIRA_PARCELA = 50;`

### 6.5 Dados

```
struct Projeto {
  uint256 id;
  address payable comunidade;
  string titulo;
  string local;              // ex.: "Manacapuru - AM"
  uint256 quantidadeMudas;
  uint256 meta;              // wei
  uint256 arrecadado;
  uint256 sacado;
  uint256 saldoReembolsavel; // gravado no cancelamento
  uint256 prazoCaptacao;     // timestamp
  uint256 duracaoPlantio;    // segundos, informado na criação
  uint256 prazoPlantio;      // timestamp, definido ao financiar
  uint256 prazoVerificacao;  // timestamp, definido ao registrar plantio
  uint256 contribuicoesReembolsadas; // soma das contribuições já reembolsadas
  uint256 totalReembolsado;  // wei já devolvidos
  bytes32 provaPlantio;      // keccak256 do arquivo de prova
  Status status;
}

address payable public immutable dono;
uint256 public immutable prazoVerificacaoSeg;
Projeto[] private projetos;                                         // array dinâmico (id = índice)
mapping(address => uint256) public totalApoiadoPor;                 // mapping simples ("seu impacto")
mapping(address => Comunidade) public comunidades;                  // mapping → struct
mapping(uint256 => mapping(address => uint256)) public contribuicoes; // mapping aninhado
bool private travado;                                               // reentrância
```

Na criação, os prazos chegam em **minutos** (`duracaoCaptacaoMin`, `duracaoPlantioMin`) para
permitir demo ao vivo; o contrato converte com `* 1 minutes`. Validações por `require`
(título não vazio, meta > 0, mudas > 0, durações > 0 e com teto razoável).

### 6.6 Funções

Regras de negócio (public/external) — 10 no total:

| Função | Quem | Faz |
|---|---|---|
| `cadastrarComunidade(address payable conta, string nome)` | dono | cadastra; se já existe, só reativa e atualiza o nome, **mantendo reputação e histórico** (não pode ser o dono nem endereço zero) |
| `desativarComunidade(address conta)` | dono | impede **apenas novos projetos**; projetos existentes seguem (a comunidade ainda registra plantio e saca o que lhe é devido) |
| `criarProjeto(titulo, local, mudas, meta, duracaoCaptacaoMin, duracaoPlantioMin)` | comunidade ativa | cria em `Captando` |
| `apoiar(uint256 id)` **payable** | qualquer um | registra contribuição; pode financiar |
| `encerrarPorPrazo(uint256 id)` | qualquer um | cancela projeto com prazo vencido (regras da 6.3) |
| `registrarPlantio(uint256 id, bytes32 prova)` | comunidade do projeto | `Financiado → Plantado`, grava `prazoVerificacao` (prova ≠ `bytes32(0)`, antes de `prazoPlantio`) |
| `verificarPlantio(uint256 id)` | dono | `Plantado → Verificado`, +1 reputação |
| `cancelarProjeto(uint256 id, string motivo)` | dono | regras da 6.3 |
| `sacar(uint256 id)` | comunidade do projeto | envia o disponível |
| `pedirReembolso(uint256 id)` | apoiador | envia a parte proporcional |

Leitura e auxiliares (para cobrir todas as visibilidades com sentido):
- `totalProjetos()` **public view**; `obterProjeto(id)` **external view** (retorna a struct);
  `disponivelParaSaque(id)` **public view** (usada por `sacar` e pela UI);
  `valorReembolsavel(id, apoiador)` **public view**; `projetosDaComunidade(conta)` **external view**.
- `calcularPrimeiraParcela(uint256 valor)` **public pure**.
- `_contarProjetosAtivos(conta)` **internal view**; `_validarDadosProjeto(...)` **internal pure**.
- `_transferir(address payable para, uint256 valor)` **private**.
- `constructor(uint256 prazoVerificacaoMin)` define `dono = payable(msg.sender)` e
  `prazoVerificacaoSeg`.
- `sacar` e `registrarPlantio` usam `apenasComunidadeDoProjeto` (não exigem comunidade ativa),
  para que a desativação nunca trave dinheiro já devido.

### 6.7 Modificadores (próprios)

`apenasDono`, `apenasComunidadeAtiva`, `apenasComunidadeDoProjeto(uint256 id)`,
`projetoExiste(uint256 id)`, `noEstado(uint256 id, Status esperado)`, `semReentrada`.

### 6.8 Eventos (com `indexed`)

`ComunidadeCadastrada(address indexed conta, string nome)`,
`ComunidadeDesativada(address indexed conta)`,
`ProjetoCriado(uint256 indexed id, address indexed comunidade, string titulo, uint256 meta, uint256 prazoCaptacao)`,
`ApoioRecebido(uint256 indexed id, address indexed apoiador, uint256 valor)`,
`ProjetoFinanciado(uint256 indexed id, uint256 arrecadado, uint256 prazoPlantio)`,
`PlantioRegistrado(uint256 indexed id, bytes32 prova)`,
`PlantioVerificado(uint256 indexed id, address indexed verificador)`,
`ProjetoCancelado(uint256 indexed id, string motivo, uint256 saldoReembolsavel)`,
`SaqueRealizado(uint256 indexed id, address indexed comunidade, uint256 valor)`,
`ReembolsoRealizado(uint256 indexed id, address indexed apoiador, uint256 valor)`.

### 6.9 Erros personalizados (além de `require`)

`NaoAutorizado(address chamador)`, `ProjetoInexistente(uint256 id)`,
`EstadoInvalido(uint256 id, Status atual, Status esperado)`,
`PrazoNaoEncerrado(uint256 agora, uint256 prazo)`, `PrazoEncerrado(uint256 prazo)`,
`ValorInvalido()`, `NadaASacar()`, `NadaAReembolsar()`, `MetaJaAtingida(uint256 id)`,
`ReputacaoInsuficiente(int256 atual)`, `LimiteDeProjetosAtingido(uint256 limite)`,
`TransferenciaFalhou(address para, uint256 valor)`.

O builder pode juntar ou cortar erros, desde que fiquem ≥2 bem usados e todos os listados na
UI tenham mensagem traduzida.

### 6.10 Mapa dos 7 grupos (vai para a tabela do README)

| Grupo | Onde |
|---|---|
| TiposDeDados | `uint256` (valores), `int256` (reputação, `REPUTACAO_MINIMA`), `bool` (`ativa`, `travado`), `address payable` (dono, comunidade), `string` (título, local, motivo), `bytes32` (prova), `immutable` (dono, `prazoVerificacaoSeg`), `constant` (limites, percentual) |
| Funcoes | tabela 6.6: external/public/internal/private, view/pure, `apoiar` payable, constructor |
| EstruturasDeControle | `if/else` em liberação e cancelamento, `for` limitado em `_contarProjetosAtivos`, `require` nas validações |
| ArraysEMappings | `Projeto[] projetos`, `totalApoiadoPor`, `contribuicoes` aninhado, `comunidades` → struct |
| StructsEEnums | `Projeto` (17 campos), `Comunidade`, `Status` |
| Modificadores | 6 próprios, 3 com parâmetro |
| EventosEErros | 10 eventos com `indexed`, erros personalizados com `revert`, `require` |

Cada ocorrência marcada no código com `// [Recurso: <Grupo>]` e NatSpec (`@notice`, `@param`,
`@return`) em todas as funções públicas/externas.

## 7. Frontend (`frontend/`)

HTML/CSS/JS puros, Web3.js 4.x via CDN (versão exata fixada, ex. `web3@4.x.y` no jsDelivr). Sem
build: a Vercel publica a pasta `frontend/` como site estático. Visual com identidade amazônica
(verdes de floresta, terra, tipografia legível), responsivo.

### 7.1 Áreas da tela

```
┌──────────────────────────────────────────────────────────────┐
│ 🌳 Floresta Viva        [Sepolia ✓]  0x12…ab · 0,42 ETH [Conectar] │
├──────────────────────────────────────────────────────────────┤
│ ⚠ Você está na rede X. [Trocar para Sepolia]   (só se errado) │
├──────────────────────────────────────────────────────────────┤
│ Totais: 4 projetos · 1,2 ETH arrecadados · 2.300 mudas       │
├──────────────────────────────────────────────────────────────┤
│ Projetos                                                     │
│ ┌────────────────────────┐ ┌────────────────────────┐        │
│ │ Castanheiras Manacapuru│ │ Açaizal Barcelos       │        │
│ │ [Captando] ▓▓▓▓░░ 60%  │ │ [Plantado] prova 0x9f… │        │
│ │ termina em 04:12       │ │                        │        │
│ │ [0,01 ETH] [Apoiar]    │ │ (ações conforme papel) │        │
│ └────────────────────────┘ └────────────────────────┘        │
├──────────────────────────────────────────────────────────────┤
│ Minha comunidade (só se a conta for comunidade ativa)        │
│  criar projeto · registrar plantio (escolher arquivo → hash) · sacar │
├──────────────────────────────────────────────────────────────┤
│ Meus apoios (total apoiado, reembolsos disponíveis)          │
├──────────────────────────────────────────────────────────────┤
│ Painel do verificador (só para o dono)                       │
│  cadastrar/desativar comunidade · verificar · cancelar       │
├──────────────────────────────────────────────────────────────┤
│ Histórico de eventos (getPastEvents desde o bloco do deploy) │
├──────────────────────────────────────────────────────────────┤
│ Transações: 0xabc… ⏳ pendente → ✅ confirmada / ❌ falhou [Etherscan] │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 Comportamentos obrigatórios (checklist do guia)

1. **Conectar carteira**: `eth_requestAccounts`; mostra endereço abreviado e saldo em ETH.
2. **Rede**: se `chainId != 0xaa36a7`, banner + botão que chama `wallet_switchEthereumChain`
   (e `wallet_addEthereumChain` se o erro for 4902). Ações de escrita bloqueadas fora da Sepolia.
3. **Leitura** com `.call()`: projetos, totais, disponível para saque, reembolsável, reputação.
4. **Escrita** com `.send()`; `apoiar` envia `value` (ETH → wei com `web3.utils.toWei`).
5. **Transações**: mostra hash com link `https://sepolia.etherscan.io/tx/<hash>` e estado
   pendente → confirmada/falhou.
6. **Erros** com mensagem compreensível em português:
   - usuário rejeitou (código 4001);
   - revert com erro personalizado (decodificar o nome do erro via ABI e mapear para frase;
     ex. `PrazoNaoEncerrado` → "A captação ainda não terminou: faltam X min");
   - saldo insuficiente (checar saldo antes de enviar e tratar o erro do nó).
   Estratégia sugerida: simular com `.call()`/`estimateGas` antes do `.send()` para obter o erro
   decodificado sem gastar gas.
7. **Eventos**: histórico via `getPastEvents('allEvents', { fromBlock: BLOCO_DEPLOY })` e
   recarga após cada transação confirmada (polling leve opcional).
8. **Dono**: painel do verificador só aparece se a conta conectada == `dono()`.
9. **Troca de conta/rede**: `accountsChanged` e `chainChanged` recarregam estado e tela.

Registro de prova: a comunidade escolhe um arquivo (foto/laudo); o navegador calcula
`keccak256` dos bytes (`web3.utils.keccak256`) e envia o `bytes32`. O arquivo não sai do
computador. A UI explica que qualquer pessoa pode recalcular o hash do mesmo arquivo para
conferir.

### 7.3 `contrato.js`

```js
const CONTRATO_ENDERECO = "0x...";   // preenchido após o deploy
const BLOCO_DEPLOY = 0;               // bloco do deploy (para getPastEvents)
const CONTRATO_ABI = [ ... ];         // copiado do Remix após compilar
```

## 8. Documentação e entregáveis

- `README.md` com todas as seções do guia. Campos que só a equipe sabe ficam como
  `<!-- PREENCHER -->`: nomes e papéis, endereço/hash/bloco do deploy, URL da Vercel, link do
  vídeo.
- Diagrama de estados (Mermaid no README, renderizado pelo GitHub).
- Tabela de recursos com linhas reais do `.sol` (gerada depois que o código estiver final).
- Roteiro de teste para o avaliador (fluxo de sucesso + fluxo de reembolso + erro provocado).
- Declaração de uso de IA (Claude: design, código do contrato e frontend, documentação; a equipe
  revisou, implantou e testou).
- Guia de deploy passo a passo para a equipe (Remix → MetaMask → Sepolia; verificação no
  Etherscan; GitHub; Vercel com Root Directory `frontend`).
- Roteiro da apresentação/demo cronometrado (15 min) com quem fala o quê.
- `docs/prints/` e `docs/slides.pdf`: a equipe produz (slides podem ser gerados depois a
  partir do README).

## 9. Divisão de trabalho e sequência (prazo: amanhã)

**Só a equipe pode fazer** (envolve carteira/contas de vocês):
- Pegar SepoliaETH em faucet para as 3 contas — **começar já** (faucets podem exigir saldo na
  mainnet ou ter fila).
- Deploy pelo Remix, verificação no Etherscan, preencher `contrato.js`.
- Criar o repositório público no GitHub com commits de cada membro; conectar à Vercel.
- Gravar o vídeo (3–5 min), prints, slides; ensaiar.

**Claude faz**: contrato, testes locais, frontend, README, guias de deploy/demo.

Sequência:
1. Contrato + testes locais automatizados cobrindo os fluxos e erros principais (antes de
   qualquer deploy, para não precisar reimplantar).
2. Equipe implanta na Sepolia e passa endereço + bloco.
3. Frontend completo (pode começar em paralelo ao deploy, com endereço provisório).
4. Equipe sobe no GitHub/Vercel; teste ponta a ponta com as 3 contas seguindo o roteiro.
5. README final com dados reais, tabela de recursos com linhas, roteiro da apresentação.
6. Equipe grava vídeo, gera slides/prints, entrega até 23h59 de 16/11.

## 10. Decisões tomadas pelo Claude (podem ser corrigidas)

- Nome da dApp **Floresta Viva**, contrato `FlorestaViva.sol`.
- O repositório é esta pasta (`dApp Ethereum`); o `.docx` do guia fica fora do versionamento.
- 3 contas na demo; dono não pode ser comunidade.
- Prazos em minutos na criação do projeto.
- Primeira parcela de 50%, fixa (`constant`).
- Reputação `int256` com mínimo −2 e limite de 3 projetos ativos por comunidade.
- `MAX_PROJETOS_POR_COMUNIDADE = 20` conta o histórico inteiro (limita o laço); documentado no
  README como limitação.
- Comunidade perde a 1ª parcela não sacada se o projeto for cancelado.
- Desativar comunidade só bloqueia projetos novos; reativar não zera reputação nem histórico.
- Último apoiador a pedir reembolso recebe o resto do arredondamento (nenhum wei preso).
- Prazo de verificação como `immutable` no constructor (minutos na demo).
- `dono` continua `immutable` e sem transferência de propriedade: os prazos públicos já
  garantem que nenhum ETH depende só do dono.
- Sem leitura sem carteira (RPC público) na primeira versão.
- Testes locais do contrato (fora do Remix) como rede de segurança; os testes no Remix exigidos
  pelo guia são feitos pela equipe no deploy.

## 11. Deixado para o builder

- Formato exato da struct `Comunidade` e dos retornos das views.
- Ferramenta dos testes locais (ex.: solc + nó local) e onde ficam.
- Versão exata da Web3.js 4.x no CDN, paleta e tipografia, textos da UI.
- Lista final de erros personalizados (respeitando 6.9).
- Teto das durações em minutos e valores mínimos de apoio.
