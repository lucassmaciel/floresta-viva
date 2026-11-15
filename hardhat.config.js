require("@nomicfoundation/hardhat-toolbox");

/** Configuração do Hardhat (usado apenas como auxílio para testes locais). */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: false } },
  },
  networks: { hardhat: { chainId: 11155111 } },
};
