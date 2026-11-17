// Floresta Viva - lógica do frontend (Web3.js 4.x + MetaMask).
//
// Organização do arquivo:
//   1. Constantes e estado
//   2. Utilitários (formatação, avisos)
//   3. Conexão com a carteira
//   4. Rede (Sepolia)
//   5. Leitura rápida (nó RPC público + Multicall3, sem passar pela MetaMask)
//   6. Leitura de papéis, projetos, apoios e histórico (somente leitura)
//   7. Renderização (totais, cards, painéis por papel, histórico)
//   8. Orquestração da tela (atualizarTudo)
//   9. Transações, painel de progresso e erros (enviarTransacao, traduzirErro, ações)
//  10. Inicialização, contagem regressiva e eventos da carteira

// ---------------------------------------------------------------------------
// 1. Constantes e estado
// ---------------------------------------------------------------------------

// Rede de teste Sepolia. O chainId vai em hexadecimal, como a MetaMask espera.
const SEPOLIA = {
  chainId: "0xaa36a7",
  nome: "Sepolia",
  explorer: "https://sepolia.etherscan.io",
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
};

const ENDERECO_ZERO = "0x0000000000000000000000000000000000000000";

// Leituras (projetos, saldo, histórico) vão direto a um nó RPC público da Sepolia, sem
// passar pela MetaMask: a carteira atende um pedido por vez (cada eth_call esperava até
// ~0,5 s na fila dela). A MetaMask fica só com o que precisa dela: conta, rede e assinatura.
// Se um nó falhar, a próxima atualização usa o seguinte ("carteira" = a própria MetaMask).
// Em desenvolvimento, dev/provedor-local.js troca a lista pelo nó local do Hardhat.
const RPCS_LEITURA = window.FLORESTA_RPC_LEITURA
  ? [window.FLORESTA_RPC_LEITURA]
  : [SEPOLIA.rpc, "https://sepolia.drpc.org", "carteira"];

// Multicall3: contrato público (mesmo endereço em quase todas as redes, inclusive Sepolia)
// que executa várias leituras numa única eth_call. Sem ele (ex.: nó local do Hardhat),
// as leituras vão em paralelo, uma por chamada.
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Faucet de SepoliaETH (o mesmo indicado no README), sugerido quando o saldo está baixo.
const URL_FAUCET = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
const SALDO_BAIXO = 10n ** 16n; // 0,01 ETH

// Transação enviada e ainda sem recibo fica salva aqui: recarregar a página não a perde.
const CHAVE_TX_PENDENTE = "floresta-viva:tx-pendente";
const TITULO_PAGINA = document.title;

// Estado único da aplicação: as telas leem daqui, nunca guardam cópia própria.
const estado = {
  web3: null,        // Web3 de LEITURA (nó RPC público); existe mesmo sem carteira
  contrato: null,    // contrato ligado ao Web3 de leitura (.call() e encodeABI)
  rpcIndice: 0,      // posição do nó atual em RPCS_LEITURA
  multicall: null,   // o nó tem Multicall3? (null = ainda não testado)
  saldo: null,       // saldo da conta na Sepolia (BigInt) ou null
  chaveAtualizacao: "", // "bloco|conta|rede" da última leitura completa (pula releituras iguais)
  eventos: [],       // histórico em cache, lido aos poucos (só os blocos novos)
  blocoEventos: null, // último bloco já incluído no histórico
  nomesComunidades: {}, // cache endereço (minúsculo) -> nome da comunidade
  conta: null,       // endereço conectado (string) ou null
  chainId: null,     // chainId atual em hexadecimal (ex.: "0xaa36a7")
  dono: null,        // endereço do dono (verificador), lido de dono()
  ehDono: false,     // a conta conectada é o dono?
  comunidade: null,  // { nome, ativa, reputacao (BigInt) } se a conta é comunidade cadastrada
  projetos: [],      // lista normalizada, preenchida por carregarDados()
  totalApoiado: 0n,  // totalApoiadoPor(conta): soma bruta, nunca reduzida por reembolsos
  naSepolia: false,  // a carteira está na Sepolia?
  txPendente: false, // há uma transação aguardando confirmação?
  filtro: "todos",   // etapa escolhida nos filtros da lista de projetos ("todos" ou número do status)
};

// Atalho para buscar elementos pelo id.
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// 2. Utilitários
// ---------------------------------------------------------------------------

// Converte wei (BigInt) para texto em ETH com 4 casas e vírgula decimal.
// Usa só aritmética de BigInt para não perder precisão. Ex.: 1,5 ETH -> "1,5000".
function formatarEth(wei) {
  const UM_ETH = 10n ** 18n;
  const inteiro = wei / UM_ETH;
  const fracao = (wei % UM_ETH) / 10n ** 14n; // 4 primeiras casas
  return `${inteiro},${fracao.toString().padStart(4, "0")}`;
}

// "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" -> "0xf39F…2266"
// Endereços são mostrados em formato checksum (maiúsculas/minúsculas validam o endereço).
// Hashes (bytes32) não são endereços e só são abreviados.
function abreviar(endereco) {
  let texto = String(endereco);
  try {
    if (estado.web3 && estado.web3.utils.isAddress(texto)) {
      texto = estado.web3.utils.toChecksumAddress(texto);
    }
  } catch (e) { /* mantém o texto original */ }
  return `${texto.slice(0, 6)}…${texto.slice(-4)}`;
}

// Escapa texto vindo do contrato (título, local, nome, motivo) antes de entrar em innerHTML.
// Esses campos são digitados por usuários, então nunca podem virar HTML.
function esc(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Segundos -> "2d 03:04:05" ou "03:04:05".
function formatarDuracao(segundos) {
  const t = Math.max(0, Math.floor(segundos));
  const d = Math.floor(t / 86400);
  const h = String(Math.floor((t % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return (d > 0 ? `${d}d ` : "") + `${h}:${m}:${s}`;
}

const agora = () => Math.floor(Date.now() / 1000);
const linkTx = (hash) => `${SEPOLIA.explorer}/tx/${hash}`;

// Mostra uma mensagem na faixa de avisos. tipo: "info" (padrão), "erro" ou "sucesso".
// Texto vazio esconde a faixa.
function mostrarAviso(texto, tipo = "info") {
  const caixa = $("aviso-geral");
  if (!texto) {
    caixa.hidden = true;
    return;
  }
  caixa.className = "aviso aviso-geral" + (tipo === "info" ? "" : " " + tipo);
  caixa.textContent = texto;
  caixa.hidden = false;
}

// Link de download da MetaMask, usado nas mensagens de "carteira não instalada".
const URL_METAMASK = "https://metamask.io/download/";

// Monta "texto + link da MetaMask" sem innerHTML (textContent + <a>), então é seguro por construção.
function criarMensagemInstalar(texto) {
  const frag = document.createDocumentFragment();
  frag.append(texto + " ");
  const a = document.createElement("a");
  a.href = URL_METAMASK;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Baixar a MetaMask ↗";
  frag.append(a);
  return frag;
}

// Faixa de aviso (erro) pedindo para instalar a MetaMask, com o link.
function mostrarAvisoInstalar() {
  const caixa = $("aviso-geral");
  caixa.className = "aviso aviso-geral erro";
  caixa.replaceChildren(criarMensagemInstalar("Instale a MetaMask para usar o Floresta Viva."));
  caixa.hidden = false;
}

const contratoConfigurado = () =>
  CONTRATO.endereco && CONTRATO.endereco.toLowerCase() !== ENDERECO_ZERO;

// ---------------------------------------------------------------------------
// 3. Conexão com a carteira
// ---------------------------------------------------------------------------

// Erro -32002 da MetaMask: já existe um pop-up aberto esperando resposta.
const MSG_PEDIDO_PENDENTE = "Já existe um pedido pendente: abra a MetaMask.";

// Pede acesso às contas (abre a MetaMask). Chamada pelo botão "Conectar carteira" e,
// automaticamente, quando alguém tenta uma ação sem estar conectado. Devolve true se conectou.
async function conectarCarteira() {
  if (!window.ethereum) {
    mostrarAvisoInstalar();
    return false;
  }
  try {
    const contas = await window.ethereum.request({ method: "eth_requestAccounts" });
    estado.conta = contas[0] || null;
  } catch (e) {
    // Erro 4001 = usuário recusou no pop-up da carteira.
    if (e && e.code === 4001) mostrarAviso("Conexão recusada na carteira.", "erro");
    else if (e && e.code === -32002) mostrarAviso(MSG_PEDIDO_PENDENTE, "erro");
    else mostrarAviso("Não foi possível conectar a carteira.", "erro");
    return false;
  }
  atualizarTudo(); // sem await: quem chamou segue em frente enquanto a tela atualiza
  return !!estado.conta;
}

// ---------------------------------------------------------------------------
// 4. Rede (Sepolia)
// ---------------------------------------------------------------------------

// Lê o chainId da carteira, guarda no estado e diz se estamos na Sepolia.
async function verificarRede() {
  estado.chainId = await window.ethereum.request({ method: "eth_chainId" });
  return estado.chainId.toLowerCase() === SEPOLIA.chainId;
}

// Pede à carteira para trocar para a Sepolia; se ela não conhece a rede
// (erro 4902), pede para adicioná-la. Devolve true se a troca deu certo.
async function trocarParaSepolia() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA.chainId }],
    });
    return true;
  } catch (e) {
    // Algumas versões da MetaMask escondem o 4902 em e.data.originalError.code.
    const codigo = e && (e.code === 4902 ? 4902 : e.data?.originalError?.code);
    if (codigo === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: SEPOLIA.chainId,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [SEPOLIA.rpc],
            blockExplorerUrls: [SEPOLIA.explorer],
          }],
        });
        return true;
      } catch (e2) {
        if (e2 && e2.code === -32002) mostrarAviso(MSG_PEDIDO_PENDENTE, "erro");
        else mostrarAviso("Não foi possível adicionar a rede Sepolia.", "erro");
      }
    } else if (e && e.code === 4001) {
      mostrarAviso("Troca de rede recusada na carteira.", "erro");
    } else if (e && e.code === -32002) {
      mostrarAviso(MSG_PEDIDO_PENDENTE, "erro");
    } else {
      mostrarAviso("Não foi possível trocar para a Sepolia.", "erro");
    }
    return false;
  }
  // Em caso de sucesso a carteira também dispara "chainChanged", que atualiza a tela.
}

// ---------------------------------------------------------------------------
// 5. Leitura rápida (nó RPC público + Multicall3)
// ---------------------------------------------------------------------------

// Cria o Web3 de leitura com o nó atual da lista.
function criarLeitura() {
  const alvo = RPCS_LEITURA[estado.rpcIndice % RPCS_LEITURA.length];
  estado.web3 = new Web3(alvo === "carteira" ? window.ethereum : alvo);
  estado.contrato = contratoConfigurado()
    ? new estado.web3.eth.Contract(CONTRATO.abi, CONTRATO.endereco)
    : null;
  estado.multicall = null;
}

// Nó fora do ar ou limitando pedidos: a próxima atualização usa o seguinte da lista.
// A carteira só entra na vez dela se existir e estiver na Sepolia.
function trocarNoDeLeitura() {
  let proximo = estado.rpcIndice + 1;
  if (RPCS_LEITURA[proximo % RPCS_LEITURA.length] === "carteira" && !(window.ethereum && estado.naSepolia)) proximo++;
  estado.rpcIndice = proximo;
  criarLeitura();
}

// Pedido JSON-RPC cru ao nó de leitura (devolve só o "result").
const pedirAoNo = (method, params = []) => estado.web3.requestManager.send({ method, params });

const itemAbi = (nome) => CONTRATO.abi.find((i) => i.type === "function" && i.name === nome);

// aggregate3((address target, bool allowFailure, bytes callData)[]) do Multicall3.
const ABI_AGGREGATE3 = {
  name: "aggregate3",
  type: "function",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" },
    { name: "allowFailure", type: "bool" },
    { name: "callData", type: "bytes" },
  ] }],
  outputs: [{ name: "returnData", type: "tuple[]", components: [
    { name: "success", type: "bool" },
    { name: "returnData", type: "bytes" },
  ] }],
};

// Várias leituras do contrato de uma vez. chamadas: [["nomeDaFuncao", ...args], ...].
// Devolve os resultados na mesma ordem e no mesmo formato de .call().
// Com Multicall3 vira UMA eth_call (em lotes de 200, para não passar do limite de gas).
async function lerVarios(chamadas) {
  if (!chamadas.length) return [];
  const m = estado.contrato.methods;
  if (estado.multicall === null) {
    try { estado.multicall = (await estado.web3.eth.getCode(MULTICALL3)) !== "0x"; }
    catch (e) { estado.multicall = false; }
  }
  if (!estado.multicall) {
    return Promise.all(chamadas.map(([nome, ...args]) => m[nome](...args).call()));
  }

  const abi = estado.web3.eth.abi;
  const resultados = [];
  for (let i = 0; i < chamadas.length; i += 200) {
    const lote = chamadas.slice(i, i + 200);
    const dados = abi.encodeFunctionCall(ABI_AGGREGATE3,
      [lote.map(([nome, ...args]) => [CONTRATO.endereco, false, m[nome](...args).encodeABI()])]);
    const bruto = await estado.web3.eth.call({ to: MULTICALL3, data: dados });
    const respostas = abi.decodeParameters(ABI_AGGREGATE3.outputs, bruto)[0];
    respostas.forEach((r, j) => {
      const saidas = itemAbi(lote[j][0]).outputs;
      const d = abi.decodeParameters(saidas, r.returnData);
      resultados.push(saidas.length === 1 ? d[0] : d);
    });
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// 6. Leitura de papéis, projetos, apoios e histórico (somente leitura)
// ---------------------------------------------------------------------------

const NOMES_STATUS = ["Captando", "Financiado", "Plantado", "Verificado", "Cancelado"];
const STATUS = { CAPTANDO: 0, FINANCIADO: 1, PLANTADO: 2, VERIFICADO: 3, CANCELADO: 4 };

// Lê tudo o que a tela mostra, normalmente numa única ida ao nó (antes eram ~5 chamadas
// por projeto, enfileiradas na MetaMask). Não mexe no estado: devolve os dados para atualizarTudo().
async function carregarDados(conta) {
  const passo = conta ? 4 : 2;
  // Leituras de cada projeto: ele e o que a conta pode sacar/reembolsar/já apoiou nele.
  const doProjeto = (i) => [
    ["obterProjeto", i], ["disponivelParaSaque", i],
    ...(conta ? [["valorReembolsavel", i, conta], ["contribuicoes", i, conta]] : []),
  ];

  // Total de projetos e papel da conta (dono? comunidade?) vão JUNTO com os projetos já
  // conhecidos (projetos nunca são apagados, então os da última leitura continuam existindo).
  const conhecidos = estado.projetos.length;
  const base = [["totalProjetos"], ["dono"]];
  if (conta) base.push(["comunidades", conta], ["totalApoiadoPor", conta]);
  const chamadas = [...base];
  for (let i = 0; i < conhecidos; i++) chamadas.push(...doProjeto(i));
  const lidos = await lerVarios(chamadas);
  const [total, dono, comunidade, totalApoiado] = lidos;
  let r = lidos.slice(base.length);

  // Projetos criados desde a última leitura: mais uma ida, só para eles.
  const n = Number(total);
  if (n > conhecidos) {
    const novas = [];
    for (let i = conhecidos; i < n; i++) novas.push(...doProjeto(i));
    r = r.concat(await lerVarios(novas));
  }
  const projetos = [];
  for (let i = 0; i < n; i++) {
    const [p, disponivel, reembolsavel = 0n, contribuicao = 0n] = r.slice(i * passo, (i + 1) * passo);
    // Normaliza: uint256 vira BigInt, status vira Number, o resto fica como texto.
    projetos.push({
      id: i,
      comunidade: p.comunidade,
      titulo: p.titulo,
      local: p.local,
      mudas: BigInt(p.quantidadeMudas),
      meta: BigInt(p.meta),
      arrecadado: BigInt(p.arrecadado),
      prazoCaptacao: Number(p.prazoCaptacao),
      prazoPlantio: Number(p.prazoPlantio),
      prazoVerificacao: Number(p.prazoVerificacao),
      prova: p.provaPlantio,
      status: Number(p.status),
      disponivel: BigInt(disponivel),
      reembolsavel: BigInt(reembolsavel),
      contribuicao: BigInt(contribuicao),
    });
  }

  // 3ª ida (só quando aparece comunidade nova): nome de cada comunidade, guardado em cache.
  const faltam = [...new Set(projetos.map((p) => p.comunidade.toLowerCase()))]
    .filter((end) => !(end in estado.nomesComunidades));
  const lidas = await lerVarios(faltam.map((end) => ["comunidades", end]));
  faltam.forEach((end, i) => { estado.nomesComunidades[end] = lidas[i].nome; });
  projetos.forEach((p) => { p.nomeComunidade = estado.nomesComunidades[p.comunidade.toLowerCase()] || ""; });

  // O getter comunidades() devolve (nome, cadastrada, ativa, reputacao); reputacao é int256
  // (BigInt, pode ser negativa). totalApoiadoPor é bruto: reembolsos NÃO o reduzem.
  return {
    projetos,
    dono,
    ehDono: !!conta && dono.toLowerCase() === conta.toLowerCase(),
    comunidade: comunidade && comunidade.cadastrada
      ? { nome: comunidade.nome, ativa: comunidade.ativa, reputacao: BigInt(comunidade.reputacao) }
      : null,
    totalApoiado: conta ? BigInt(totalApoiado) : 0n,
  };
}

// Frase em português para cada evento do contrato (usada no histórico).
function frase(ev) {
  const v = ev.returnValues;
  const ator = (a) => `<strong>${esc(abreviar(a))}</strong>`;
  switch (ev.event) {
    case "ComunidadeCadastrada":
      return `${ator(v.conta)} foi cadastrada como comunidade “${esc(v.nome)}”`;
    case "ComunidadeDesativada":
      return `${ator(v.conta)} foi desativada como comunidade`;
    case "ProjetoCriado":
      return `${ator(v.comunidade)} criou o projeto nº ${v.id} “${esc(v.titulo)}” (meta ${formatarEth(BigInt(v.meta))} ETH)`;
    case "ApoioRecebido":
      return `${ator(v.apoiador)} apoiou o projeto nº ${v.id} com ${formatarEth(BigInt(v.valor))} ETH`;
    case "ProjetoFinanciado":
      return `O projeto nº ${v.id} atingiu a meta (${formatarEth(BigInt(v.arrecadado))} ETH) e foi financiado`;
    case "PlantioRegistrado":
      return `Plantio registrado no projeto nº ${v.id} (prova ${esc(abreviar(v.prova))})`;
    case "PlantioVerificado":
      return `${ator(v.verificador)} verificou o plantio do projeto nº ${v.id}`;
    case "ProjetoCancelado":
      return `O projeto nº ${v.id} foi cancelado: “${esc(v.motivo)}” (${formatarEth(BigInt(v.saldoReembolsavel))} ETH reembolsáveis)`;
    case "SaqueRealizado":
      return `${ator(v.comunidade)} sacou ${formatarEth(BigInt(v.valor))} ETH do projeto nº ${v.id}`;
    case "ReembolsoRealizado":
      return `${ator(v.apoiador)} recebeu reembolso de ${formatarEth(BigInt(v.valor))} ETH do projeto nº ${v.id}`;
    default:
      return esc(ev.event || "Evento");
  }
}

// Busca eventos num intervalo de blocos. Se o nó recusar (muitos blocos de uma vez),
// divide o intervalo ao meio e tenta de novo.
async function buscarEventos(de, ate) {
  try {
    return await estado.contrato.getPastEvents("allEvents", { fromBlock: de, toBlock: ate });
  } catch (e) {
    if (ate - de < 500) throw e;
    const meio = Math.floor((de + ate) / 2);
    return [...await buscarEventos(de, meio), ...await buscarEventos(meio + 1, ate)];
  }
}

const chaveEvento = (ev) => `${ev.transactionHash}:${ev.logIndex}`;

// Histórico incremental: a primeira leitura vai do bloco do deploy até "ateBloco"; as
// seguintes só buscam os blocos novos e juntam ao cache. Mostra os mais recentes primeiro.
// Se falhar, só esta seção mostra "Histórico indisponível"; o resto da tela segue normal.
// "versao" evita que uma leitura antiga sobrescreva uma atualização mais nova.
async function carregarHistorico(versao, ateBloco) {
  const ul = $("historico");
  try {
    const de = estado.blocoEventos === null ? CONTRATO.blocoDeploy : estado.blocoEventos + 1;
    if (de <= ateBloco) {
      const novos = await buscarEventos(de, ateBloco);
      if (versao !== versaoAtualizacao) return;
      const vistos = new Set(estado.eventos.map(chaveEvento));
      const ineditos = novos.filter((ev) => !vistos.has(chaveEvento(ev)));
      // Comunidade (re)cadastrada pode ter nome novo: esvazia o cache de nomes.
      if (ineditos.some((ev) => ev.event === "ComunidadeCadastrada")) estado.nomesComunidades = {};
      estado.eventos = ineditos.concat(estado.eventos).sort((a, b) =>
        Number(b.blockNumber) - Number(a.blockNumber) || Number(b.logIndex) - Number(a.logIndex));
      estado.blocoEventos = Math.max(estado.blocoEventos ?? 0, ateBloco);
    }
    if (versao !== versaoAtualizacao) return;
    const eventos = estado.eventos;
    if (!eventos.length) {
      ul.innerHTML = '<li class="vazio">Nenhum evento ainda.</li>';
      renderizarFaixaEventos([]);
      return;
    }
    ul.innerHTML = eventos.map((ev) =>
      `<li>${frase(ev)}. <a href="${linkTx(ev.transactionHash)}" target="_blank" rel="noopener">Ver no Etherscan</a></li>`
    ).join("");
    renderizarFaixaEventos(eventos);
  } catch (e) {
    console.error(e);
    if (versao === versaoAtualizacao) ul.innerHTML = '<li class="vazio">Histórico indisponível</li>';
  }
}

// Faixa abaixo da foto: os 4 eventos mais recentes, para mostrar que o contrato está "vivo".
function renderizarFaixaEventos(eventos, mensagem = "Nenhum evento no contrato ainda.") {
  const ul = $("eventos-recentes");
  ul.innerHTML = eventos.length
    ? eventos.slice(0, 4).map((ev) => `<li>${frase(ev)}</li>`).join("")
    : `<li>${esc(mensagem)}</li>`;
}

// ---------------------------------------------------------------------------
// 7. Renderização
// ---------------------------------------------------------------------------

// Redesenhar com innerHTML apagaria o que o usuário está digitando (a tela atualiza
// sozinha a cada 15 s). Este auxiliar guarda os campos marcados com data-campo e
// devolve os valores depois de redesenhar. (Campos de arquivo não podem ser restaurados.)
function renderizarPreservando(raiz, html) {
  const salvo = {};
  raiz.querySelectorAll("[data-campo]").forEach((el) => {
    if (el.type !== "file") salvo[el.dataset.campo] = el.value;
  });
  raiz.innerHTML = html;
  raiz.querySelectorAll("[data-campo]").forEach((el) => {
    if (el.type !== "file" && salvo[el.dataset.campo] !== undefined) el.value = salvo[el.dataset.campo];
  });
}

// Prazo (timestamp) do estado atual do projeto + rótulo, ou null se o estado é final.
function prazoAtual(p) {
  if (p.status === STATUS.CAPTANDO) return { ts: p.prazoCaptacao, rotulo: "Prazo da captação:" };
  if (p.status === STATUS.FINANCIADO) return { ts: p.prazoPlantio, rotulo: "Prazo do plantio:" };
  if (p.status === STATUS.PLANTADO) return { ts: p.prazoVerificacao, rotulo: "Prazo da verificação:" };
  return null;
}

// Mensagem quando não há o que listar (sem contrato, rede errada, sem projetos).
// (Os projetos são lidos de um nó público: aparecem mesmo sem carteira ou em outra rede.)
function mensagemVazia() {
  if (!contratoConfigurado()) return "Contrato não configurado.";
  return "";
}

// "1,9900" -> "1,99" (tira zeros à direita, deixando pelo menos 2 casas). Usado no número grande do topo.
function formatarEthCurto(wei) {
  return formatarEth(wei).replace(/0{1,2}$/, "");
}

// Painel do topo (sobre a foto): ETH apoiados, mudas, projetos e o estado da conexão.
function renderizarTotais() {
  const pulso = $("pulso");
  const msg = mensagemVazia();
  pulso.classList.toggle("ativo", !msg);
  pulso.textContent = msg ? msg : "Contrato ativo na Sepolia";

  const n = estado.projetos.length;
  const eth = estado.projetos.reduce((soma, p) => soma + p.arrecadado, 0n);
  const mudas = estado.projetos.reduce((soma, p) => soma + p.mudas, 0n);
  const temDados = n > 0;
  $("total-eth").textContent = temDados ? formatarEthCurto(eth) : "—";
  $("total-mudas").textContent = temDados ? Number(mudas).toLocaleString("pt-BR") : "—";
  $("total-projetos").textContent = temDados ? String(n) : "—";
  // Versão em frase, para leitores de tela.
  $("totais").textContent = temDados
    ? `${n} ${n === 1 ? "projeto" : "projetos"}, ${formatarEth(eth)} ETH apoiados, ${Number(mudas).toLocaleString("pt-BR")} mudas.`
    : "";
}

// Botões e campos do card conforme o estado do projeto e o papel da conta.
// Os cliques são tratados na seção 9 (data-acao + data-id, por delegação de eventos).
// Elementos com data-apos / data-ate aparecem/somem sozinhos quando o prazo passa
// (a contagem regressiva do item 9 faz isso a cada segundo, sem reler a blockchain).
function acoesDoProjeto(p) {
  const partes = [];
  const sou = estado.conta && p.comunidade.toLowerCase() === estado.conta.toLowerCase();
  const prazo = prazoAtual(p);
  const btnEncerrar = `<button type="button" class="btn btn-secundario" data-acao="encerrar" data-id="${p.id}" data-apos="${prazo ? prazo.ts : 0}">Encerrar projeto</button>`;

  if (p.status === STATUS.CAPTANDO) {
    if (window.ethereum) {
      // Mesmo sem conta conectada o campo aparece: clicar em "Apoiar" conecta a carteira
      // (e troca para a Sepolia) no caminho. Enter no campo também apoia.
      const falta = p.meta > p.arrecadado ? p.meta - p.arrecadado : 0n;
      const chip = (valor, texto = valor, titulo = `Preencher ${valor} ETH`) =>
        `<button type="button" class="chip" data-valor="${valor}" data-alvo="valor-${p.id}" title="${titulo}">${texto}</button>`;
      partes.push(
        `<div class="apoio" data-ate="${p.prazoCaptacao}">` +
        `<span class="campo-apoio">` +
        `<input type="text" inputmode="decimal" value="0,01" aria-label="Valor em ETH" data-campo="valor-${p.id}">` +
        `<span class="unidade">ETH</span>` +
        `<button type="button" class="btn" data-acao="apoiar" data-id="${p.id}">Apoiar</button></span>` +
        `<span class="valores-rapidos">` +
        ["0,01", "0,05", "0,1"].map((v) => chip(v)).join("") +
        (falta > 0n
          ? chip(estado.web3.utils.fromWei(falta, "ether").replace(".", ","), "Completar a meta",
            `Preencher o que falta para a meta (${formatarEth(falta)} ETH)`)
          : "") +
        `</span></div>`
      );
    } else {
      partes.push(`<span class="vazio" data-ate="${p.prazoCaptacao}">Instale a <a href="${URL_METAMASK}" target="_blank" rel="noopener">MetaMask</a> para apoiar.</span>`);
    }
    partes.push(btnEncerrar);
  } else if (p.status === STATUS.FINANCIADO) {
    if (sou) {
      partes.push(
        `<label class="campo-prova" data-ate="${p.prazoPlantio}">Prova do plantio (foto ou laudo)` +
        `<input type="file" data-acao="registrar-plantio" data-id="${p.id}">` +
        `<small class="ajuda">O arquivo não sai do seu computador: só o hash keccak256 vai para a blockchain. Qualquer pessoa pode recalcular o hash do mesmo arquivo para conferir.</small></label>`
      );
    }
    partes.push(btnEncerrar);
  } else if (p.status === STATUS.PLANTADO) {
    partes.push(btnEncerrar);
  }

  // Sacar: só a comunidade dona do projeto, quando há valor liberado.
  if (sou && p.disponivel > 0n) {
    partes.push(`<button type="button" class="btn" data-acao="sacar" data-id="${p.id}">Sacar ${formatarEth(p.disponivel)} ETH</button>`);
  }
  // Reembolsar: qualquer apoiador de projeto cancelado com valor a receber.
  if (p.status === STATUS.CANCELADO && p.reembolsavel > 0n) {
    partes.push(`<button type="button" class="btn" data-acao="reembolsar" data-id="${p.id}">Reembolsar ${formatarEth(p.reembolsavel)} ETH</button>`);
  }
  return partes.join("");
}

// Selo colorido com o nome da etapa (classe status-captando, status-financiado…).
function seloStatus(status) {
  const nome = NOMES_STATUS[status] || "?";
  return `<span class="selo status-${nome.toLowerCase()}">${nome}</span>`;
}

// Situação de cada parcela (50% + 50%), para mostrar embaixo da barra.
function situacaoParcelas(p) {
  if (p.status === STATUS.CANCELADO) return ["projeto cancelado", "projeto cancelado"];
  if (p.status === STATUS.CAPTANDO) return ["aguardando a meta", "aguardando a prova"];
  if (p.status === STATUS.VERIFICADO) return ["liberada", "liberada"];
  if (p.status === STATUS.PLANTADO) return ["liberada", "prova em verificação"];
  return ["liberada", "aguardando a prova"]; // Financiado
}

// Cada card mostra um recorte diferente da mesma foto da floresta (escolhido pelo número do projeto).
const RECORTES_FOTO = ["18% 22%", "62% 55%", "88% 80%", "35% 72%", "76% 18%", "50% 42%", "8% 60%", "94% 35%"];

function htmlCard(p) {
  const pct = p.meta > 0n ? Number((p.arrecadado * 100n) / p.meta) : 0;
  const [parcela1, parcela2] = situacaoParcelas(p);
  const liberada = (texto) => (texto === "liberada" ? ' class="liberada"' : "");
  const prazo = prazoAtual(p);
  const temProva = p.prova && !/^0x0+$/.test(p.prova);
  const mudas = Number(p.mudas).toLocaleString("pt-BR");
  const recorte = RECORTES_FOTO[p.id % RECORTES_FOTO.length];
  return `
    <article class="card vidro">
      <div class="card-foto" style="background-position:${recorte}">
        <span class="numero" title="Número do projeto no contrato">nº ${p.id}</span>
        ${seloStatus(p.status)}
      </div>
      <div class="card-corpo">
        <div>
          <h3>${esc(p.titulo)}</h3>
          <p class="local">${mudas} mudas em ${esc(p.local)}</p>
          ${p.nomeComunidade ? `<p class="comunidade-nome">por ${esc(p.nomeComunidade)}</p>` : ""}
        </div>
        <div>
          <div class="valores">
            <span><strong>${formatarEth(p.arrecadado)}</strong>de ${formatarEth(p.meta)} ETH</span>
            <span>${pct}%</span>
          </div>
          <!-- Linha dourada da arrecadação; o tracinho no meio marca os 50% (1ª parcela). -->
          <div class="linha-fina" role="progressbar" aria-label="Arrecadação" aria-valuenow="${Math.min(pct, 100)}" aria-valuemin="0" aria-valuemax="100">
            <span class="metade"></span><i style="width:${Math.min(pct, 100)}%"></i>
          </div>
          <div class="parcelas">
            <span${liberada(parcela1)}><b>1ª parcela</b>${parcela1}</span>
            <span${liberada(parcela2)}><b>2ª parcela</b>${parcela2}</span>
          </div>
        </div>
        ${prazo ? `<p class="prazo">${prazo.rotulo} <span class="contagem" data-prazo="${prazo.ts}">…</span></p>` : ""}
        ${temProva ? `<p class="prova" title="${esc(p.prova)}">Prova do plantio <code>${esc(abreviar(p.prova))}</code></p>` : ""}
        <div class="acoes">${acoesDoProjeto(p)}</div>
      </div>
    </article>`;
}

// Botões de filtro por etapa, com a contagem de projetos em cada uma.
function renderizarFiltros() {
  const caixa = $("filtros");
  if (!estado.projetos.length) {
    caixa.innerHTML = "";
    return;
  }
  const opcoes = [["todos", "Todos"], ...NOMES_STATUS.map((nome, i) => [String(i), nome])];
  caixa.innerHTML = opcoes.map(([valor, nome]) => {
    const qtd = valor === "todos"
      ? estado.projetos.length
      : estado.projetos.filter((p) => p.status === Number(valor)).length;
    const ativo = estado.filtro === valor;
    if (!qtd && valor !== "todos" && !ativo) return ""; // esconde etapas vazias (menos a escolhida)
    return `<button type="button" class="filtro" data-filtro="${valor}" aria-pressed="${ativo}">${nome}<span>${qtd}</span></button>`;
  }).join("");
}

function renderizarProjetos() {
  const lista = $("lista-projetos");
  const msg = mensagemVazia();
  renderizarFiltros();
  if (msg) {
    lista.innerHTML = `<p class="vazio">${msg}</p>`;
  } else if (!estado.projetos.length) {
    lista.innerHTML = '<p class="vazio">Nenhum projeto ainda. Comunidades cadastradas podem criar o primeiro.</p>';
  } else {
    const visiveis = estado.filtro === "todos"
      ? estado.projetos
      : estado.projetos.filter((p) => p.status === Number(estado.filtro));
    // Mais recentes primeiro.
    const ordenados = visiveis.slice().reverse();
    renderizarPreservando(lista, ordenados.length
      ? ordenados.map(htmlCard).join("")
      : '<p class="vazio">Nenhum projeto nesta etapa.</p>');
  }
}

// Painel da comunidade: reputação, formulário de criação e lista dos projetos próprios.
function renderizarPainelComunidade() {
  const painel = $("painel-comunidade");
  const c = estado.comunidade;
  if (!c) {
    painel.innerHTML = "<h2>Minha comunidade</h2>";
    return;
  }
  const meus = estado.projetos.filter((p) => p.comunidade.toLowerCase() === estado.conta.toLowerCase());
  const form = c.ativa
    ? `<form class="formulario" data-acao="criar-projeto">
         <h3>Criar projeto</h3>
         <label class="largo">Título<input required maxlength="80" placeholder="500 mudas de castanheira" data-campo="cp-titulo"></label>
         <label class="largo">Local<input required maxlength="80" placeholder="Manacapuru - AM" data-campo="cp-local"></label>
         <label>Mudas<input required type="number" min="1" step="1" placeholder="500" data-campo="cp-mudas"></label>
         <label>Meta em ETH<input required type="text" inputmode="decimal" placeholder="1,5" data-campo="cp-meta"></label>
         <label>Captação (min)<input required type="number" min="1" step="1" placeholder="10" data-campo="cp-captacao"></label>
         <label>Plantio (min)<input required type="number" min="1" step="1" placeholder="30" data-campo="cp-plantio"></label>
         <button type="submit" class="btn">Criar projeto</button>
       </form>`
    : '<p class="aviso-inline">Sua comunidade está desativada: não pode criar novos projetos.</p>';
  const itens = meus.length
    ? meus.map((p) =>
        `<li><span class="item-titulo">Nº ${p.id} ${esc(p.titulo)}</span> ${seloStatus(p.status)}
           <span class="item-valor">${formatarEth(p.arrecadado)} / ${formatarEth(p.meta)} ETH</span></li>`
      ).join("")
    : '<li class="vazio">Você ainda não criou projetos.</li>';
  const classeRep = c.reputacao < 0n ? "reputacao negativa" : "reputacao";
  renderizarPreservando(painel, `
    <h2>Minha comunidade</h2>
    <p class="painel-subtitulo"><strong>${esc(c.nome)}</strong>${c.ativa ? "" : ", <em>desativada</em>"}</p>
    <span class="${classeRep}">Reputação <strong>${c.reputacao.toString()}</strong></span>
    ${form}
    <h3>Meus projetos</h3>
    <ul class="lista-simples">${itens}</ul>`);
}

// Meus apoios: total já apoiado, contribuições por projeto e reembolsos disponíveis.
function renderizarMeusApoios() {
  const painel = $("meus-apoios");
  painel.hidden = !estado.conta;
  if (painel.hidden) return;
  const apoios = estado.projetos.filter((p) => p.contribuicao > 0n);
  const itens = apoios.length
    ? apoios.map((p) =>
        `<li><span class="item-titulo">Nº ${p.id} ${esc(p.titulo)}</span> ${seloStatus(p.status)}
           <span class="item-valor">${formatarEth(p.contribuicao)} ETH</span>
           ${p.reembolsavel > 0n
             ? `<button type="button" class="btn" data-acao="reembolsar" data-id="${p.id}">Reembolsar ${formatarEth(p.reembolsavel)} ETH</button>`
             : ""}</li>`
      ).join("")
    : '<li class="vazio">Você ainda não apoiou nenhum projeto. Escolha um em captação acima.</li>';
  painel.innerHTML = `
    <h2>Meus apoios</h2>
    <p class="total-apoiado"><strong>${formatarEth(estado.totalApoiado)} ETH</strong> já apoiados</p>
    <p class="painel-subtitulo"><small>Soma bruta: não diminui quando você é reembolsado.</small></p>
    <ul class="lista-simples">${itens}</ul>`;
}

// Painel do verificador (dono): cadastrar/desativar comunidades, verificar/rejeitar, cancelar.
function renderizarPainelDono() {
  const painel = $("painel-dono");
  if (!estado.ehDono) {
    painel.innerHTML = "<h2>Painel do verificador</h2>";
    return;
  }
  // Plantados: o dono verifica ou rejeita enquanto o prazo de verificação está aberto.
  const plantados = estado.projetos.filter((p) => p.status === STATUS.PLANTADO);
  // Cancelamento direto (regras do contrato): Captando só até o prazo de captação;
  // Financiado só depois do prazo de plantio. O corte de tempo é feito pela contagem
  // regressiva (data-ate / data-apos), então os botões aparecem/somem sozinhos.
  const cancelaveis = estado.projetos.filter((p) =>
    p.status === STATUS.CAPTANDO || p.status === STATUS.FINANCIADO);

  const linhaPlantado = (p) => `
    <li><span class="item-titulo">Nº ${p.id} ${esc(p.titulo)}</span>
      <span>prova <code>${esc(abreviar(p.prova))}</code></span>
      <span class="contagem" data-prazo="${p.prazoVerificacao}">…</span>
      <div class="acoes" data-ate="${p.prazoVerificacao}">
        <button type="button" class="btn" data-acao="verificar" data-id="${p.id}">Verificar plantio</button>
        <input placeholder="Motivo da rejeição" maxlength="120" data-campo="rej-${p.id}" aria-label="Motivo da rejeição">
        <button type="button" class="btn btn-perigo" data-acao="rejeitar" data-id="${p.id}">Rejeitar prova</button>
      </div></li>`;
  const linhaCancelavel = (p) => `
    <li ${p.status === STATUS.CAPTANDO ? `data-ate="${p.prazoCaptacao}"` : `data-apos="${p.prazoPlantio}"`}>
      <span class="item-titulo">Nº ${p.id} ${esc(p.titulo)}</span> ${seloStatus(p.status)}
      <div class="acoes">
        <input placeholder="Motivo do cancelamento" maxlength="120" data-campo="can-${p.id}" aria-label="Motivo do cancelamento">
        <button type="button" class="btn btn-perigo" data-acao="cancelar" data-id="${p.id}">Cancelar projeto</button>
      </div></li>`;

  renderizarPreservando(painel, `
    <h2>Painel do verificador</h2>
    <p class="painel-subtitulo">Você é o dono do contrato: cadastra comunidades e confere as provas de plantio.</p>
    <div class="dono-forms">
      <form class="formulario" data-acao="cadastrar-comunidade">
        <h3>Cadastrar comunidade</h3>
        <label class="largo">Endereço<input required placeholder="0x…" data-campo="cc-endereco"></label>
        <label class="largo">Nome<input required maxlength="80" placeholder="Viveiro Manacapuru" data-campo="cc-nome"></label>
        <button type="submit" class="btn">Cadastrar</button>
      </form>
      <form class="formulario" data-acao="desativar-comunidade">
        <h3>Desativar comunidade</h3>
        <label class="largo">Endereço<input required placeholder="0x…" data-campo="dc-endereco"></label>
        <button type="submit" class="btn btn-perigo">Desativar</button>
      </form>
    </div>
    <div class="dono-listas">
      <div>
        <h3>Plantios aguardando verificação</h3>
        <ul class="lista-simples">${plantados.length ? plantados.map(linhaPlantado).join("") : '<li class="vazio">Nenhum plantio aguardando.</li>'}</ul>
      </div>
      <div>
        <h3>Cancelamento de projetos</h3>
        <ul class="lista-simples">${cancelaveis.length ? cancelaveis.map(linhaCancelavel).join("") : '<li class="vazio">Nenhum projeto cancelável agora.</li>'}</ul>
      </div>
    </div>`);
}

// Mostra/esconde os painéis conforme o papel da conta e redesenha todo o conteúdo.
function renderizarPaineis() {
  $("painel-dono").hidden = !estado.ehDono;
  $("painel-comunidade").hidden = !estado.comunidade;
  renderizarTotais();
  renderizarProjetos();
  renderizarPainelComunidade();
  renderizarMeusApoios();
  renderizarPainelDono();
  // Os links do menu seguem a visibilidade das seções (só aparece o que a conta pode usar).
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.hidden = $(link.dataset.nav).hidden;
  });
  atualizarContagens();
  // Se há transação em andamento, os botões recém-desenhados já nascem bloqueados.
  bloquearAcoes(estado.txPendente);
}

// Contagem regressiva: roda a cada 1 s e só mexe no texto/visibilidade (não relê a blockchain).
function atualizarContagens() {
  const t = agora();
  document.querySelectorAll(".contagem").forEach((el) => {
    const restante = Number(el.dataset.prazo) - t;
    el.textContent = restante > 0
      ? `faltam ${formatarDuracao(restante)}`
      : "vencido. Qualquer pessoa pode encerrar o projeto.";
  });
  // Botões que só valem depois do prazo (encerrar) ou só até o prazo (apoiar, registrar prova).
  document.querySelectorAll("[data-apos]").forEach((el) => { el.hidden = t < Number(el.dataset.apos); });
  document.querySelectorAll("[data-ate]").forEach((el) => { el.hidden = t >= Number(el.dataset.ate); });
  // Tempo desde o envio de uma transação pendente (data-desde em milissegundos).
  document.querySelectorAll("[data-desde]").forEach((el) => {
    const s = Math.max(0, Math.floor((Date.now() - Number(el.dataset.desde)) / 1000));
    el.textContent = s < 60 ? `há ${s} s` : `há ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  });
}

// ---------------------------------------------------------------------------
// 8. Orquestração da tela
// ---------------------------------------------------------------------------

const MSG_ERRO_LEITURA = "Erro ao ler dados da blockchain. Tente novamente.";

// Contador para descartar atualizações antigas se duas rodarem ao mesmo tempo
// (ex.: o usuário troca de conta e de rede em sequência).
let versaoAtualizacao = 0;

// Único ponto que reconstrói a tela a partir da carteira e da blockchain.
// Rede da carteira e bloco atual -> (se mudou algo) papéis, projetos e saldo + histórico.
// forcar=false (atualização automática): se o bloco, a conta e a rede são os mesmos da
// última leitura, nada mudou na blockchain e a releitura é pulada (custa só 1 pedido).
async function atualizarTudo({ forcar = true } = {}) {
  const versao = ++versaoAtualizacao;
  const obsoleta = () => versao !== versaoAtualizacao;
  const temCarteira = !!window.ethereum;

  if (!contratoConfigurado()) {
    estado.projetos = [];
    mostrarAviso("Contrato não configurado: publique o contrato e preencha o endereço em contrato.js.", "erro");
    renderizarCabecalho(false, temCarteira);
    renderizarPaineis();
    return;
  }

  const conta = estado.conta;
  // Projetos e saldo. Na atualização forçada já começam junto com a consulta do bloco;
  // na automática, só depois de saber que há bloco novo.
  const lerDados = () => Promise.all([
    carregarDados(conta),
    conta ? estado.web3.eth.getBalance(conta).then(BigInt) : null,
  ]);
  let leitura = forcar ? lerDados() : null;
  leitura?.catch(() => {}); // o erro é tratado no await abaixo
  try {
    // A rede vem da carteira (resposta local, instantânea); o bloco, do nó de leitura.
    const [naSepolia, bloco] = await Promise.all([
      temCarteira ? verificarRede().catch(() => false) : false,
      estado.web3.eth.getBlockNumber().then(Number),
    ]);
    if (obsoleta()) return;
    estado.naSepolia = naSepolia;

    // Nada mudou desde a última leitura (mesmo bloco, conta e rede): não há o que reler.
    const chave = `${bloco}|${conta}|${naSepolia}`;
    if (!forcar && chave === estado.chaveAtualizacao) return;

    // Histórico em paralelo com o resto (tem tratamento de erro próprio).
    const historico = carregarHistorico(versao, bloco);
    const [dados, saldo] = await (leitura || lerDados());
    if (obsoleta()) return;
    Object.assign(estado, dados);
    estado.saldo = saldo;
    estado.chaveAtualizacao = chave;

    // Uma leitura bem-sucedida apaga SÓ o aviso de erro de leitura antigo. Os demais avisos
    // ficam na tela até a próxima ação do usuário, mesmo com a atualização automática.
    if ($("aviso-geral").textContent === MSG_ERRO_LEITURA) mostrarAviso("");
    renderizarCabecalho(naSepolia, temCarteira);
    renderizarPaineis();
    await historico;
  } catch (e) {
    console.error(e);
    if (obsoleta()) return;
    trocarNoDeLeitura(); // a próxima atualização tenta outro nó
    mostrarAviso(MSG_ERRO_LEITURA, "erro");
    // Mesmo com erro, a tela reflete o que se sabe (a lista antiga fica).
    renderizarCabecalho(estado.naSepolia, temCarteira);
    renderizarPaineis();
  }
}

// Atualiza selo de rede, conta, saldo, botão de conectar e banners de rede errada / saldo baixo.
function renderizarCabecalho(naSepolia, temCarteira) {
  const saldo = estado.saldo;
  const selo = $("selo-rede");
  if (!temCarteira) {
    selo.textContent = "Sem carteira";
    selo.className = "selo selo-neutro";
  } else if (naSepolia) {
    selo.textContent = "Sepolia ✓";
    selo.className = "selo selo-ok";
  } else {
    selo.textContent = "Rede errada";
    selo.className = "selo selo-erro";
  }

  $("conta").textContent = estado.conta ? abreviar(estado.conta) : "";
  $("saldo").textContent = estado.conta && saldo !== null ? formatarEth(saldo) + " ETH" : "";
  $("btn-conectar").hidden = !!estado.conta;
  $("btn-conectar").textContent = temCarteira ? "Conectar carteira" : "Instalar MetaMask";

  // Só avisa da rede errada para quem já conectou (os projetos aparecem em qualquer rede,
  // e as ações trocam para a Sepolia sozinhas).
  const banner = $("aviso-rede");
  banner.hidden = !temCarteira || !estado.conta || naSepolia;
  if (!banner.hidden) {
    $("aviso-rede-texto").textContent = "Sua carteira está em outra rede. As ações usam a Sepolia.";
  }
  // Saldo baixo: link para o faucet de SepoliaETH (ETH de teste, grátis).
  $("aviso-saldo").hidden = !estado.conta || saldo === null || saldo >= SALDO_BAIXO;
}

// ---------------------------------------------------------------------------
// 9. Transações, status e erros
// ---------------------------------------------------------------------------
// Toda ação que ESCREVE na blockchain passa por enviarTransacao():
//   conectar/trocar de rede se preciso -> simular (call no nó de leitura) ->
//   assinar (eth_sendTransaction direto na MetaMask) -> acompanharTransacao() -> atualizar.
// O progresso aparece no painel flutuante (canto da tela), visível de qualquer seção.
// Se algo der errado, traduzirErro() transforma o erro técnico em português.

// "0,01" ou "0.01" -> wei (BigInt). Só aceita número positivo com até 18 casas decimais.
function lerValorEth(texto) {
  const limpo = String(texto).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,18})?$/.test(limpo)) throw new Error("Valor inválido: use, por exemplo, 0,01");
  const wei = BigInt(estado.web3.utils.toWei(limpo, "ether"));
  if (wei <= 0n) throw new Error("Valor inválido: use, por exemplo, 0,01");
  return wei;
}

// keccak256 dos bytes do arquivo: é a "prova" gravada na blockchain (bytes32).
async function hashArquivo(file) {
  return estado.web3.utils.keccak256(new Uint8Array(await file.arrayBuffer()));
}

// Liga/desliga os botões de ação (evita enviar duas transações ao mesmo tempo).
function bloquearAcoes(bloquear) {
  document
    .querySelectorAll('button[data-acao], input[type="file"][data-acao], form[data-acao] button')
    .forEach((el) => { el.disabled = bloquear; });
}

// Escreve uma linha de status na lista "Transações".
// situacao: "pendente", "confirmada" ou "falhou" (vira a cor da borda via classe tx-*).
const CLASSE_TX = { pendente: "tx-pendente", confirmada: "tx-ok", falhou: "tx-erro" };
const ROTULO_TX = { pendente: "Aguardando confirmação", confirmada: "Confirmada", falhou: "Falhou" };
function escreverLinhaTx(li, situacao, texto, hash, desde = null) {
  li.className = CLASSE_TX[situacao];
  li.innerHTML =
    `<span class="tx-situacao">${ROTULO_TX[situacao]}` +
    (situacao === "pendente" && desde ? ` <span class="decorrido" data-desde="${desde}"></span>` : "") +
    `</span>` +
    esc(texto) +
    (hash ? ` <a href="${linkTx(hash)}" target="_blank" rel="noopener">${esc(abreviar(hash))}</a>` : "");
}

// ---- Painel flutuante da transação ------------------------------------------

const ETAPAS_TX = ["Verificando", "Confirme na MetaMask", "Gravando na blockchain", "Concluída"];

// Mostra o painel flutuante. etapa: índice em ETAPAS_TX (ou null para só a mensagem).
// situacao: "andamento", "ok" ou "erro". Sucesso some sozinho; erro fica até fechar.
function mostrarPainelTx({ titulo, etapa = null, situacao = "andamento", mensagem = "", hash = null, desde = null }) {
  const painel = $("painel-tx");
  clearTimeout(mostrarPainelTx.timer);
  painel.dataset.situacao = situacao;
  $("painel-tx-titulo").textContent = titulo;

  const lista = $("painel-tx-etapas");
  lista.hidden = etapa === null;
  if (etapa !== null) {
    lista.innerHTML = ETAPAS_TX.map((nome, i) => {
      let classe = "";
      if (i < etapa || (i === etapa && situacao === "ok")) classe = "feita";
      else if (i === etapa) classe = situacao === "erro" ? "erro" : "atual";
      const tempo = classe === "atual" && desde ? ` <span class="decorrido" data-desde="${desde}"></span>` : "";
      return `<li class="${classe}">${nome}${tempo}</li>`;
    }).join("");
  }

  // Mensagem com textContent e o link montado à mão: seguro por construção.
  const msg = $("painel-tx-msg");
  msg.replaceChildren();
  if (mensagem) msg.append(mensagem);
  if (hash) {
    const a = document.createElement("a");
    a.href = linkTx(hash);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Ver no Etherscan ↗";
    msg.append(mensagem ? " " : "", a);
  }
  msg.hidden = !msg.childNodes.length;
  painel.hidden = false;
  if (situacao === "ok") mostrarPainelTx.timer = setTimeout(() => { painel.hidden = true; }, 10000);
  atualizarContagens();
}

// ---- Transação pendente salva (sobrevive a recarregar a página) ------------

function salvarPendente(dados) {
  try { localStorage.setItem(CHAVE_TX_PENDENTE, JSON.stringify(dados)); } catch (e) { /* sem armazenamento */ }
}
function lerPendente() {
  try { return JSON.parse(localStorage.getItem(CHAVE_TX_PENDENTE)); } catch (e) { return null; }
}
function apagarPendente() {
  try { localStorage.removeItem(CHAVE_TX_PENDENTE); } catch (e) { /* sem armazenamento */ }
}

// ---- Envio e acompanhamento --------------------------------------------------

// Erro de validação feito por nós (já está em português; não precisa de tradução).
class ErroDeUsuario extends Error {}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Envia uma transação. "metodo" é o objeto retornado por contrato.methods.x(...).
// Devolve true se a transação foi confirmada com sucesso.
async function enviarTransacao(metodo, { value } = {}, descricao = "Transação") {
  if (estado.txPendente) {
    mostrarPainelTx({ titulo: "Uma transação por vez", situacao: "erro", mensagem: "Aguarde a transação anterior terminar." });
    return false;
  }
  estado.txPendente = true;
  bloquearAcoes(true);

  let etapa = 0;
  let hash;
  try {
    mostrarPainelTx({ titulo: descricao, etapa });

    // 1. Facilidade: sem conta conectada ou fora da Sepolia, resolve isso no caminho
    //    (abre a MetaMask para conectar / trocar de rede) em vez de só dar erro.
    if (!window.ethereum) throw new ErroDeUsuario("Instale a MetaMask para enviar transações.");
    if (!estado.conta && !(await conectarCarteira())) {
      throw new ErroDeUsuario("Conecte a carteira para continuar.");
    }
    if (!(await verificarRede())) {
      mostrarPainelTx({ titulo: descricao, etapa, mensagem: "Aceite a troca para a rede Sepolia na MetaMask." });
      if (!(await trocarParaSepolia()) || !(await verificarRede())) {
        throw new ErroDeUsuario("Esta ação precisa da rede Sepolia.");
      }
      estado.naSepolia = true;
    }

    // 2. Se a ação envia ETH, confere o saldo (o da última leitura; se parecer pouco, relê).
    const opcoes = { from: estado.conta };
    if (value) {
      let saldo = estado.saldo;
      if (saldo === null || saldo < value) saldo = BigInt(await estado.web3.eth.getBalance(estado.conta));
      if (saldo < value) {
        throw new ErroDeUsuario(`Saldo insuficiente: você tem ${formatarEth(saldo)} ETH e precisa de ${formatarEth(value)} ETH (mais o gas).`);
      }
      opcoes.value = value.toString();
    }

    // 3. Simulação no nó de leitura: .call() roda a função sem gastar gas. Se ela
    //    reverteria, o erro aparece aqui, claro, antes de abrir o pop-up da carteira.
    await metodo.call(opcoes);

    // 4. Assinatura: pedido direto à MetaMask, sem o Web3.js consultar bloco, nonce e
    //    taxas antes (a carteira calcula gas e taxas sozinha). Devolve o hash ao assinar.
    etapa = 1;
    mostrarPainelTx({ titulo: descricao, etapa, mensagem: "Abra a MetaMask e confirme a transação." });
    const tx = { from: estado.conta, to: CONTRATO.endereco, data: metodo.encodeABI() };
    if (value) tx.value = "0x" + value.toString(16);
    hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [tx] });
  } catch (e) {
    console.error(e);
    estado.txPendente = false;
    bloquearAcoes(false);
    mostrarPainelTx({
      titulo: descricao,
      etapa,
      situacao: "erro",
      mensagem: e instanceof ErroDeUsuario ? e.message : traduzirErro(e),
    });
    return false;
  }
  return acompanharTransacao({ hash, descricao, conta: estado.conta, desde: Date.now() });
}

// Recibo da transação: pergunta ao nó de leitura e à carteira ao mesmo tempo
// (vale o que responder primeiro). null = ainda não minerada.
async function buscarRecibo(hash) {
  const pedidos = [pedirAoNo("eth_getTransactionReceipt", [hash])];
  if (window.ethereum) pedidos.push(window.ethereum.request({ method: "eth_getTransactionReceipt", params: [hash] }));
  const respostas = await Promise.allSettled(pedidos);
  const achou = respostas.find((r) => r.status === "fulfilled" && r.value);
  return achou ? achou.value : null;
}

// Espera o recibo (consulta a cada 1,5 s; um bloco da Sepolia sai a cada ~12 s).
// Se a transação for acelerada ou cancelada na MetaMask, ela ganha outro hash e a
// original nunca é minerada: isso é percebido pelo nonce da conta, que passa à frente.
async function esperarRecibo(hash, conta, desde) {
  let nonce = null;
  for (let tentativa = 1; ; tentativa++) {
    const recibo = await buscarRecibo(hash);
    if (recibo) return recibo;
    if (tentativa % 8 === 0) {
      try {
        if (nonce === null) {
          const tx = window.ethereum
            ? await window.ethereum.request({ method: "eth_getTransactionByHash", params: [hash] })
            : await pedirAoNo("eth_getTransactionByHash", [hash]);
          if (tx) nonce = Number(tx.nonce);
        }
        if (nonce !== null && Number(await estado.web3.eth.getTransactionCount(conta, "latest")) > nonce) {
          return (await buscarRecibo(hash)) || { substituida: true };
        }
      } catch (e) { console.error(e); }
      // Mais de 10 minutos sem notícia: desiste de esperar (a transação segue no Etherscan).
      if (Date.now() - desde > 10 * 60 * 1000) return { semResposta: true };
    }
    await esperar(1500);
  }
}

// O recibo pode vir de um nó à frente do nó de leitura: espera este chegar ao bloco,
// senão a tela relida ainda mostraria o estado de antes da transação.
async function esperarBloco(numero) {
  for (let i = 0; i < 10; i++) {
    try { if (Number(await estado.web3.eth.getBlockNumber()) >= numero) return; } catch (e) { /* tenta de novo */ }
    await esperar(1000);
  }
}

// Acompanha uma transação já assinada até o recibo. Também é chamada ao abrir a
// página, se havia uma transação pendente salva da visita anterior.
async function acompanharTransacao({ hash, descricao, conta, desde }) {
  estado.txPendente = true;
  bloquearAcoes(true);
  document.title = `⏳ Transação pendente · ${TITULO_PAGINA}`;
  salvarPendente({ hash, descricao, conta, desde });

  const linha = document.createElement("li");
  escreverLinhaTx(linha, "pendente", descricao, hash, desde);
  $("transacoes").querySelector(".sem-tx")?.remove();
  $("transacoes").prepend(linha);
  mostrarPainelTx({ titulo: descricao, etapa: 2, hash, desde, mensagem: "Um bloco novo sai a cada ~12 s." });

  let sucesso = false;
  let final;
  try {
    const recibo = await esperarRecibo(hash, conta, desde);
    if (recibo.substituida) {
      final = { situacao: "erro", mensagem: "A transação foi substituída na MetaMask (acelerada ou cancelada). Confira o resultado na lista de projetos e no histórico." };
    } else if (recibo.semResposta) {
      final = { situacao: "erro", mensagem: "Ainda sem confirmação depois de 10 minutos. Acompanhe pelo Etherscan." };
    } else {
      sucesso = Number(recibo.status) === 1;
      await esperarBloco(Number(recibo.blockNumber));
      final = sucesso
        ? { situacao: "ok", mensagem: "Transação confirmada." }
        : { situacao: "erro", mensagem: "A transação foi enviada, mas falhou na blockchain." };
    }
  } catch (e) {
    console.error(e);
    final = { situacao: "erro", mensagem: "Não foi possível acompanhar a transação. Veja no Etherscan." };
  }

  apagarPendente();
  estado.txPendente = false;
  bloquearAcoes(false);
  document.title = TITULO_PAGINA;
  escreverLinhaTx(linha, sucesso ? "confirmada" : "falhou", descricao, hash);
  mostrarPainelTx({ titulo: descricao, etapa: sucesso ? 3 : 2, hash, ...final });
  await atualizarTudo(); // relê a blockchain (projetos, saldo, histórico)
  return sucesso;
}

// ---- Tradução de erros ----------------------------------------------------

// Percorre o erro e tudo que há dentro dele (cause, innerError, data, originalError…).
// "visitante" é chamado em cada objeto; o primeiro resultado diferente de undefined vence.
// A MetaMask e o Web3.js aninham o mesmo erro de formas diferentes, por isso a busca é recursiva.
function buscarNoErro(valor, visitante, visto = new Set(), nivel = 0) {
  if (!valor || typeof valor !== "object" || visto.has(valor) || nivel > 8) return undefined;
  visto.add(valor);
  const achado = visitante(valor);
  if (achado !== undefined) return achado;
  const chaves = new Set([...Object.keys(valor), "cause", "innerError", "originalError", "data", "error"]);
  for (const chave of chaves) {
    const r = buscarNoErro(valor[chave], visitante, visto, nivel + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

// Seletor (4 primeiros bytes do hash da assinatura) -> item "error" da ABI.
// Ex.: "ValorInvalido()" -> 0x...; é assim que o EVM identifica o erro personalizado.
function seletoresDeErro() {
  const mapa = {};
  CONTRATO.abi.filter((item) => item.type === "error").forEach((item) => {
    const assinatura = `${item.name}(${item.inputs.map((i) => i.type).join(",")})`;
    mapa[estado.web3.eth.abi.encodeFunctionSignature(assinatura).toLowerCase()] = item;
  });
  return mapa;
}

// Descobre qual erro do contrato ocorreu: { nome, args } ou null.
function identificarErroDoContrato(err) {
  // Caminho 1: o Web3.js já decodificou (errorName + errorArgs).
  const pronto = buscarNoErro(err, (o) =>
    typeof o.errorName === "string" ? { nome: o.errorName, args: o.errorArgs || {} } : undefined);
  if (pronto) return pronto;

  // Caminho 2: achar os bytes brutos do revert (0x + seletor + argumentos) e decodificar.
  const dados = buscarNoErro(err, (o) =>
    typeof o.data === "string" && /^0x[0-9a-fA-F]{8}/.test(o.data) ? o.data : undefined);
  if (!dados) return null;
  const seletor = dados.slice(0, 10).toLowerCase();
  if (seletor === "0x08c379a0") { // Error(string): é o que "require(cond, 'texto')" devolve
    const decodificado = estado.web3.eth.abi.decodeParameters(["string"], "0x" + dados.slice(10));
    return { nome: "Error", args: { 0: decodificado[0] } };
  }
  const item = seletoresDeErro()[seletor];
  if (!item) return null;
  return { nome: item.name, args: estado.web3.eth.abi.decodeParameters(item.inputs, "0x" + dados.slice(10)) };
}

// Mensagens dos require() do contrato (texto ASCII, sem acento) -> português claro.
// Texto desconhecido continua aparecendo como veio.
const MENSAGENS_REQUIRE = {
  "Reentrada bloqueada": "Operação bloqueada: uma chamada anterior ainda está em andamento.",
  "Endereco invalido": "Endereço inválido.",
  "O dono nao pode ser comunidade": "O dono do contrato não pode ser cadastrado como comunidade.",
  "Nome vazio": "Informe o nome da comunidade.",
  "Nome muito longo": "Nome muito longo: use no máximo 80 bytes (acentos contam em dobro).",
  "Comunidade nao cadastrada": "Comunidade não cadastrada.",
  "Prova invalida": "Prova inválida: escolha um arquivo com conteúdo.",
  "Quantidade de mudas invalida": "Quantidade de mudas inválida: informe um número maior que zero.",
  "Meta deve ser maior que zero": "A meta deve ser maior que zero.",
  "Duracao de captacao invalida": "Duração de captação inválida.",
  "Duracao de plantio invalida": "Duração de plantio inválida.",
};
function traduzirRequire(texto) {
  return MENSAGENS_REQUIRE[texto] || texto;
}

// Transforma qualquer erro (carteira, Web3.js, contrato) em uma frase em português.
function traduzirErro(err) {
  // Usuário clicou em "Rejeitar" na MetaMask (código EIP-1193 4001).
  if (buscarNoErro(err, (o) => (o.code === 4001 ? true : undefined))) {
    return "Você cancelou a transação na MetaMask.";
  }
  if (buscarNoErro(err, (o) => (o.code === -32002 ? true : undefined))) return MSG_PEDIDO_PENDENTE;

  // Todas as mensagens de texto do erro juntas, para procurar frases conhecidas.
  const textos = [];
  buscarNoErro(err, (o) => { if (typeof o.message === "string") textos.push(o.message); });
  if (typeof err === "string") textos.push(err);
  const mensagem = textos.join(" | ");

  // Erro personalizado do contrato.
  let erro = null;
  try { erro = identificarErroDoContrato(err); } catch (e) { console.error(e); }
  if (erro) {
    const a = erro.args;
    switch (erro.nome) {
      case "NaoAutorizado": return "Esta conta não tem permissão para essa ação.";
      case "ProjetoInexistente": return "Projeto não encontrado.";
      // Só o estado atual é informado: "esperado" não faz sentido em funções que servem a vários estados.
      case "EstadoInvalido": return `Ação indisponível: o projeto está em ${NOMES_STATUS[Number(a[1])] || "outro estado"}.`;
      case "PrazoNaoEncerrado": return `O prazo ainda não terminou na blockchain: aguarde ~${Number(BigInt(a[1]) - BigInt(a[0]))} s.`;
      case "PrazoEncerrado": return "O prazo desta etapa já terminou.";
      case "ValorInvalido": return "Informe um valor maior que zero.";
      case "NadaASacar": return "Não há valor liberado para saque agora.";
      case "NadaAReembolsar": return "Você não tem valor a reembolsar neste projeto.";
      case "ReputacaoInsuficiente": return `Reputação da comunidade muito baixa (${a[0]}) para criar projetos.`;
      case "LimiteDeProjetosAtingido": return `Limite de ${a[0]} projetos atingido.`;
      case "TransferenciaFalhou": return "A transferência de ETH falhou.";
      case "Error": return traduzirRequire(String(a[0])); // texto de um require
    }
  }

  if (/insufficient funds/i.test(mensagem)) return "Saldo insuficiente para valor + gas.";
  // Alguns nós só devolvem "execution reverted: texto" na mensagem.
  const revert = /execution reverted:?\s*([^|]+)/i.exec(mensagem);
  if (revert && revert[1].trim()) return traduzirRequire(revert[1].trim());

  const curta = (textos[0] || "sem detalhes").slice(0, 120);
  return `Erro inesperado: ${curta}`;
}

// ---- Ações ligadas aos botões e formulários ---------------------------------
// Cada ação lê os campos, valida e chama enviarTransacao. As funções recebem o id
// (data-id) e o elemento que disparou o evento. Se uma validação falhar, o erro
// lançado aqui vira aviso em executarAcao (nenhuma transação é enviada).

const campo = (nome) => document.querySelector(`[data-campo="${nome}"]`);
const textoDe = (nome) => (campo(nome) ? campo(nome).value.trim() : "");
const limparCampos = (prefixo) =>
  document.querySelectorAll(`[data-campo^="${prefixo}"]`).forEach((el) => { el.value = ""; });

// Endereço digitado -> endereço em formato checksum, ou erro.
function lerEndereco(texto) {
  if (!estado.web3.utils.isAddress(texto)) throw new Error("Endereço inválido: informe um endereço 0x… com 42 caracteres.");
  return estado.web3.utils.toChecksumAddress(texto);
}

// O contrato limita título, local e nome a 80 BYTES (não caracteres): "ç" ou "ã" ocupam 2.
function exigirAte80Bytes(texto) {
  if (new TextEncoder().encode(texto).length > 80) {
    throw new Error("Use no máximo 80 bytes (acentos contam em dobro).");
  }
}

// Inteiro positivo digitado -> texto numérico, ou erro.
function lerInteiro(texto, rotulo) {
  if (!/^\d+$/.test(texto) || BigInt(texto) <= 0n) throw new Error(`${rotulo}: informe um número inteiro maior que zero.`);
  return texto;
}

const ACOES = {
  async apoiar(id) {
    const valor = lerValorEth(textoDe(`valor-${id}`)); // erro de validação: nada é enviado
    await enviarTransacao(estado.contrato.methods.apoiar(id), { value: valor },
      `Apoiar o projeto nº ${id} com ${formatarEth(valor)} ETH`);
  },
  async encerrar(id) {
    await enviarTransacao(estado.contrato.methods.encerrarPorPrazo(id), {}, `Encerrar o projeto nº ${id}`);
  },
  async reembolsar(id) {
    await enviarTransacao(estado.contrato.methods.pedirReembolso(id), {}, `Reembolso do projeto nº ${id}`);
  },
  async sacar(id) {
    await enviarTransacao(estado.contrato.methods.sacar(id), {}, `Saque do projeto nº ${id}`);
  },
  // Escolher o arquivo já dispara o envio (evento "change" do input file).
  async "registrar-plantio"(id, input) {
    const arquivo = input.files[0];
    if (!arquivo) return;
    try {
      const hash = await hashArquivo(arquivo);
      await enviarTransacao(estado.contrato.methods.registrarPlantio(id, hash), {},
        `Registrar plantio do projeto nº ${id} (hash da prova ${hash})`);
    } finally {
      input.value = ""; // libera a atualização automática, que pausa com arquivo escolhido
    }
  },
  async verificar(id) {
    await enviarTransacao(estado.contrato.methods.verificarPlantio(id), {}, `Verificar plantio do projeto nº ${id}`);
  },
  async rejeitar(id) {
    // Sem prompt() (não funciona em navegadores de celular): usa o campo ao lado do botão.
    const motivo = textoDe(`rej-${id}`) || "Prova rejeitada pelo verificador";
    await enviarTransacao(estado.contrato.methods.cancelarProjeto(id, motivo), {},
      `Rejeitar prova do projeto nº ${id}`);
  },
  async cancelar(id) {
    const motivo = textoDe(`can-${id}`) || "Projeto cancelado pelo verificador";
    await enviarTransacao(estado.contrato.methods.cancelarProjeto(id, motivo), {}, `Cancelar o projeto nº ${id}`);
  },
  async "criar-projeto"() {
    const titulo = textoDe("cp-titulo");
    const local = textoDe("cp-local");
    if (!titulo || !local) throw new Error("Preencha título e local.");
    exigirAte80Bytes(titulo);
    exigirAte80Bytes(local);
    const mudas = lerInteiro(textoDe("cp-mudas"), "Mudas");
    const meta = lerValorEth(textoDe("cp-meta"));
    const captacao = lerInteiro(textoDe("cp-captacao"), "Captação (min)");
    const plantio = lerInteiro(textoDe("cp-plantio"), "Plantio (min)");
    const ok = await enviarTransacao(
      estado.contrato.methods.criarProjeto(titulo, local, mudas, meta.toString(), captacao, plantio), {},
      `Criar o projeto “${titulo}”`);
    if (ok) limparCampos("cp-");
  },
  async "cadastrar-comunidade"() {
    const endereco = lerEndereco(textoDe("cc-endereco"));
    const nome = textoDe("cc-nome");
    if (!nome) throw new Error("Informe o nome da comunidade.");
    exigirAte80Bytes(nome);
    const ok = await enviarTransacao(estado.contrato.methods.cadastrarComunidade(endereco, nome), {},
      `Cadastrar a comunidade “${nome}”`);
    if (ok) limparCampos("cc-");
  },
  async "desativar-comunidade"() {
    const endereco = lerEndereco(textoDe("dc-endereco"));
    const ok = await enviarTransacao(estado.contrato.methods.desativarComunidade(endereco), {},
      `Desativar a comunidade ${abreviar(endereco)}`);
    if (ok) limparCampos("dc-");
  },
};

// Executa a ação pedida. Erros de validação (lançados pelas ações) viram aviso.
async function executarAcao(nome, id, elemento) {
  const acao = ACOES[nome];
  if (!acao || estado.txPendente) return;
  try {
    await acao(id, elemento);
  } catch (e) {
    // Erro de validação: aparece no painel flutuante, perto de onde a pessoa está.
    mostrarPainelTx({ titulo: "Confira os dados", situacao: "erro", mensagem: e && e.message ? e.message : traduzirErro(e) });
  }
}

// Copia texto para a área de transferência. A API moderna pode ficar sem resposta (ex.:
// permissão pendente); depois de 1 s cai no método antigo (textarea + execCommand).
async function copiarTexto(texto) {
  try {
    if (!navigator.clipboard) throw new Error("sem API");
    await Promise.race([
      navigator.clipboard.writeText(texto),
      esperar(1000).then(() => { throw new Error("sem resposta"); }),
    ]);
    return true;
  } catch (e) {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { /* sem cópia */ }
    area.remove();
    return ok;
  }
}

// Copia o endereço da conta conectada (clique no endereço do cabeçalho).
async function copiarEndereco() {
  if (!estado.conta) return;
  const botao = $("conta");
  const ok = await copiarTexto(estado.web3.utils.toChecksumAddress(estado.conta));
  botao.textContent = ok ? "Copiado ✓" : "Não copiou";
  setTimeout(() => { botao.textContent = estado.conta ? abreviar(estado.conta) : ""; }, 1500);
}

// Delegação de eventos: UM listener no documento atende todos os botões, inclusive os
// redesenhados a cada atualização. (Ligar listener em cada botão duplicaria chamadas.)
function ligarAcoes() {
  document.addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (botao) executarAcao(botao.dataset.acao, botao.dataset.id, botao);
    // Valores rápidos (0,01 / 0,05 / 0,1 / completar a meta): só preenchem o campo.
    const chip = e.target.closest("button[data-valor]");
    if (chip && campo(chip.dataset.alvo)) {
      campo(chip.dataset.alvo).value = chip.dataset.valor;
      campo(chip.dataset.alvo).focus();
    }
    // Filtros da lista de projetos: só redesenham a lista (não leem a blockchain).
    const filtro = e.target.closest("button[data-filtro]");
    if (filtro) {
      estado.filtro = filtro.dataset.filtro;
      renderizarProjetos();
      atualizarContagens();
      bloquearAcoes(estado.txPendente);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches('input[type="file"][data-acao]')) {
      executarAcao(e.target.dataset.acao, e.target.dataset.id, e.target);
    }
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-acao]");
    if (!form) return;
    e.preventDefault(); // não recarregar a página
    executarAcao(form.dataset.acao, null, form);
  });
  // Enter no campo de valor do card apoia direto (o campo não fica dentro de um <form>).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const input = e.target.closest && e.target.closest('input[data-campo^="valor-"]');
    if (!input) return;
    e.preventDefault();
    executarAcao("apoiar", input.dataset.campo.slice("valor-".length), input);
  });
}

// ---------------------------------------------------------------------------
// 10. Inicialização, contagem regressiva e eventos da carteira
// ---------------------------------------------------------------------------

// O usuário está digitando ou escolheu um arquivo? Então a atualização automática espera.
function usuarioEditando() {
  const a = document.activeElement;
  if (a && ["INPUT", "SELECT", "TEXTAREA"].includes(a.tagName)) return true;
  return Array.from(document.querySelectorAll('input[type="file"]')).some((i) => i.files.length);
}

async function iniciar() {
  // Se o CDN do Web3.js não carregou (sem internet/bloqueio), avisa em vez de ficar em "Carregando…".
  if (typeof Web3 === "undefined") {
    mostrarAviso("Falha ao carregar a biblioteca Web3.js. Verifique sua conexão e recarregue a página.", "erro");
    return;
  }
  ligarAcoes();
  // O cabeçalho fixo ganha fundo de vidro depois que a página rola (antes fica sobre a foto).
  const marcarRolagem = () => $("cabecalho").classList.toggle("rolou", window.scrollY > 40);
  window.addEventListener("scroll", marcarRolagem, { passive: true });
  marcarRolagem();
  // Sem carteira, o botão leva ao download da MetaMask (os projetos aparecem mesmo assim).
  $("btn-conectar").addEventListener("click", () => {
    if (window.ethereum) conectarCarteira();
    else window.open(URL_METAMASK, "_blank", "noopener");
  });
  $("btn-trocar-rede").addEventListener("click", trocarParaSepolia);
  $("conta").addEventListener("click", copiarEndereco);
  $("painel-tx-fechar").addEventListener("click", () => { $("painel-tx").hidden = true; });

  // Leituras pelo nó público: funcionam com ou sem carteira.
  criarLeitura();

  if (window.ethereum) {
    // Restaura a conexão sem pop-up: eth_accounts só devolve contas se o site já foi autorizado.
    try {
      const contas = await window.ethereum.request({ method: "eth_accounts" });
      estado.conta = contas && contas.length ? contas[0] : null;
    } catch (e) {
      estado.conta = null;
    }
    // Troca de conta na carteira: lista vazia = usuário desconectou.
    window.ethereum.on("accountsChanged", (contas) => {
      estado.conta = contas.length ? contas[0] : null;
      atualizarTudo();
    });
    // Troca de rede: atualiza sem recarregar a página.
    window.ethereum.on("chainChanged", () => atualizarTudo());
  }

  await atualizarTudo();

  // Transação que estava pendente quando a página foi fechada/recarregada: volta a acompanhar.
  const pendente = lerPendente();
  if (pendente && pendente.hash) acompanharTransacao(pendente);

  // Contagem regressiva a cada 1 s (só texto). A cada 6 s pergunta o bloco atual ao nó
  // e só relê tudo quando há bloco novo (ou mudou conta/rede). Ao voltar para a aba, na hora.
  setInterval(atualizarContagens, 1000);
  const atualizarSeVisivel = () => {
    if (!document.hidden && !usuarioEditando()) atualizarTudo({ forcar: false });
  };
  setInterval(atualizarSeVisivel, 6000);
  document.addEventListener("visibilitychange", atualizarSeVisivel);
}

iniciar();
