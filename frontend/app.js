// Floresta Viva - lógica do frontend (Web3.js 4.x + MetaMask).
//
// Organização do arquivo:
//   1. Constantes e estado
//   2. Utilitários (formatação, avisos)
//   3. Conexão com a carteira
//   4. Rede (Sepolia)
//   5. Papéis (dono / comunidade)
//   6. Orquestração da tela (atualizarTudo)
//   7. Inicialização e eventos da carteira

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

// Estado único da aplicação: as telas leem daqui, nunca guardam cópia própria.
const estado = {
  web3: null,        // instância do Web3 (null se não há carteira instalada)
  contrato: null,    // objeto Contract do Web3 (null se o contrato não está configurado)
  conta: null,       // endereço conectado (string) ou null
  chainId: null,     // chainId atual em hexadecimal (ex.: "0xaa36a7")
  dono: null,        // endereço do dono (verificador), lido de dono()
  ehDono: false,     // a conta conectada é o dono?
  comunidade: null,  // { nome, ativa, reputacao (BigInt) } se a conta é comunidade cadastrada
  projetos: [],      // preenchido na tarefa de projetos
  txPendente: false, // há uma transação aguardando confirmação?
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
function abreviar(endereco) {
  return `${endereco.slice(0, 6)}…${endereco.slice(-4)}`;
}

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

const contratoConfigurado = () =>
  CONTRATO.endereco && CONTRATO.endereco.toLowerCase() !== ENDERECO_ZERO;

// ---------------------------------------------------------------------------
// 3. Conexão com a carteira
// ---------------------------------------------------------------------------

// Pede acesso às contas (abre a MetaMask). Chamada pelo botão "Conectar carteira".
async function conectarCarteira() {
  if (!window.ethereum) {
    mostrarAviso("Instale a MetaMask para usar o Floresta Viva.", "erro");
    return;
  }
  try {
    const contas = await window.ethereum.request({ method: "eth_requestAccounts" });
    estado.conta = contas[0] || null;
  } catch (e) {
    // Erro 4001 = usuário recusou no pop-up da carteira.
    if (e && e.code === 4001) mostrarAviso("Conexão recusada na carteira.", "erro");
    else mostrarAviso("Não foi possível conectar a carteira.", "erro");
    return;
  }
  await atualizarTudo();
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
// (erro 4902), pede para adicioná-la.
async function trocarParaSepolia() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA.chainId }],
    });
  } catch (e) {
    if (e && e.code === 4902) {
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
      } catch (e2) {
        mostrarAviso("Não foi possível adicionar a rede Sepolia.", "erro");
      }
    } else if (e && e.code === 4001) {
      mostrarAviso("Troca de rede recusada na carteira.", "erro");
    } else {
      mostrarAviso("Não foi possível trocar para a Sepolia.", "erro");
    }
  }
  // Em caso de sucesso a carteira dispara "chainChanged", que atualiza a tela.
}

// ---------------------------------------------------------------------------
// 5. Papéis (dono / comunidade)
// ---------------------------------------------------------------------------

// Descobre quem é a conta conectada: dono (verificador), comunidade ou apoiador.
async function carregarPapel() {
  estado.dono = null;
  estado.ehDono = false;
  estado.comunidade = null;
  if (!estado.contrato || !estado.conta) return;

  estado.dono = await estado.contrato.methods.dono().call();
  estado.ehDono = estado.dono.toLowerCase() === estado.conta.toLowerCase();

  // O getter público devolve (nome, cadastrada, ativa, reputacao).
  // reputacao é int256: chega como BigInt e pode ser negativa.
  const c = await estado.contrato.methods.comunidades(estado.conta).call();
  if (c.cadastrada) {
    estado.comunidade = { nome: c.nome, ativa: c.ativa, reputacao: BigInt(c.reputacao) };
  }
}

// ---------------------------------------------------------------------------
// 6. Orquestração da tela
// ---------------------------------------------------------------------------

// Contador para descartar atualizações antigas se duas rodarem ao mesmo tempo
// (ex.: o usuário troca de conta e de rede em sequência).
let versaoAtualizacao = 0;

// Único ponto que reconstrói a tela a partir da carteira e da blockchain.
// Ordem: conexão -> rede -> papel -> (tarefas seguintes: projetos, histórico).
async function atualizarTudo() {
  const versao = ++versaoAtualizacao;
  const obsoleta = () => versao !== versaoAtualizacao;

  // Sem carteira instalada: só o aviso.
  if (!window.ethereum) {
    renderizarCabecalho(false, false);
    renderizarPaineis();
    mostrarAviso("Instale a MetaMask para usar o Floresta Viva.", "erro");
    return;
  }

  try {
    const naSepolia = await verificarRede();
    if (obsoleta()) return;

    // Saldo da conta conectada (BigInt em wei).
    let saldo = null;
    if (estado.conta) {
      saldo = await estado.web3.eth.getBalance(estado.conta);
      if (obsoleta()) return;
    }

    // Contrato só é consultado na Sepolia (em outra rede ele não existe).
    estado.dono = null;
    estado.ehDono = false;
    estado.comunidade = null;
    if (!contratoConfigurado()) {
      mostrarAviso("Contrato não configurado: publique o contrato e preencha o endereço em contrato.js.", "erro");
    } else if (naSepolia) {
      mostrarAviso("");
      await carregarPapel();
      if (obsoleta()) return;
      // Tarefas 8 e 9 adicionam aqui: carregar projetos, apoios e histórico.
    }

    renderizarCabecalho(naSepolia, true, saldo);
    renderizarPaineis();
  } catch (e) {
    console.error(e);
    mostrarAviso("Erro ao ler dados da blockchain. Tente novamente.", "erro");
  }
}

// Atualiza selo de rede, conta, saldo, botão de conectar e banner de rede errada.
function renderizarCabecalho(naSepolia, temCarteira, saldo) {
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
  $("saldo").textContent = estado.conta && saldo !== null && saldo !== undefined ? formatarEth(saldo) + " ETH" : "";
  $("btn-conectar").hidden = !!estado.conta;

  const banner = $("aviso-rede");
  banner.hidden = !temCarteira || naSepolia;
  if (!banner.hidden) {
    $("aviso-rede-texto").textContent = "Você está na rede errada. Use a rede Sepolia.";
  }
}

// Mostra/esconde os painéis conforme o papel da conta.
function renderizarPaineis() {
  $("painel-dono").hidden = !estado.ehDono;
  $("painel-comunidade").hidden = !estado.comunidade;
}

// ---------------------------------------------------------------------------
// 7. Inicialização e eventos da carteira
// ---------------------------------------------------------------------------

async function iniciar() {
  $("btn-conectar").addEventListener("click", conectarCarteira);
  $("btn-trocar-rede").addEventListener("click", trocarParaSepolia);

  if (!window.ethereum) {
    await atualizarTudo(); // mostra "Instale a MetaMask"
    return;
  }

  estado.web3 = new Web3(window.ethereum);
  if (contratoConfigurado()) {
    estado.contrato = new estado.web3.eth.Contract(CONTRATO.abi, CONTRATO.endereco);
  }

  // Troca de conta na carteira: lista vazia = usuário desconectou.
  window.ethereum.on("accountsChanged", (contas) => {
    estado.conta = contas.length ? contas[0] : null;
    atualizarTudo();
  });
  // Troca de rede: atualiza sem recarregar a página.
  window.ethereum.on("chainChanged", () => atualizarTudo());

  // A conexão só acontece quando o usuário clica em "Conectar carteira".
  await atualizarTudo();
}

iniciar();
