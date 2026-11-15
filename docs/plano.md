# Floresta Viva — Plano de Implementação

**Goal:** Construir a dApp Floresta Viva (contrato `FlorestaViva.sol` + frontend estático Web3.js) pronta para a equipe implantar na Sepolia e publicar na Vercel até 16/11/2026 23h59.

**Architecture:** Um único contrato Solidity sem imports (colável no Remix), testado localmente com Hardhat antes do deploy. Frontend HTML/CSS/JS puros em `frontend/`, com Web3.js 4 via CDN e a MetaMask como provedor. Para verificar o frontend sem MetaMask, um servidor de desenvolvimento em `dev/` injeta um provedor EIP-1193 falso que repassa as chamadas a um nó Hardhat local configurado com o Chain ID da Sepolia.

**Tech Stack:** Solidity 0.8.24, Hardhat 2.22.x + `@nomicfoundation/hardhat-toolbox` 5.x (ethers v6, chai, network-helpers) só para testes; Web3.js 4.16.0 (`https://cdn.jsdelivr.net/npm/web3@4.16.0/dist/web3.min.js`); Node 22 (já instalado).

**Spec:** `docs/design.md` — ler inteiro antes de começar; as seções 6.x definem as regras do contrato.

## Global Constraints

- `pragma solidity ^0.8.24;` — contrato em um arquivo, **sem imports** (vai ser colado no Remix).
- Compilador nos testes: `0.8.24`, optimizer **desligado** (igual ao padrão do Remix, para a verificação no Etherscan bater).
- Todo identificador, mensagem, comentário e texto de UI em **português**.
- Cada uso de recurso marcado com `// [Recurso: <Grupo>]`, sendo `<Grupo>` um de: `TiposDeDados`, `Funcoes`, `EstruturasDeControle`, `ArraysEMappings`, `StructsEEnums`, `Modificadores`, `EventosEErros`.
- NatSpec (`/// @notice`, `/// @param`, `/// @return`) em toda função public/external e no contrato.
- Frontend: só `index.html`, `style.css`, `app.js`, `contrato.js` em `frontend/`; sem framework, sem bundler, sem build.
- Sepolia: Chain ID `11155111` / `0xaa36a7`; explorer `https://sepolia.etherscan.io`.
- Nunca colocar chave privada ou frase de recuperação em arquivo algum.
- `node_modules/`, `artifacts/`, `cache/`, `*.docx` no `.gitignore`.
- Commits: o executor faz commits locais nos pontos indicados. Nenhum push (o repositório remoto é da equipe).

## Review Focus

1. **Valor em ETH com vírgula** ("0,01") digitado por usuário brasileiro → deve ser aceito como 0.01; texto inválido ("abc", vazio, negativo) → mensagem clara, sem transação. *(Task 9, passo de verificação)*
2. **Navegador sem MetaMask** (`window.ethereum` indefinido) → página renderiza, botão Conectar mostra "Instale a MetaMask" com link, nada quebra no console. *(Task 7)*
3. **Clique duplo / segundo envio enquanto uma transação está pendente** → botões de ação ficam desabilitados até a confirmação ou falha; não sai uma segunda transação. *(Task 9)*
4. **Endereço do contrato não configurado ou histórico indisponível** (placeholder `0x000…`, RPC recusa `getPastEvents`) → aviso "Contrato não configurado" / "Histórico indisponível" no lugar da seção; o resto da página continua funcionando. *(Task 8)*
5. **Relógio local à frente do tempo do bloco** → o botão "Encerrar por prazo" pode aparecer habilitado e a transação reverter com `PrazoNaoEncerrado`; o usuário deve ver "O prazo ainda não terminou na blockchain: aguarde ~N s", não um erro genérico. *(Task 9)*

---

## Estrutura de arquivos

```
.gitignore
package.json                     # devDependencies de teste (hardhat)
hardhat.config.js                # solc 0.8.24, chainId 11155111 na rede hardhat
contracts/FlorestaViva.sol       # o contrato (entregável)
contracts/test/AtacanteReentrancia.sol  # só para teste de reentrância
test/FlorestaViva.test.js        # testes Hardhat
scripts/exportar-abi.js          # gera frontend/contrato.js a partir do artifact
scripts/deploy-local.js          # implanta no nó local e escreve dev/contrato.local.js
dev/servidor.js                  # servidor estático que injeta provedor falso (dev only)
dev/provedor-local.js            # EIP-1193 falso → nó Hardhat
.claude/launch.json              # preview do servidor dev
frontend/index.html, style.css, app.js, contrato.js
docs/DEPLOY.md                   # passo a passo da equipe (Remix, Etherscan, GitHub, Vercel)
docs/APRESENTACAO.md             # roteiro cronometrado de 15 min + demo
docs/prints/.gitkeep
README.md
```

---

### Task 1: Projeto, comunidades e controle de acesso

**Files:**
- Create: `.gitignore`, `package.json`, `hardhat.config.js`, `contracts/FlorestaViva.sol`, `test/FlorestaViva.test.js`

**Interfaces:**
- Produces (Solidity, usados por todas as tasks seguintes):
  - `enum Status { Captando, Financiado, Plantado, Verificado, Cancelado }`
  - `struct Projeto` com os campos exatos da spec 6.5 (incluindo `prazoVerificacao`, `contribuicoesReembolsadas`, `totalReembolsado`), na ordem: `id, comunidade, titulo, local, quantidadeMudas, meta, arrecadado, sacado, saldoReembolsavel, prazoCaptacao, duracaoPlantio, prazoPlantio, prazoVerificacao, contribuicoesReembolsadas, totalReembolsado, provaPlantio, status`
  - `struct Comunidade { string nome; bool cadastrada; bool ativa; int256 reputacao; uint256[] projetos; }`
  - `address payable public immutable dono; uint256 public immutable prazoVerificacaoSeg;`
  - constantes: `PERCENTUAL_PRIMEIRA_PARCELA = 50`, `MAX_PROJETOS_ATIVOS = 3`, `MAX_PROJETOS_POR_COMUNIDADE = 20`, `int256 REPUTACAO_MINIMA = -2`, `MAX_DURACAO_MIN = 525_600`, `MAX_TEXTO = 80`
  - `mapping(address => Comunidade) public comunidades;` (getter retorna `nome, cadastrada, ativa, reputacao`)
  - todos os erros e eventos da spec 6.8/6.9, **exceto** `MetaJaAtingida` (coberto por `EstadoInvalido`)
  - modificadores: `apenasDono`, `apenasComunidadeAtiva`, `apenasComunidadeDoProjeto(uint256 id)`, `projetoExiste(uint256 id)`, `noEstado(uint256 id, Status esperado)`, `semReentrada` (declarar todos aqui; os que dependem de `projetos` funcionam assim que o array existir)
  - `constructor(uint256 prazoVerificacaoMin)` — `require(prazoVerificacaoMin > 0 && prazoVerificacaoMin <= MAX_DURACAO_MIN)`
  - `cadastrarComunidade(address payable conta, string calldata nome) external apenasDono`
  - `desativarComunidade(address conta) external apenasDono`
  - `projetosDaComunidade(address conta) external view returns (uint256[] memory)`
- Produces (JS de teste): fixture `implantar()` em `test/FlorestaViva.test.js` retornando `{ contrato, dono, comunidade, apoiador, apoiador2, outro }`, implantando com `prazoVerificacaoMin = 10`.

- [ ] **Step 1: Inicializar projeto**

```bash
git init
npm init -y
npm install --save-dev hardhat@^2.22 @nomicfoundation/hardhat-toolbox@^5
```
`hardhat.config.js`: `require("@nomicfoundation/hardhat-toolbox")`; `solidity: { version: "0.8.24", settings: { optimizer: { enabled: false } } }`; `networks: { hardhat: { chainId: 11155111 } }`. `package.json` scripts: `"test": "hardhat test"`, `"compilar": "hardhat compile"`. `.gitignore` conforme Global Constraints.

- [ ] **Step 2: Escrever testes que falham** (`describe("Comunidades")`)
  - `constructor`: `dono()` == deployer; `prazoVerificacaoSeg()` == 600; deploy com 0 reverte.
  - `cadastra comunidade`: emite `ComunidadeCadastrada(comunidade, "Viveiro Manacapuru")`; `comunidades(addr)` → `cadastrada == true`, `ativa == true`, `reputacao == 0`.
  - `só o dono cadastra`: chamado por `outro` → `revertedWithCustomError(contrato, "NaoAutorizado").withArgs(outro.address)`.
  - `rejeita dono, endereço zero e nome vazio`: três `reverted`.
  - `desativa`: emite `ComunidadeDesativada`; `ativa == false`.
  - `reativar mantém reputação e histórico`: (preparar reputação via storage não é possível ainda — testar só que `cadastrada` continua true, `ativa` volta true e o nome é atualizado; o teste de reputação preservada vai na Task 4).

- [ ] **Step 3: Rodar e ver falhar** — `npx hardhat test` → falha de compilação/“contract not found”.

- [ ] **Step 4: Implementar** o esqueleto do contrato com os tipos, estado, erros, eventos, modificadores, constructor e as duas funções de comunidade. Reativação: se `cadastrada`, só `ativa = true` e `nome = nome`. Marcar recursos e NatSpec desde já. `semReentrada`: `require(!travado, "Reentrada bloqueada"); travado = true; _; travado = false;`.

- [ ] **Step 5: Rodar** — `npx hardhat test` → todos passam.

- [ ] **Step 6: Commit** — `feat: esqueleto do contrato e cadastro de comunidades`

---

### Task 2: Criação de projetos e leituras

**Files:**
- Modify: `contracts/FlorestaViva.sol`, `test/FlorestaViva.test.js`

**Interfaces:**
- Consumes: Task 1 inteira.
- Produces:
  - `criarProjeto(string calldata titulo, string calldata local, uint256 quantidadeMudas, uint256 meta, uint256 duracaoCaptacaoMin, uint256 duracaoPlantioMin) external apenasComunidadeAtiva returns (uint256 id)`
  - `totalProjetos() public view returns (uint256)`
  - `obterProjeto(uint256 id) external view projetoExiste(id) returns (Projeto memory)`
  - `_validarDadosProjeto(string calldata titulo, string calldata local, uint256 mudas, uint256 meta, uint256 durCapMin, uint256 durPlantMin) internal pure`
  - `_contarProjetosAtivos(address conta) internal view returns (uint256)` — `for` sobre `comunidades[conta].projetos`, conta status `Captando|Financiado|Plantado`.
  - Helper de teste `criarProjetoPadrao(contrato, comunidade, overrides?)`: título "Castanheiras de Manacapuru", local "Manacapuru - AM", 500 mudas, meta `parseEther("1")`, captação 30 min, plantio 60 min.

- [ ] **Step 1: Testes que falham** (`describe("Projetos")`)
  - `cria projeto`: `id == 0`; emite `ProjetoCriado(0, comunidade, "Castanheiras de Manacapuru", parseEther("1"), prazo)`; `obterProjeto(0)` tem `status == 0`, `prazoCaptacao == timestamp do bloco + 30*60`, `duracaoPlantio == 3600`; `projetosDaComunidade` == `[0]`; `totalProjetos() == 1`.
  - `só comunidade ativa cria`: apoiador → `NaoAutorizado`; comunidade desativada → `NaoAutorizado`.
  - `valida dados`: título vazio, título com 81 bytes, meta 0, mudas 0, duração 0, duração `525_601` → cada um `reverted`.
  - `limite de ativos`: 3 projetos criam; o 4º → `LimiteDeProjetosAtingido(3)`.
  - `obterProjeto(99)` → `ProjetoInexistente(99)`.

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Ordem de checagens em `criarProjeto`: `_validarDadosProjeto` → reputação (`< REPUTACAO_MINIMA` → `ReputacaoInsuficiente(atual)`) → `projetos.length` da comunidade `>= MAX_PROJETOS_POR_COMUNIDADE` → `LimiteDeProjetosAtingido(20)` → `_contarProjetosAtivos >= MAX_PROJETOS_ATIVOS` → `LimiteDeProjetosAtingido(3)`. Durações: `* 1 minutes`.
- [ ] **Step 4: Rodar** → passa.
- [ ] **Step 5: Commit** — `feat: criação de projetos com validações e limites`

---

### Task 3: Apoio, financiamento e saque

**Files:**
- Modify: `contracts/FlorestaViva.sol`, `test/FlorestaViva.test.js`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `mapping(uint256 => mapping(address => uint256)) public contribuicoes;` `mapping(address => uint256) public totalApoiadoPor;`
  - `apoiar(uint256 id) external payable projetoExiste(id) noEstado(id, Status.Captando)`
  - `calcularPrimeiraParcela(uint256 valor) public pure returns (uint256)` = `valor * 50 / 100`
  - `disponivelParaSaque(uint256 id) public view projetoExiste(id) returns (uint256)` — liberado conforme spec 6.2 menos `sacado`
  - `sacar(uint256 id) external projetoExiste(id) apenasComunidadeDoProjeto(id) semReentrada`
  - `_transferir(address payable para, uint256 valor) private` — `call{value}`; falha → `TransferenciaFalhou(para, valor)`
  - Helper de teste `financiar(contrato, id, apoiadores)` — apoiador `0.6 ETH` + apoiador2 `0.4 ETH` (meta 1 ETH).

- [ ] **Step 1: Testes que falham** (`describe("Apoio e saque")`)
  - `apoia`: emite `ApoioRecebido(0, apoiador, 0.3 ETH)`; `contribuicoes(0, apoiador) == 0.3`; `totalApoiadoPor(apoiador) == 0.3`; saldo do contrato == 0.3.
  - `valor zero` → `ValorInvalido`. `após prazoCaptacao` (`time.increase(31*60)`) → `PrazoEncerrado(prazo)`.
  - `fronteira do prazo`: apoio minerado exatamente em `prazoCaptacao` (`time.setNextBlockTimestamp(prazo)`) → `PrazoEncerrado`; em `prazo - 1` → aceito.
  - `financia ao bater a meta`: após `financiar`, status `Financiado`; emite `ProjetoFinanciado(0, 1 ETH, prazoPlantio)` com `prazoPlantio == ts + 3600`.
  - `excedente aceito`: apoio único de 1.5 ETH → `arrecadado == 1.5`, `Financiado`.
  - `apoio após financiado` → `EstadoInvalido(0, 1, 0)`.
  - `disponível`: `Captando` → 0; `Financiado` → 0.5 ETH.
  - `saca primeira parcela`: `changeEtherBalances([contrato, comunidade], [-0.5, +0.5])`; emite `SaqueRealizado(0, comunidade, 0.5)`; segundo `sacar` → `NadaASacar`.
  - `só a comunidade do projeto saca` → `NaoAutorizado(apoiador)`.
  - `comunidade desativada ainda saca` (Review: desativação não trava dinheiro): desativar depois de financiar → `sacar` funciona.
  - `ETH direto é rejeitado`: `dono.sendTransaction({ to: contrato, value: 1 })` → `reverted`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Em `apoiar`: `if (block.timestamp >= p.prazoCaptacao) revert PrazoEncerrado(...)` (spec 6.3: aberto é `<`, encerrável é `>=`); efeitos; `if (p.arrecadado >= p.meta) { status = Financiado; prazoPlantio = now + duracaoPlantio; emit ProjetoFinanciado }`. `sacar`: checks → `p.sacado += valor` → `_transferir`.
- [ ] **Step 4: Rodar** → passa.
- [ ] **Step 5: Commit** — `feat: apoio com ETH, financiamento e saque da primeira parcela`

---

### Task 4: Plantio, verificação, cancelamento e prazos

**Files:**
- Modify: `contracts/FlorestaViva.sol`, `test/FlorestaViva.test.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `registrarPlantio(uint256 id, bytes32 prova) external projetoExiste(id) apenasComunidadeDoProjeto(id) noEstado(id, Status.Financiado)`
  - `verificarPlantio(uint256 id) external apenasDono projetoExiste(id) noEstado(id, Status.Plantado)`
  - `cancelarProjeto(uint256 id, string calldata motivo) external apenasDono projetoExiste(id)`
  - `encerrarPorPrazo(uint256 id) external projetoExiste(id)`
  - `_cancelar(Projeto storage p, string memory motivo, bool penalizar) internal` — grava `saldoReembolsavel = arrecadado - sacado`, status `Cancelado`, reputação `-1` se `penalizar`, emite `ProjetoCancelado`.
  - Motivos fixos (strings exatas, usadas pela UI): `"Meta nao atingida no prazo"`, `"Plantio nao registrado no prazo"`, `"Verificacao nao realizada no prazo"`. (Sem acento: strings Solidity são UTF-8, mas evitar problemas de cópia no Remix.)

Fronteiras (spec 6.3, "sem corrida após os prazos"): etapa aberta exige `block.timestamp < prazo`; `encerrarPorPrazo` exige `>= prazo`. Logo: `registrarPlantio` com `>= prazoPlantio` → `PrazoEncerrado(prazoPlantio)`; `verificarPlantio` e `cancelarProjeto` em `Plantado` com `>= prazoVerificacao` → `PrazoEncerrado(prazoVerificacao)`; `cancelarProjeto` em `Financiado` com `< prazoPlantio` → `PrazoNaoEncerrado`. Prova `bytes32(0)` → `require` falha.

Penalidade (`_cancelar(..., penalizar)`): `true` para dono em `Captando`, dono em `Plantado`, e qualquer caminho em `Financiado`; `false` para `encerrarPorPrazo` em `Captando` e em `Plantado`.

- [ ] **Step 1: Testes que falham** (`describe("Ciclo do plantio")`, prova = `ethers.id("foto-plantio.jpg")`)
  - `registra plantio`: status `Plantado`, `provaPlantio == prova`, `prazoVerificacao == ts + 600`, emite `PlantioRegistrado(0, prova)`.
  - `prova zero` → reverted; `após prazoPlantio` → `PrazoEncerrado`; por apoiador → `NaoAutorizado`.
  - `verifica`: emite `PlantioVerificado(0, dono)`; status `Verificado`; reputação `1`; `disponivelParaSaque == 0.5` (se já sacou a 1ª) ou `1.0` (se não sacou); sacar tudo zera o saldo do contrato.
  - `verificar após prazoVerificacao` → `PrazoEncerrado`.
  - `dono cancela em Captando` (penalidade, reputação −1) e `em Plantado` antes do prazo (penalidade, reputação −1), com `saldoReembolsavel == arrecadado - sacado`.
  - `fronteiras`: com `time.setNextBlockTimestamp(prazo)` — `registrarPlantio` em `prazoPlantio` → `PrazoEncerrado` e `encerrarPorPrazo` no mesmo instante → ok; `verificarPlantio` em `prazoVerificacao` → `PrazoEncerrado` e `encerrarPorPrazo` → ok; em `prazo - 1` o inverso (abre ok, encerrar → `PrazoNaoEncerrado`).
  - `dono não cancela Financiado antes de prazoPlantio` → `PrazoNaoEncerrado`; depois → ok, reputação −1.
  - `dono não cancela Verificado/Cancelado` → `EstadoInvalido`.
  - `encerrarPorPrazo`: por `outro` em cada caso — Captando sem meta após 31 min (motivo 1, reputação 0); Financiado após 61 min (motivo 2, reputação −1); Plantado após prazoVerificacao (motivo 3, reputação 0). Antes de cada prazo → `PrazoNaoEncerrado`. Em `Verificado` → `EstadoInvalido`.
  - `reputação baixa bloqueia`: levar comunidade a −3 (dono cancela três projetos em `Captando`) → `criarProjeto` → `ReputacaoInsuficiente(-3)`; desativar e reativar a comunidade mantém −3.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** com `if / else if / else` explícitos por estado em `cancelarProjeto` e `encerrarPorPrazo` (são os exemplos de EstruturasDeControle para a apresentação).
- [ ] **Step 4: Rodar** → passa.
- [ ] **Step 5: Commit** — `feat: plantio, verificação, cancelamento e encerramento por prazo`

---

### Task 5: Reembolso, reentrância e fechamento do contrato

**Files:**
- Create: `contracts/test/AtacanteReentrancia.sol`
- Modify: `contracts/FlorestaViva.sol`, `test/FlorestaViva.test.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `valorReembolsavel(uint256 id, address apoiador) public view projetoExiste(id) returns (uint256)` — 0 se não `Cancelado` ou sem contribuição; último apoiador (`contribuicoesReembolsadas + c == arrecadado`) recebe `saldoReembolsavel - totalReembolsado`; senão `c * saldoReembolsavel / arrecadado`.
  - `pedirReembolso(uint256 id) external projetoExiste(id) noEstado(id, Status.Cancelado) semReentrada` — `c == 0` → `NadaAReembolsar`; efeitos (zera contribuição, soma `contribuicoesReembolsadas` e `totalReembolsado`) antes de `_transferir`; valor 0 não transfere mas conclui (não reverte). Emite `ReembolsoRealizado`.
  - `AtacanteReentrancia(address alvo)`: `apoiar(id)` payable repassando; `receive()` chama `pedirReembolso(id)` de novo.

- [ ] **Step 1: Testes que falham** (`describe("Reembolso")`)
  - `integral quando meta não atingida`: apoiador 0.3, encerrar por prazo → `changeEtherBalance(apoiador, +0.3)`; emite `ReembolsoRealizado(0, apoiador, 0.3)`; segundo pedido → `NadaAReembolsar`.
  - `proporcional após 1ª parcela`: financiar (0.6/0.4), sacar 0.5, encerrar após prazoPlantio → apoiador recebe 0.3, apoiador2 0.2; saldo do contrato == 0.
  - `sem resto preso`: meta 10 wei; três apoiadores 3, 3, 4 wei; comunidade saca 5; encerrar → soma dos reembolsos == 5 e `ethers.provider.getBalance(contrato) == 0`.
  - `antes de cancelado` → `EstadoInvalido`.
  - `cancelado sem apoios`: dono cancela projeto recém-criado (`arrecadado == 0`) → `pedirReembolso` → `NadaAReembolsar` (não pode dar *panic* de divisão por zero); `valorReembolsavel` → 0.
  - `reentrância bloqueada`: atacante apoia 0.3, projeto cancelado, `atacante.atacar()` → `revertedWithCustomError(contrato, "TransferenciaFalhou")`; contribuição do atacante segue 0.3 (estado revertido).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — `npx hardhat test` → **todos** os testes do arquivo passam.
- [ ] **Step 5: Auditoria de recursos e NatSpec**

Run: `grep -o "\[Recurso: [A-Za-z]*\]" contracts/FlorestaViva.sol | sort | uniq -c`
Expected: as 7 categorias aparecem, cada uma ≥ 2 vezes. Conferir à mão a tabela 6.10 da spec: `int256`, `bytes32`, `address payable`, `immutable`, `constant`, `external/public/internal/private`, `view`, `pure`, `payable`, `for`, `if/else`, `require`, array dinâmico, mapping simples, mapping aninhado, mapping→struct, struct ≥3 campos, enum, ≥2 modificadores (um com parâmetro), ≥2 eventos `indexed`, ≥2 erros com `revert`. Toda função public/external tem `@notice`.

- [ ] **Step 6: Commit** — `feat: reembolso proporcional sem resto preso e proteção contra reentrância`

---

### Task 6: ABI, ambiente local e esqueleto do frontend

**Files:**
- Create: `scripts/exportar-abi.js`, `scripts/deploy-local.js`, `dev/servidor.js`, `dev/provedor-local.js`, `.claude/launch.json`, `frontend/index.html`, `frontend/style.css`, `frontend/contrato.js`, `frontend/app.js` (só o esqueleto)

**Interfaces:**
- Consumes: artifact `artifacts/contracts/FlorestaViva.sol/FlorestaViva.json`.
- Produces:
  - `frontend/contrato.js` (desvio consciente do formato ilustrativo da spec 7.3, para o servidor dev poder sobrescrever o endereço sem redeclarar `const`) define **um** objeto global: `const CONTRATO = { endereco: "0x0000000000000000000000000000000000000000", blocoDeploy: 0, abi: [...] };`. `exportar-abi.js` regrava o arquivo preservando `endereco` e `blocoDeploy` existentes (lidos por regex).
  - `scripts/deploy-local.js` (`npx hardhat run scripts/deploy-local.js --network localhost`): implanta com `prazoVerificacaoMin = 2`, cadastra a conta #1 como comunidade "Viveiro Manacapuru", cria 1 projeto de exemplo, e escreve `dev/contrato.local.js` com `CONTRATO.endereco = "..."; CONTRATO.blocoDeploy = N;`.
  - `dev/provedor-local.js` define `window.ethereum` (EIP-1193): `request({method, params})` — `eth_requestAccounts`/`eth_accounts` → `[contaAtual]`; `eth_chainId` → `chainAtual` (começa em `"0x7a69"` para testar o aviso de rede); `wallet_switchEthereumChain` → `chainAtual = "0xaa36a7"` e emite `chainChanged`; `eth_sendTransaction` → se `window.__rejeitarProxima` lança `{ code: 4001, message: "User rejected" }`, senão repassa; demais métodos → `fetch("http://127.0.0.1:8545")` JSON-RPC. `on/removeListener`. Helper `window.__trocarConta(i)` muda `contaAtual` para `eth_accounts[i]` do nó e emite `accountsChanged`.
  - `dev/servidor.js` (Node puro, porta 5173): serve `frontend/` e `/dev/*`; no `index.html` injeta `<script src="/dev/provedor-local.js"></script>` antes de `contrato.js` e `<script src="/dev/contrato.local.js"></script>` logo depois.
  - `.claude/launch.json`: configuração `"floresta-dev"` → `node dev/servidor.js`, porta 5173.
  - `index.html`: as seções da spec 7.1, cada uma com `id` fixo: `#cabecalho` (`#btn-conectar`, `#conta`, `#saldo`, `#selo-rede`), `#aviso-rede` (`#btn-trocar-rede`), `#aviso-geral`, `#totais`, `#lista-projetos`, `#painel-comunidade`, `#meus-apoios`, `#painel-dono`, `#historico`, `#transacoes`. Scripts no fim do body, nesta ordem: web3 CDN, `contrato.js`, `app.js`.
  - `style.css`: paleta amazônica em variáveis CSS (verde floresta, verde folha, terra, creme), cards de projeto em grid responsivo (1 coluna < 640px), selos de status por cor, barra de progresso.

- [ ] **Step 1:** `npx hardhat compile && node scripts/exportar-abi.js` → `frontend/contrato.js` contém `"name": "apoiar"` e `endereco` zero.
- [ ] **Step 2:** Em background, `npx hardhat node`; depois `npx hardhat run scripts/deploy-local.js --network localhost` → `dev/contrato.local.js` criado com endereço não-zero.
- [ ] **Step 3:** `preview_start` com `floresta-dev`; `read_page` mostra todas as seções; `read_console_messages` sem erros; `typeof Web3 === "function"` via javascript_tool.
- [ ] **Step 4 (Review Focus 2):** abrir `http://localhost:5173` servido **sem** injeção (adicionar ao servidor a rota `/?sem-carteira=1` que não injeta o provedor) → página renderiza e `#btn-conectar` mostra "Instale a MetaMask" com link `https://metamask.io/download/`. (O comportamento é implementado na Task 7; aqui só a rota.)
- [ ] **Step 5: Commit** — `feat: esqueleto do frontend e ambiente local de desenvolvimento`

---

### Task 7: Conexão, rede e papéis (app.js)

**Files:**
- Modify: `frontend/app.js`

**Interfaces:**
- Consumes: `CONTRATO` (Task 6), ids do `index.html`.
- Produces (funções globais em `app.js`, usadas pelas Tasks 8–9):
  - `const estado = { web3, contrato, conta, chainId, dono, ehDono, comunidade, projetos: [], txPendente: false }`
  - `const SEPOLIA = { chainId: "0xaa36a7", nome: "Sepolia", explorer: "https://sepolia.etherscan.io", rpc: "https://ethereum-sepolia-rpc.publicnode.com" }`
  - `async conectarCarteira()`, `async verificarRede() -> boolean`, `async trocarParaSepolia()` (4902 → `wallet_addEthereumChain` com `SEPOLIA`), `async carregarPapel()` (preenche `dono`, `ehDono`, `comunidade` via `comunidades(conta)`), `async atualizarTudo()` (orquestra; Tasks 8–9 adicionam chamadas aqui), `formatarEth(wei: bigint) -> string` (4 casas, vírgula decimal), `abreviar(endereco) -> "0x12…ab"`, `mostrarAviso(texto, tipo)`.
  - Listeners `accountsChanged` (lista vazia → estado desconectado) e `chainChanged` → `atualizarTudo()` sem recarregar a página.
  - Contrato não configurado (`endereco` zero) → `mostrarAviso("Contrato não configurado…")` e sem chamadas ao contrato.
  - Web3 4 devolve `uint256` como `BigInt`: converter enum com `Number()`.

- [ ] **Step 1 (verificação no navegador, servidor dev + nó local):** página carrega com aviso de rede (chain `0x7a69`), botão "Trocar para Sepolia" visível.
- [ ] **Step 2: Implementar** as funções acima.
- [ ] **Step 3: Verificar:** clicar Conectar → `#conta` mostra `0xf39F…2266`, `#saldo` ~`10000,0000 ETH`; clicar Trocar → aviso some, `#selo-rede` "Sepolia ✓"; conta #0 é dono → `#painel-dono` visível, `#painel-comunidade` oculto; `__trocarConta(1)` → painel do dono some, painel da comunidade aparece; `__trocarConta(2)` → ambos ocultos. Rota `?sem-carteira=1` → "Instale a MetaMask". Console sem erros.
- [ ] **Step 4: Commit** — `feat: conexão com MetaMask, troca de rede e detecção de papéis`

---

### Task 8: Leitura de dados e histórico (app.js)

**Files:**
- Modify: `frontend/app.js`, `frontend/style.css` (se precisar)

**Interfaces:**
- Consumes: Task 7.
- Produces:
  - `async carregarProjetos()` → `estado.projetos` via `totalProjetos()` + `obterProjeto(i)` (`.call()`), mais `disponivelParaSaque` e `valorReembolsavel(id, conta)` por projeto.
  - `renderizarTotais()` (nº projetos, ETH arrecadado somado, mudas), `renderizarProjetos()` (card: título, local, mudas, selo de status com nomes `["Captando","Financiado","Plantado","Verificado","Cancelado"]`, barra `arrecadado/meta`, contagem regressiva do prazo do estado atual, prova abreviada; botões conforme estado e papel — os handlers chegam na Task 9), `renderizarPainelComunidade()` (reputação, formulário de criação, lista dos próprios projetos), `renderizarMeusApoios()` (`totalApoiadoPor`, contribuições > 0, reembolsáveis), `renderizarPainelDono()` (formulário cadastrar/desativar, projetos `Plantado` com Verificar/Rejeitar, cancelamento).
  - `async carregarHistorico()` → `getPastEvents("allEvents", { fromBlock: CONTRATO.blocoDeploy })`, mais recentes primeiro, cada linha com frase em português por evento (ex.: "0x70…79C8 apoiou o projeto #0 com 0,3000 ETH") e link para a tx. Erro → "Histórico indisponível" só nessa seção (Review Focus 4).
  - Contagem regressiva atualizada a cada 1 s sem recarregar dados; `atualizarTudo()` a cada 15 s (polling leve).

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar no navegador:** projeto de exemplo aparece em "Captando" com 0% e contagem regressiva; totais "1 projeto · 0,0000 ETH · 500 mudas"; histórico mostra `ComunidadeCadastrada` e `ProjetoCriado`. Forçar `CONTRATO.blocoDeploy` inválido não é necessário — simular erro com `estado.contrato.getPastEvents = () => Promise.reject(new Error("x"))` via javascript_tool e chamar `carregarHistorico()` → "Histórico indisponível", resto intacto.
- [ ] **Step 3: Commit** — `feat: leitura de projetos, painéis por papel e histórico de eventos`

---

### Task 9: Transações, status e erros (app.js)

**Files:**
- Modify: `frontend/app.js`

**Interfaces:**
- Consumes: Tasks 7–8.
- Produces:
  - `lerValorEth(texto) -> bigint` — troca vírgula por ponto, valida `/^\d+(\.\d{1,18})?$/` e > 0, senão lança `Error("Valor inválido: use, por exemplo, 0,01")` (Review Focus 1).
  - `async hashArquivo(file) -> string` — `web3.utils.keccak256` dos bytes (`new Uint8Array(await file.arrayBuffer())`), mostrado antes do envio.
  - `async enviarTransacao(metodo, { value } = {}, descricao)`:
    1. bloqueia se `estado.txPendente` ou rede errada; marca `txPendente = true` e desabilita todos os `button[data-acao]` (Review Focus 3);
    2. se `value`, confere saldo `>= value` → senão "Saldo insuficiente…";
    3. simula com `metodo.call({ from, value })` (erro → `traduzirErro` e para);
    4. `metodo.send({ from, value })` com `.on("transactionHash")` → linha em `#transacoes` "⏳ pendente" + link `${SEPOLIA.explorer}/tx/${hash}`; recibo `status` 1 → "✅ confirmada", senão "❌ falhou";
    5. `finally`: `txPendente = false`, reabilita botões, `atualizarTudo()` + `carregarHistorico()`.
  - `traduzirErro(err) -> string`:
    - código 4001 em `err.code`, `err.cause?.code` ou `err.innerError?.code` → "Você cancelou a transação na MetaMask."
    - nome do erro personalizado: procurar `errorName` em `err`, `err.cause`, `err.innerError`; se ausente, achar recursivamente o primeiro valor string `/^0x[0-9a-fA-F]{8}/` em chaves `data` do objeto de erro, casar o seletor com `web3.eth.abi.encodeFunctionSignature` de cada item `type: "error"` da ABI e decodificar os argumentos com `web3.eth.abi.decodeParameters`.
    - mensagens: `NaoAutorizado` "Esta conta não tem permissão para essa ação."; `ProjetoInexistente` "Projeto não encontrado."; `EstadoInvalido` "Ação indisponível: o projeto está em <estado atual>."; `PrazoNaoEncerrado(agora, prazo)` "O prazo ainda não terminou na blockchain: aguarde ~<prazo−agora> s." (Review Focus 5); `PrazoEncerrado` "O prazo desta etapa já terminou."; `ValorInvalido` "Informe um valor maior que zero."; `NadaASacar` "Não há valor liberado para saque agora."; `NadaAReembolsar` "Você não tem valor a reembolsar neste projeto."; `ReputacaoInsuficiente(r)` "Reputação da comunidade muito baixa (<r>) para criar projetos."; `LimiteDeProjetosAtingido(n)` "Limite de <n> projetos atingido."; `TransferenciaFalhou` "A transferência de ETH falhou."; string de `require` → mostrar a própria string; `insufficient funds` → "Saldo insuficiente para valor + gas."; fallback "Erro inesperado: <mensagem curta>".
  - Handlers ligados por `data-acao` + `data-id`: `apoiar`, `encerrar`, `reembolsar`, `sacar`, `registrar-plantio` (input file), `verificar`, `rejeitar` (motivo via `prompt` com padrão "Prova rejeitada pelo verificador"), `cancelar`, `criar-projeto` (form), `cadastrar-comunidade`, `desativar-comunidade`.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar no navegador — fluxo de sucesso** (prazos curtos; usar `evm_increaseTime` + `evm_mine` no nó via `fetch` quando precisar avançar tempo):
  - conta #2 apoia "0,6" e conta #3 apoia "0,4" no projeto de exemplo (meta do deploy-local = 1 ETH) → status "Financiado", linhas ✅ com link `https://sepolia.etherscan.io/tx/0x…`;
  - conta #1 saca → saldo sobe ~0,5; registra plantio com um arquivo qualquer → hash exibido, "Plantado";
  - conta #0 verifica → "Verificado"; conta #1 saca o restante.
- [ ] **Step 3: Verificar — erros e reembolso:**
  - "abc" e "" no apoio → mensagem de valor inválido, nenhuma tx; "0,01" aceito.
  - `window.__rejeitarProxima = true` + apoiar → "Você cancelou a transação na MetaMask."
  - criar projeto novo (conta #1, captação 1 min), apoiar 0,1 com conta #2, clicar Encerrar antes do prazo → mensagem `PrazoNaoEncerrado` com segundos; avançar tempo, Encerrar → "Cancelado"; conta #2 reembolsa → saldo volta, evento no histórico.
  - apoiar com valor maior que o saldo (ex. "20000") → "Saldo insuficiente…".
  - clicar duas vezes rápido em Apoiar → só uma linha em `#transacoes`.
- [ ] **Step 4: Commit** — `feat: envio de transações com status, tratamento de erros e ações por papel`

---

### Task 10: Documentação e roteiros

**Files:**
- Create: `README.md`, `docs/DEPLOY.md`, `docs/APRESENTACAO.md`, `docs/prints/.gitkeep`

**Interfaces:**
- Consumes: contrato final (linhas reais), frontend final.

- [ ] **Step 1: Gerar a tabela de recursos com linhas reais** — `grep -n "\[Recurso:" contracts/FlorestaViva.sol` e agrupar por categoria, citando função/linha e o porquê (texto da spec 6.10).
- [ ] **Step 2: Escrever `README.md`** com as seções obrigatórias do guia, nesta ordem: nome/tema/problema; integrantes e papéis (`<!-- PREENCHER -->` × 4 com os papéis sugeridos do guia); dados do deploy (endereço, hash, bloco, link Etherscan, todos `<!-- PREENCHER -->`); URL da Vercel (`<!-- PREENCHER -->`); diagrama de estados em Mermaid (`stateDiagram-v2`); descrição de cada função (quem chama, eventos, erros); tabela de recursos (Step 1); como rodar localmente (`npx serve frontend` ou extensão Live Server; testes com `npm install && npm test`); configurar MetaMask na Sepolia + faucet do Google Cloud; roteiro de teste do avaliador (fluxo sucesso, fluxo reembolso, erro provocado) com 3 contas; segurança (CEI, `semReentrada`, pull payment, prazos públicos que impedem ETH preso, sem `receive`); limitações (dono único verificador, prova só hash, valores devidos ficam no contrato até o titular pedir (pull payment), comunidade com endereço que rejeita ETH não consegue sacar — cadastrar só contas comuns, limite de 20 projetos no histórico, `getPastEvents` depende do RPC da MetaMask, prazo de verificação curto no deploy da demo); melhorias futuras; link do vídeo (`<!-- PREENCHER -->`); declaração de uso de IA (Claude — Anthropic: design, código do contrato, testes, frontend e documentação; equipe revisou, implantou, testou na Sepolia e é responsável pelo conteúdo).
- [ ] **Step 3: Escrever `docs/DEPLOY.md`** (passo a passo para a equipe):
  1. 3 contas na MetaMask, rede Sepolia, faucet.
  2. Remix: criar `FlorestaViva.sol`, colar; compilador `0.8.24`, optimizer **off**; Deploy com "Injected Provider – MetaMask" usando a conta Dono, argumento `prazoVerificacaoMin` = **5** (demo); anotar endereço, hash e bloco (Etherscan).
  3. Testes rápidos no Remix (cadastrar comunidade, criar projeto) + prints para `docs/prints/`.
  4. Verificar no Etherscan ("Verify and Publish": Solidity single file, v0.8.24, optimization No, MIT, argumentos do constructor ABI-encoded mostrados pelo Remix) ou plugin de verificação do Remix.
  5. Preencher `frontend/contrato.js` (`endereco`, `blocoDeploy`) — a ABI já está lá; se mudar o contrato, rodar `node scripts/exportar-abi.js`.
  6. GitHub: repositório público, cada membro com commits da sua parte.
  7. Vercel: Import do repositório, Framework "Other", **Root Directory `frontend`**, sem build command; testar a URL `https://<projeto>.vercel.app`.
  8. Preencher os `<!-- PREENCHER -->` do README.
- [ ] **Step 4: Escrever `docs/APRESENTACAO.md`** — blocos e tempos do guia (2+2+4+5+2 min) com sugestão de quem fala cada bloco por papel; roteiro da demo de 5 min passo a passo com as 3 contas (conectar, ler, apoiar com ETH, provocar `PrazoNaoEncerrado` ou valor inválido, mostrar evento no histórico e tx no Etherscan; ter um projeto já financiado/plantado preparado antes para mostrar verificação e saque); checklist da véspera (saldo nas 3 contas, vídeo plano B, projetos preparados); perguntas prováveis da arguição com respostas curtas (por que `immutable`, por que pull payment, o que é CEI, o que acontece se o dono sumir, por que só o hash da prova, como o frontend decodifica erros personalizados).
- [ ] **Step 5: Verificar:** `grep -c "PREENCHER" README.md` ≥ 4; todos os links relativos do README apontam para arquivos existentes; `npx hardhat test` ainda passa.
- [ ] **Step 6: Commit** — `docs: README, guia de deploy e roteiro da apresentação`

---

### Task 11: Deploy e publicação (equipe — passos humanos)

Não executável por agente: envolve a carteira e as contas da equipe. O executor só entrega esta lista à equipe e, quando ela devolver endereço e bloco, preenche `frontend/contrato.js` e o README.

- [ ] Equipe: faucet nas 3 contas; deploy no Remix (`docs/DEPLOY.md` passos 2–4).
- [ ] Executor: preencher `CONTRATO.endereco` e `CONTRATO.blocoDeploy` e os dados do deploy no README; commit `chore: dados do deploy na Sepolia`.
- [ ] Equipe: GitHub + Vercel (passos 6–7); executar o roteiro de teste do README pela URL da Vercel com MetaMask real (incluindo troca de rede e troca de conta).
- [ ] Equipe: vídeo de 3–5 min, prints, `docs/slides.pdf`, entrega até **16/11/2026 23h59**.
