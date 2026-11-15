// Provedor EIP-1193 falso para testar o frontend sem MetaMask (apenas desenvolvimento).
// Usa as contas desbloqueadas do no do Hardhat; nenhuma chave privada aqui.
(function () {
  const RPC = "http://127.0.0.1:8545";
  let contas = [];
  let indice = 0;
  let contaAtual = null;
  let chainAtual = "0x7a69"; // rede "errada" de proposito, para testar o aviso
  const ouvintes = {};

  async function rpc(method, params) {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || [] }),
    });
    const j = await r.json();
    if (j.error) {
      const e = new Error(j.error.message);
      e.code = j.error.code;
      e.data = j.error.data;
      throw e;
    }
    return j.result;
  }

  async function carregarContas() {
    if (!contas.length) {
      contas = await rpc("eth_accounts");
      contaAtual = contas[indice];
    }
  }

  function emitir(evento, dado) {
    (ouvintes[evento] || []).slice().forEach((fn) => fn(dado));
  }

  window.ethereum = {
    isMetaMask: true,
    async request({ method, params }) {
      await carregarContas();
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [contaAtual];
        case "eth_chainId":
          return chainAtual;
        case "wallet_switchEthereumChain":
          chainAtual = "0xaa36a7";
          emitir("chainChanged", chainAtual);
          return null;
        case "eth_sendTransaction":
          if (window.__rejeitarProxima) {
            window.__rejeitarProxima = false;
            throw { code: 4001, message: "User rejected" };
          }
          return rpc(method, params);
        default:
          return rpc(method, params);
      }
    },
    on(evento, fn) {
      (ouvintes[evento] = ouvintes[evento] || []).push(fn);
    },
    removeListener(evento, fn) {
      ouvintes[evento] = (ouvintes[evento] || []).filter((f) => f !== fn);
    },
  };

  window.__trocarConta = async function (i) {
    await carregarContas();
    indice = i;
    contaAtual = contas[i];
    emitir("accountsChanged", [contaAtual]);
  };
})();
