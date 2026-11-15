// Floresta Viva - lógica do frontend (Web3.js 4.x + MetaMask).
//
// Organização do arquivo:
//   1. Constantes e estado
//   2. Utilitários (formatação, avisos)
//   3. Conexão com a carteira
//   4. Rede (Sepolia)
//   5. Papéis (dono / comunidade)
//   6. Leitura de projetos, apoios e histórico (somente leitura, .call())
//   7. Renderização (totais, cards, painéis por papel, histórico)
//   8. Orquestração da tela (atualizarTudo)
//   9. Transações, status e erros (enviarTransacao, traduzirErro, ações da tela)
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

// Estado único da aplicação: as telas leem daqui, nunca guardam cópia própria.
const estado = {
  web3: null,        // instância do Web3 (null se não há carteira instalada)
  contrato: null,    // objeto Contract do Web3 (null se o contrato não está configurado)
  conta: null,       // endereço conectado (string) ou null
  chainId: null,     // chainId atual em hexadecimal (ex.: "0xaa36a7")
  dono: null,        // endereço do dono (verificador), lido de dono()
  ehDono: false,     // a conta conectada é o dono?
  comunidade: null,  // { nome, ativa, reputacao (BigInt) } se a conta é comunidade cadastrada
  projetos: [],      // lista normalizada, preenchida por carregarProjetos()
  totalApoiado: 0n,  // totalApoiadoPor(conta): soma bruta, nunca reduzida por reembolsos
  naSepolia: false,  // a carteira está na Sepolia?
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

const contratoConfigurado = () =>
  CONTRATO.endereco && CONTRATO.endereco.toLowerCase() !== ENDERECO_ZERO;

// ---------------------------------------------------------------------------
// 3. Conexão com a carteira
// ---------------------------------------------------------------------------

// Erro -32002 da MetaMask: já existe um pop-up aberto esperando resposta.
const MSG_PEDIDO_PENDENTE = "Já existe um pedido pendente: abra a MetaMask.";

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
    else if (e && e.code === -32002) mostrarAviso(MSG_PEDIDO_PENDENTE, "erro");
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
// 6. Leitura de projetos, apoios e histórico (somente leitura: .call())
// ---------------------------------------------------------------------------

const NOMES_STATUS = ["Captando", "Financiado", "Plantado", "Verificado", "Cancelado"];
const STATUS = { CAPTANDO: 0, FINANCIADO: 1, PLANTADO: 2, VERIFICADO: 3, CANCELADO: 4 };

// Lê todos os projetos da blockchain e guarda em estado.projetos.
// Para cada projeto também lê o que a conta conectada pode sacar/reembolsar/já apoiou.
async function carregarProjetos() {
  const m = estado.contrato.methods;
  const conta = estado.conta;
  const total = Number(await m.totalProjetos().call());

  // Lê os projetos em paralelo (um Promise por projeto) para a tela carregar rápido.
  const ids = Array.from({ length: total }, (_, i) => i);
  const lista = await Promise.all(ids.map(async (i) => {
    const p = await m.obterProjeto(i).call();
    const disponivel = BigInt(await m.disponivelParaSaque(i).call());
    let reembolsavel = 0n;
    let contribuicao = 0n;
    if (conta) {
      reembolsavel = BigInt(await m.valorReembolsavel(i, conta).call());
      contribuicao = BigInt(await m.contribuicoes(i, conta).call());
    }
    // Normaliza: uint256 vira BigInt, status vira Number, o resto fica como texto.
    return {
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
      disponivel,
      reembolsavel,
      contribuicao,
    };
  }));

  estado.projetos = lista;
  // totalApoiadoPor é bruto: reembolsos NÃO o reduzem (por isso o rótulo "Total já apoiado").
  estado.totalApoiado = conta ? BigInt(await m.totalApoiadoPor(conta).call()) : 0n;
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
      return `${ator(v.comunidade)} criou o projeto #${v.id} “${esc(v.titulo)}” (meta ${formatarEth(BigInt(v.meta))} ETH)`;
    case "ApoioRecebido":
      return `${ator(v.apoiador)} apoiou o projeto #${v.id} com ${formatarEth(BigInt(v.valor))} ETH`;
    case "ProjetoFinanciado":
      return `O projeto #${v.id} atingiu a meta (${formatarEth(BigInt(v.arrecadado))} ETH) e foi financiado`;
    case "PlantioRegistrado":
      return `Plantio registrado no projeto #${v.id} (prova ${esc(abreviar(v.prova))})`;
    case "PlantioVerificado":
      return `${ator(v.verificador)} verificou o plantio do projeto #${v.id}`;
    case "ProjetoCancelado":
      return `O projeto #${v.id} foi cancelado: “${esc(v.motivo)}” (${formatarEth(BigInt(v.saldoReembolsavel))} ETH reembolsáveis)`;
    case "SaqueRealizado":
      return `${ator(v.comunidade)} sacou ${formatarEth(BigInt(v.valor))} ETH do projeto #${v.id}`;
    case "ReembolsoRealizado":
      return `${ator(v.apoiador)} recebeu reembolso de ${formatarEth(BigInt(v.valor))} ETH do projeto #${v.id}`;
    default:
      return esc(ev.event || "Evento");
  }
}

// Lê os eventos desde o bloco do deploy e mostra os mais recentes primeiro.
// Se falhar, só esta seção mostra "Histórico indisponível"; o resto da tela segue normal.
// "versao" evita que uma leitura antiga sobrescreva uma atualização mais nova.
async function carregarHistorico(versao = versaoAtualizacao) {
  const ul = $("historico");
  try {
    const eventos = await estado.contrato.getPastEvents("allEvents", {
      fromBlock: CONTRATO.blocoDeploy,
      toBlock: "latest",
    });
    if (versao !== versaoAtualizacao) return;
    eventos.sort((a, b) =>
      Number(b.blockNumber) - Number(a.blockNumber) || Number(b.logIndex) - Number(a.logIndex));
    if (!eventos.length) {
      ul.innerHTML = '<li class="vazio">Nenhum evento ainda.</li>';
      return;
    }
    ul.innerHTML = eventos.map((ev) =>
      `<li>${frase(ev)} <a href="${linkTx(ev.transactionHash)}" target="_blank" rel="noopener">ver transação ↗</a></li>`
    ).join("");
  } catch (e) {
    console.error(e);
    if (versao === versaoAtualizacao) ul.innerHTML = '<li class="vazio">Histórico indisponível</li>';
  }
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
  if (p.status === STATUS.CAPTANDO) return { ts: p.prazoCaptacao, rotulo: "Captação termina em" };
  if (p.status === STATUS.FINANCIADO) return { ts: p.prazoPlantio, rotulo: "Prazo de plantio termina em" };
  if (p.status === STATUS.PLANTADO) return { ts: p.prazoVerificacao, rotulo: "Prazo de verificação termina em" };
  return null;
}

// Mensagem quando não há o que listar (sem contrato, rede errada, sem projetos).
function mensagemVazia() {
  if (!contratoConfigurado()) return "Contrato não configurado.";
  if (!estado.web3) return "Instale a MetaMask para ver os projetos.";
  if (!estado.naSepolia) return "Conecte-se à rede Sepolia para ver os projetos.";
  return "";
}

// "1 projeto · 0,0000 ETH arrecadados · 500 mudas"
function renderizarTotais() {
  const caixa = $("totais");
  if (!estado.projetos.length) {
    caixa.textContent = "";
    return;
  }
  const n = estado.projetos.length;
  const eth = estado.projetos.reduce((soma, p) => soma + p.arrecadado, 0n);
  const mudas = estado.projetos.reduce((soma, p) => soma + p.mudas, 0n);
  caixa.textContent =
    `${n} ${n === 1 ? "projeto" : "projetos"} · ${formatarEth(eth)} ETH arrecadados · ` +
    `${Number(mudas).toLocaleString("pt-BR")} mudas`;
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
    if (estado.conta) {
      partes.push(
        `<span data-ate="${p.prazoCaptacao}">` +
        `<input type="text" inputmode="decimal" value="0,01" size="6" aria-label="Valor em ETH" data-campo="valor-${p.id}"> ETH ` +
        `<button type="button" class="btn" data-acao="apoiar" data-id="${p.id}">Apoiar</button></span>`
      );
    } else {
      partes.push(`<span class="vazio" data-ate="${p.prazoCaptacao}">Conecte a carteira para apoiar.</span>`);
    }
    partes.push(btnEncerrar);
  } else if (p.status === STATUS.FINANCIADO) {
    if (sou) {
      partes.push(
        `<label data-ate="${p.prazoPlantio}">Prova do plantio (foto/laudo) ` +
        `<input type="file" data-acao="registrar-plantio" data-id="${p.id}"></label>`
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

function htmlCard(p) {
  const pct = p.meta > 0n ? Number((p.arrecadado * 100n) / p.meta) : 0;
  const nomeStatus = NOMES_STATUS[p.status] || "?";
  const prazo = prazoAtual(p);
  const temProva = p.prova && !/^0x0+$/.test(p.prova);
  return `
    <article class="card">
      <h3>${esc(p.titulo)} <small>#${p.id}</small></h3>
      <div class="local">📍 ${esc(p.local)} · ${Number(p.mudas).toLocaleString("pt-BR")} mudas</div>
      <div><span class="selo status-${nomeStatus.toLowerCase()}">${nomeStatus}</span></div>
      <div class="barra" role="progressbar" aria-valuenow="${Math.min(pct, 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(pct, 100)}%"></span></div>
      <div>${formatarEth(p.arrecadado)} / ${formatarEth(p.meta)} ETH (${pct}%)</div>
      ${prazo ? `<div class="prazo">⏳ ${prazo.rotulo}: <span class="contagem" data-prazo="${prazo.ts}">…</span></div>` : ""}
      ${temProva ? `<div class="prova" title="${esc(p.prova)}">Prova do plantio: <code>${esc(abreviar(p.prova))}</code></div>` : ""}
      <div class="acoes">${acoesDoProjeto(p)}</div>
    </article>`;
}

function renderizarProjetos() {
  const lista = $("lista-projetos");
  const msg = mensagemVazia();
  if (msg) {
    lista.innerHTML = `<p class="vazio">${msg}</p>`;
  } else if (!estado.projetos.length) {
    lista.innerHTML = '<p class="vazio">Nenhum projeto ainda.</p>';
  } else {
    renderizarPreservando(lista, estado.projetos.map(htmlCard).join(""));
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
         <input required maxlength="80" placeholder="Título" data-campo="cp-titulo" aria-label="Título">
         <input required maxlength="80" placeholder="Local (ex.: Manacapuru - AM)" data-campo="cp-local" aria-label="Local">
         <input required type="number" min="1" step="1" placeholder="Mudas" data-campo="cp-mudas" aria-label="Quantidade de mudas">
         <input required type="text" inputmode="decimal" placeholder="Meta (ETH, ex.: 1,5)" data-campo="cp-meta" aria-label="Meta em ETH">
         <input required type="number" min="1" step="1" placeholder="Captação (min)" data-campo="cp-captacao" aria-label="Duração da captação em minutos">
         <input required type="number" min="1" step="1" placeholder="Plantio (min)" data-campo="cp-plantio" aria-label="Prazo de plantio em minutos">
         <button type="submit" class="btn">Criar projeto</button>
       </form>`
    : '<p class="aviso-inline">Sua comunidade está desativada: não pode criar novos projetos.</p>';
  const itens = meus.length
    ? meus.map((p) =>
        `<li>#${p.id} ${esc(p.titulo)} <span class="selo status-${NOMES_STATUS[p.status].toLowerCase()}">${NOMES_STATUS[p.status]}</span> · ${formatarEth(p.arrecadado)} / ${formatarEth(p.meta)} ETH</li>`
      ).join("")
    : '<li class="vazio">Você ainda não criou projetos.</li>';
  renderizarPreservando(painel, `
    <h2>Minha comunidade</h2>
    <p><strong>${esc(c.nome)}</strong> · reputação: <strong>${c.reputacao.toString()}</strong>
       ${c.ativa ? "" : "· <em>desativada</em>"}</p>
    ${form}
    <h3>Meus projetos</h3>
    <ul class="lista-simples">${itens}</ul>`);
}

// Meus apoios: total já apoiado, contribuições por projeto e reembolsos disponíveis.
function renderizarMeusApoios() {
  const painel = $("meus-apoios");
  painel.hidden = !estado.conta || !estado.naSepolia;
  if (painel.hidden) return;
  const apoios = estado.projetos.filter((p) => p.contribuicao > 0n);
  const itens = apoios.length
    ? apoios.map((p) =>
        `<li>#${p.id} ${esc(p.titulo)} — ${formatarEth(p.contribuicao)} ETH
           <span class="selo status-${NOMES_STATUS[p.status].toLowerCase()}">${NOMES_STATUS[p.status]}</span>
           ${p.reembolsavel > 0n
             ? `<button type="button" class="btn" data-acao="reembolsar" data-id="${p.id}">Reembolsar ${formatarEth(p.reembolsavel)} ETH</button>`
             : ""}</li>`
      ).join("")
    : '<li class="vazio">Você ainda não apoiou nenhum projeto.</li>';
  painel.innerHTML = `
    <h2>Meus apoios</h2>
    <p>Total já apoiado: <strong>${formatarEth(estado.totalApoiado)} ETH</strong>
       <small class="vazio">(soma bruta: não diminui quando você é reembolsado)</small></p>
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
    <li>#${p.id} ${esc(p.titulo)} · prova <code>${esc(abreviar(p.prova))}</code>
      · <span class="contagem" data-prazo="${p.prazoVerificacao}">…</span>
      <div class="acoes" data-ate="${p.prazoVerificacao}">
        <button type="button" class="btn" data-acao="verificar" data-id="${p.id}">Verificar plantio</button>
        <input placeholder="Motivo da rejeição" maxlength="120" data-campo="rej-${p.id}" aria-label="Motivo da rejeição">
        <button type="button" class="btn btn-perigo" data-acao="rejeitar" data-id="${p.id}">Rejeitar prova</button>
      </div></li>`;
  const linhaCancelavel = (p) => `
    <li ${p.status === STATUS.CAPTANDO ? `data-ate="${p.prazoCaptacao}"` : `data-apos="${p.prazoPlantio}"`}>#${p.id} ${esc(p.titulo)} <span class="selo status-${NOMES_STATUS[p.status].toLowerCase()}">${NOMES_STATUS[p.status]}</span>
      <div class="acoes">
        <input placeholder="Motivo do cancelamento" maxlength="120" data-campo="can-${p.id}" aria-label="Motivo do cancelamento">
        <button type="button" class="btn btn-perigo" data-acao="cancelar" data-id="${p.id}">Cancelar projeto</button>
      </div></li>`;

  renderizarPreservando(painel, `
    <h2>Painel do verificador</h2>
    <form class="formulario" data-acao="cadastrar-comunidade">
      <h3>Cadastrar comunidade</h3>
      <input required placeholder="Endereço 0x…" data-campo="cc-endereco" aria-label="Endereço da comunidade">
      <input required maxlength="80" placeholder="Nome da comunidade" data-campo="cc-nome" aria-label="Nome da comunidade">
      <button type="submit" class="btn">Cadastrar</button>
    </form>
    <form class="formulario" data-acao="desativar-comunidade">
      <h3>Desativar comunidade</h3>
      <input required placeholder="Endereço 0x…" data-campo="dc-endereco" aria-label="Endereço da comunidade">
      <button type="submit" class="btn btn-perigo">Desativar</button>
    </form>
    <h3>Plantios aguardando verificação</h3>
    <ul class="lista-simples">${plantados.length ? plantados.map(linhaPlantado).join("") : '<li class="vazio">Nenhum plantio aguardando.</li>'}</ul>
    <h3>Cancelamento de projetos</h3>
    <ul class="lista-simples">${cancelaveis.length ? cancelaveis.map(linhaCancelavel).join("") : '<li class="vazio">Nenhum projeto cancelável agora.</li>'}</ul>`);
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
      ? formatarDuracao(restante)
      : "prazo encerrado — pode ser encerrado por qualquer pessoa";
  });
  // Botões que só valem depois do prazo (encerrar) ou só até o prazo (apoiar, registrar prova).
  document.querySelectorAll("[data-apos]").forEach((el) => { el.hidden = t < Number(el.dataset.apos); });
  document.querySelectorAll("[data-ate]").forEach((el) => { el.hidden = t >= Number(el.dataset.ate); });
}

// ---------------------------------------------------------------------------
// 8. Orquestração da tela
// ---------------------------------------------------------------------------

const MSG_ERRO_LEITURA = "Erro ao ler dados da blockchain. Tente novamente.";

// Contador para descartar atualizações antigas se duas rodarem ao mesmo tempo
// (ex.: o usuário troca de conta e de rede em sequência).
let versaoAtualizacao = 0;

// Único ponto que reconstrói a tela a partir da carteira e da blockchain.
// Ordem: conexão -> rede -> papel -> projetos -> histórico.
async function atualizarTudo() {
  const versao = ++versaoAtualizacao;
  const obsoleta = () => versao !== versaoAtualizacao;

  // Sem carteira instalada: só o aviso.
  if (!window.ethereum) {
    estado.projetos = [];
    renderizarCabecalho(false, false);
    renderizarPaineis();
    mostrarAviso("Instale a MetaMask para usar o Floresta Viva.", "erro");
    return;
  }

  // Declaradas fora do try para o catch ainda conseguir redesenhar o cabeçalho.
  let naSepolia = false;
  let saldo = null;
  try {
    naSepolia = await verificarRede();
    if (obsoleta()) return;
    estado.naSepolia = naSepolia;

    // Saldo da conta conectada (BigInt em wei).
    if (estado.conta) {
      saldo = await estado.web3.eth.getBalance(estado.conta);
      if (obsoleta()) return;
    }

    // Contrato só é consultado na Sepolia (em outra rede ele não existe).
    estado.dono = null;
    estado.ehDono = false;
    estado.comunidade = null;
    // estado.projetos só é trocado quando a leitura nova dá certo (se falhar, a lista antiga fica).
    if (!contratoConfigurado() || !naSepolia) {
      estado.projetos = [];
      estado.totalApoiado = 0n;
    }
    // Uma leitura bem-sucedida apaga o aviso de erro antigo (inclusive em rede errada).
    if ($("aviso-geral").textContent === MSG_ERRO_LEITURA) mostrarAviso("");
    if (!contratoConfigurado()) {
      mostrarAviso("Contrato não configurado: publique o contrato e preencha o endereço em contrato.js.", "erro");
    } else if (naSepolia) {
      mostrarAviso("");
      await carregarPapel();
      if (obsoleta()) return;
      await carregarProjetos();
      if (obsoleta()) return;
    }

    renderizarCabecalho(naSepolia, true, saldo);
    renderizarPaineis();

    // O histórico tem tratamento de erro próprio: se falhar, só ele avisa.
    if (contratoConfigurado() && naSepolia) await carregarHistorico(versao);
    else $("historico").innerHTML = '<li class="vazio">Conecte-se à Sepolia para ver o histórico.</li>';
  } catch (e) {
    console.error(e);
    if (obsoleta()) return;
    mostrarAviso(MSG_ERRO_LEITURA, "erro");
    // Mesmo com erro, a tela reflete o que se sabe (conta, rede, papéis).
    renderizarCabecalho(naSepolia, true, saldo);
    renderizarPaineis();
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

// ---------------------------------------------------------------------------
// 9. Transações, status e erros
// ---------------------------------------------------------------------------
// Toda ação que ESCREVE na blockchain passa por enviarTransacao():
//   validar -> simular (call) -> enviar (send) -> acompanhar -> atualizar a tela.
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

// Escreve uma linha de status na lista "Transações". icone: ⏳ / ✅ / ❌.
function escreverLinhaTx(li, icone, texto, hash) {
  li.innerHTML =
    `${icone} ${esc(texto)}` +
    (hash ? ` <a href="${linkTx(hash)}" target="_blank" rel="noopener">${esc(abreviar(hash))} ↗</a>` : "");
}

// Erro de validação feito por nós (já está em português; não precisa de tradução).
class ErroDeUsuario extends Error {}

// Envia uma transação. "metodo" é o objeto retornado por contrato.methods.x(...).
// Devolve true se a transação foi confirmada com sucesso.
async function enviarTransacao(metodo, { value } = {}, descricao = "Transação") {
  // 1. Bloqueios: uma transação por vez e só na Sepolia.
  if (estado.txPendente) {
    mostrarAviso("Aguarde a transação anterior terminar.", "erro");
    return false;
  }
  if (!estado.conta) {
    mostrarAviso("Conecte a carteira antes de continuar.", "erro");
    return false;
  }
  if (!estado.naSepolia) {
    mostrarAviso("Você está na rede errada. Use a rede Sepolia.", "erro");
    return false;
  }
  estado.txPendente = true;
  bloquearAcoes(true);

  let sucesso = false;
  let mensagemErro = null;
  let linha = null; // <li> da transação (só existe depois que a carteira assina)
  try {
    const opcoes = { from: estado.conta };

    // 2. Se a ação envia ETH, confere o saldo antes de incomodar a carteira.
    if (value) {
      const saldo = BigInt(await estado.web3.eth.getBalance(estado.conta));
      if (saldo < value) {
        throw new ErroDeUsuario(`Saldo insuficiente: você tem ${formatarEth(saldo)} ETH e precisa de ${formatarEth(value)} ETH (mais o gas).`);
      }
      opcoes.value = value.toString();
    }

    // 3. Simulação: .call() roda a função sem gastar gas. Se ela reverteria, o erro
    //    aparece aqui, com mensagem clara, antes de abrir o pop-up da carteira.
    await metodo.call(opcoes);

    // 4. Envio real. A carteira pede confirmação; "transactionHash" chega assim que
    //    a transação é assinada e enviada (ainda não confirmada).
    mostrarAviso(`Confirme na MetaMask: ${descricao}`);
    const recibo = await metodo.send(opcoes).on("transactionHash", (hash) => {
      linha = document.createElement("li");
      escreverLinhaTx(linha, "⏳", `${descricao} — pendente`, hash);
      $("transacoes").prepend(linha);
      mostrarAviso("Transação enviada. Aguardando confirmação…");
    });

    // O recibo diz se a execução deu certo (status 1) ou reverteu (status 0).
    sucesso = Number(recibo.status) === 1;
    if (linha) escreverLinhaTx(linha, sucesso ? "✅" : "❌", `${descricao} — ${sucesso ? "confirmada" : "falhou"}`, recibo.transactionHash);
    if (!sucesso) mensagemErro = "A transação foi enviada, mas falhou na blockchain.";
  } catch (e) {
    console.error(e);
    mensagemErro = e instanceof ErroDeUsuario ? e.message : traduzirErro(e);
    if (linha) escreverLinhaTx(linha, "❌", `${descricao} — falhou`);
  } finally {
    // 5. Libera os botões e relê a blockchain (atualizarTudo também recarrega o histórico).
    estado.txPendente = false;
    bloquearAcoes(false);
    await atualizarTudo();
    // atualizarTudo limpa a faixa de avisos, então o resultado é mostrado por último.
    if (mensagemErro) mostrarAviso(mensagemErro, "erro");
    else if (sucesso) mostrarAviso(`${descricao}: confirmada.`, "sucesso");
  }
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

// Transforma qualquer erro (carteira, Web3.js, contrato) em uma frase em português.
function traduzirErro(err) {
  // Usuário clicou em "Rejeitar" na MetaMask (código EIP-1193 4001).
  if (buscarNoErro(err, (o) => (o.code === 4001 ? true : undefined))) {
    return "Você cancelou a transação na MetaMask.";
  }

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
      case "Error": return String(a[0]); // texto de um require
    }
  }

  if (/insufficient funds/i.test(mensagem)) return "Saldo insuficiente para valor + gas.";
  // Alguns nós só devolvem "execution reverted: texto" na mensagem.
  const revert = /execution reverted:?\s*([^|]+)/i.exec(mensagem);
  if (revert && revert[1].trim()) return revert[1].trim();

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

// Inteiro positivo digitado -> texto numérico, ou erro.
function lerInteiro(texto, rotulo) {
  if (!/^\d+$/.test(texto) || BigInt(texto) <= 0n) throw new Error(`${rotulo}: informe um número inteiro maior que zero.`);
  return texto;
}

const ACOES = {
  async apoiar(id) {
    const valor = lerValorEth(textoDe(`valor-${id}`)); // erro de validação: nada é enviado
    await enviarTransacao(estado.contrato.methods.apoiar(id), { value: valor },
      `Apoiar o projeto #${id} com ${formatarEth(valor)} ETH`);
  },
  async encerrar(id) {
    await enviarTransacao(estado.contrato.methods.encerrarPorPrazo(id), {}, `Encerrar o projeto #${id}`);
  },
  async reembolsar(id) {
    await enviarTransacao(estado.contrato.methods.pedirReembolso(id), {}, `Reembolso do projeto #${id}`);
  },
  async sacar(id) {
    await enviarTransacao(estado.contrato.methods.sacar(id), {}, `Saque do projeto #${id}`);
  },
  // Escolher o arquivo já dispara o envio (evento "change" do input file).
  async "registrar-plantio"(id, input) {
    const arquivo = input.files[0];
    if (!arquivo) return;
    try {
      const hash = await hashArquivo(arquivo);
      await enviarTransacao(estado.contrato.methods.registrarPlantio(id, hash), {},
        `Registrar plantio do projeto #${id} (hash da prova ${hash})`);
    } finally {
      input.value = ""; // libera a atualização automática, que pausa com arquivo escolhido
    }
  },
  async verificar(id) {
    await enviarTransacao(estado.contrato.methods.verificarPlantio(id), {}, `Verificar plantio do projeto #${id}`);
  },
  async rejeitar(id) {
    const motivo = prompt("Motivo da rejeição da prova:", textoDe(`rej-${id}`) || "Prova rejeitada pelo verificador");
    if (motivo === null) return; // clicou em Cancelar no prompt
    await enviarTransacao(estado.contrato.methods.cancelarProjeto(id, motivo.trim() || "Prova rejeitada pelo verificador"), {},
      `Rejeitar prova do projeto #${id}`);
  },
  async cancelar(id) {
    const motivo = textoDe(`can-${id}`) || "Projeto cancelado pelo verificador";
    await enviarTransacao(estado.contrato.methods.cancelarProjeto(id, motivo), {}, `Cancelar o projeto #${id}`);
  },
  async "criar-projeto"() {
    const titulo = textoDe("cp-titulo");
    const local = textoDe("cp-local");
    if (!titulo || !local) throw new Error("Preencha título e local.");
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
    mostrarAviso(e && e.message ? e.message : traduzirErro(e), "erro");
  }
}

// Delegação de eventos: UM listener no documento atende todos os botões, inclusive os
// redesenhados a cada atualização. (Ligar listener em cada botão duplicaria chamadas.)
function ligarAcoes() {
  document.addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (botao) executarAcao(botao.dataset.acao, botao.dataset.id, botao);
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
  ligarAcoes();
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

  // Sem conta autorizada, a conexão só acontece no clique em "Conectar carteira".
  await atualizarTudo();

  // Contagem regressiva a cada 1 s (só texto) e releitura leve da blockchain a cada 15 s.
  setInterval(atualizarContagens, 1000);
  setInterval(() => {
    if (!document.hidden && !usuarioEditando()) atualizarTudo();
  }, 15000);
}

iniciar();
