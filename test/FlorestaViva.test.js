const { expect } = require("chai");
const { ethers } = require("hardhat");

// Implanta o contrato com prazo de verificação de 10 minutos e devolve as contas de teste.
async function implantar() {
  const [dono, comunidade, apoiador, apoiador2, outro] = await ethers.getSigners();
  const Fabrica = await ethers.getContractFactory("FlorestaViva");
  const contrato = await Fabrica.deploy(10);
  await contrato.waitForDeployment();
  return { contrato, dono, comunidade, apoiador, apoiador2, outro };
}

describe("Comunidades", function () {
  it("constructor define dono e prazo de verificação", async function () {
    const { contrato, dono } = await implantar();
    expect(await contrato.dono()).to.equal(dono.address);
    expect(await contrato.prazoVerificacaoSeg()).to.equal(600n);
  });

  it("constructor rejeita prazo zero e acima do máximo", async function () {
    const Fabrica = await ethers.getContractFactory("FlorestaViva");
    await expect(Fabrica.deploy(0)).to.be.reverted;
    await expect(Fabrica.deploy(525601)).to.be.reverted;
  });

  it("cadastra comunidade", async function () {
    const { contrato, comunidade } = await implantar();
    await expect(contrato.cadastrarComunidade(comunidade.address, "Viveiro Manacapuru"))
      .to.emit(contrato, "ComunidadeCadastrada")
      .withArgs(comunidade.address, "Viveiro Manacapuru");
    const c = await contrato.comunidades(comunidade.address);
    expect(c.nome).to.equal("Viveiro Manacapuru");
    expect(c.cadastrada).to.equal(true);
    expect(c.ativa).to.equal(true);
    expect(c.reputacao).to.equal(0n);
  });

  it("só o dono cadastra", async function () {
    const { contrato, comunidade, outro } = await implantar();
    await expect(contrato.connect(outro).cadastrarComunidade(comunidade.address, "X"))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado")
      .withArgs(outro.address);
  });

  it("rejeita dono, endereço zero e nome vazio", async function () {
    const { contrato, dono, comunidade } = await implantar();
    await expect(contrato.cadastrarComunidade(dono.address, "X")).to.be.reverted;
    await expect(contrato.cadastrarComunidade(ethers.ZeroAddress, "X")).to.be.reverted;
    await expect(contrato.cadastrarComunidade(comunidade.address, "")).to.be.reverted;
  });

  it("desativa comunidade", async function () {
    const { contrato, comunidade } = await implantar();
    await contrato.cadastrarComunidade(comunidade.address, "Viveiro");
    await expect(contrato.desativarComunidade(comunidade.address))
      .to.emit(contrato, "ComunidadeDesativada")
      .withArgs(comunidade.address);
    expect((await contrato.comunidades(comunidade.address)).ativa).to.equal(false);
  });

  it("desativar só pelo dono e só comunidade cadastrada", async function () {
    const { contrato, comunidade, outro } = await implantar();
    await expect(contrato.connect(outro).desativarComunidade(comunidade.address))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado");
    await expect(contrato.desativarComunidade(comunidade.address)).to.be.reverted;
  });

  it("reativar mantém cadastro e atualiza o nome", async function () {
    const { contrato, comunidade } = await implantar();
    await contrato.cadastrarComunidade(comunidade.address, "Nome Antigo");
    await contrato.desativarComunidade(comunidade.address);
    await contrato.cadastrarComunidade(comunidade.address, "Nome Novo");
    const c = await contrato.comunidades(comunidade.address);
    expect(c.cadastrada).to.equal(true);
    expect(c.ativa).to.equal(true);
    expect(c.nome).to.equal("Nome Novo");
    expect(await contrato.projetosDaComunidade(comunidade.address)).to.deep.equal([]);
  });
});
