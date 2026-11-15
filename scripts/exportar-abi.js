// Gera frontend/contrato.js a partir do artefato compilado, preservando
// o endereco e o bloco de deploy ja gravados no arquivo (se existirem).
const fs = require("fs");
const path = require("path");

const artefato = path.join(__dirname, "..", "artifacts", "contracts", "FlorestaViva.sol", "FlorestaViva.json");
const destino = path.join(__dirname, "..", "frontend", "contrato.js");

if (!fs.existsSync(artefato)) {
  console.error("Artefato nao encontrado. Rode 'npx hardhat compile' antes.");
  process.exit(1);
}
const { abi } = JSON.parse(fs.readFileSync(artefato, "utf8"));

let endereco = "0x0000000000000000000000000000000000000000";
let blocoDeploy = 0;
if (fs.existsSync(destino)) {
  const atual = fs.readFileSync(destino, "utf8");
  const e = atual.match(/endereco:\s*"(0x[0-9a-fA-F]{40})"/);
  const b = atual.match(/blocoDeploy:\s*(\d+)/);
  if (e) endereco = e[1];
  if (b) blocoDeploy = Number(b[1]);
}

const conteudo =
  "// Gerado por scripts/exportar-abi.js. Preencha endereco e blocoDeploy apos o deploy.\n" +
  "const CONTRATO = {\n" +
  `  endereco: "${endereco}",\n` +
  `  blocoDeploy: ${blocoDeploy},\n` +
  `  abi: ${JSON.stringify(abi, null, 2).replace(/\n/g, "\n  ")},\n` +
  "};\n";
fs.writeFileSync(destino, conteudo);
console.log(`frontend/contrato.js gravado (${abi.length} itens de ABI).`);
