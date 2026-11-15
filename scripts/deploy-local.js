// Deploy no no local (npx hardhat node) para desenvolvimento do frontend.
// Uso: npx hardhat run scripts/deploy-local.js --network localhost
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [dono, comunidade] = await ethers.getSigners();

  const Fabrica = await ethers.getContractFactory("FlorestaViva");
  const contrato = await Fabrica.deploy(2); // prazoVerificacaoMin = 2
  await contrato.waitForDeployment();
  const endereco = await contrato.getAddress();
  const recibo = await contrato.deploymentTransaction().wait();
  const bloco = recibo.blockNumber;

  await (await contrato.cadastrarComunidade(comunidade.address, "Viveiro Manacapuru")).wait();
  await (
    await contrato
      .connect(comunidade)
      .criarProjeto("Castanheiras Manacapuru", "Manacapuru - AM", 500, ethers.parseEther("1"), 30, 60)
  ).wait();

  const saida = path.join(__dirname, "..", "dev", "contrato.local.js");
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(
    saida,
    `CONTRATO.endereco = "${endereco}";\nCONTRATO.blocoDeploy = ${bloco};\n`
  );
  console.log("Contrato:", endereco, "bloco:", bloco, "dono:", dono.address, "comunidade:", comunidade.address);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
