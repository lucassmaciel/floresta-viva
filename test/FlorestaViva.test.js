const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Implanta o contrato com prazo de verificação de 10 minutos e devolve as contas de teste.
async function implantar() {
  const [dono, comunidade, apoiador, apoiador2, outro] = await ethers.getSigners();
  const Fabrica = await ethers.getContractFactory("FlorestaViva");
  const contrato = await Fabrica.deploy(10);
  await contrato.waitForDeployment();
  return { contrato, dono, comunidade, apoiador, apoiador2, outro };
}

// Cria um projeto com valores padrão; `ov` sobrescreve qualquer campo.
// Devolve a transação (use `await` para esperar a mineração).
async function criarProjetoPadrao(contrato, comunidade, ov = {}) {
  const p = {
    titulo: "Castanheiras de Manacapuru",
    local: "Manacapuru - AM",
    mudas: 500,
    meta: ethers.parseEther("1"),
    durCap: 30,
    durPlantio: 60,
    ...ov,
  };
  return contrato
    .connect(comunidade)
    .criarProjeto(p.titulo, p.local, p.mudas, p.meta, p.durCap, p.durPlantio);
}

// Financia o projeto `id` até a meta (1 ETH): apoiador 0.6 ETH + apoiador2 0.4 ETH.
async function financiar(contrato, id, apoiadores) {
  const [a1, a2] = apoiadores;
  await contrato.connect(a1).apoiar(id, { value: ethers.parseEther("0.6") });
  return contrato.connect(a2).apoiar(id, { value: ethers.parseEther("0.4") });
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

describe("Projetos", function () {
  async function comComunidade() {
    const ctx = await implantar();
    await ctx.contrato.cadastrarComunidade(ctx.comunidade.address, "Viveiro Manacapuru");
    return ctx;
  }

  it("cria projeto", async function () {
    const { contrato, comunidade } = await comComunidade();
    const tx = await criarProjetoPadrao(contrato, comunidade);
    const bloco = await ethers.provider.getBlock(tx.blockNumber);
    const prazo = BigInt(bloco.timestamp) + 30n * 60n;
    await expect(tx)
      .to.emit(contrato, "ProjetoCriado")
      .withArgs(0, comunidade.address, "Castanheiras de Manacapuru", ethers.parseEther("1"), prazo);
    const p = await contrato.obterProjeto(0);
    expect(p.status).to.equal(0n);
    expect(p.prazoCaptacao).to.equal(prazo);
    expect(p.duracaoPlantio).to.equal(3600n);
    expect(await contrato.projetosDaComunidade(comunidade.address)).to.deep.equal([0n]);
    expect(await contrato.totalProjetos()).to.equal(1n);
  });

  it("só comunidade ativa cria", async function () {
    const { contrato, comunidade, apoiador } = await comComunidade();
    await expect(criarProjetoPadrao(contrato, apoiador))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado")
      .withArgs(apoiador.address);
    await contrato.desativarComunidade(comunidade.address);
    await expect(criarProjetoPadrao(contrato, comunidade))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado")
      .withArgs(comunidade.address);
  });

  it("valida dados", async function () {
    const { contrato, comunidade } = await comComunidade();
    await expect(criarProjetoPadrao(contrato, comunidade, { titulo: "" }))
      .to.be.revertedWith("Titulo invalido");
    await expect(criarProjetoPadrao(contrato, comunidade, { titulo: "a".repeat(81) }))
      .to.be.revertedWith("Titulo invalido");
    await expect(criarProjetoPadrao(contrato, comunidade, { local: "" }))
      .to.be.revertedWith("Local invalido");
    await expect(criarProjetoPadrao(contrato, comunidade, { meta: 0 }))
      .to.be.revertedWith("Meta deve ser maior que zero");
    await expect(criarProjetoPadrao(contrato, comunidade, { mudas: 0 }))
      .to.be.revertedWith("Quantidade de mudas invalida");
    await expect(criarProjetoPadrao(contrato, comunidade, { durCap: 0 }))
      .to.be.revertedWith("Duracao de captacao invalida");
    await expect(criarProjetoPadrao(contrato, comunidade, { durCap: 525601 }))
      .to.be.revertedWith("Duracao de captacao invalida");
    await expect(criarProjetoPadrao(contrato, comunidade, { durPlantio: 0 }))
      .to.be.revertedWith("Duracao de plantio invalida");
    await expect(criarProjetoPadrao(contrato, comunidade, { durPlantio: 525601 }))
      .to.be.revertedWith("Duracao de plantio invalida");
  });

  it("limite de ativos", async function () {
    const { contrato, comunidade } = await comComunidade();
    for (let i = 0; i < 3; i++) await criarProjetoPadrao(contrato, comunidade);
    await expect(criarProjetoPadrao(contrato, comunidade))
      .to.be.revertedWithCustomError(contrato, "LimiteDeProjetosAtingido")
      .withArgs(3);
  });

  it("obterProjeto inexistente", async function () {
    const { contrato } = await comComunidade();
    await expect(contrato.obterProjeto(99))
      .to.be.revertedWithCustomError(contrato, "ProjetoInexistente")
      .withArgs(99);
  });
});

describe("Apoio e saque", function () {
  async function comProjeto() {
    const ctx = await implantar();
    await ctx.contrato.cadastrarComunidade(ctx.comunidade.address, "Viveiro Manacapuru");
    await criarProjetoPadrao(ctx.contrato, ctx.comunidade);
    return ctx;
  }
  const eth = (v) => ethers.parseEther(v);

  it("apoia", async function () {
    const { contrato, apoiador } = await comProjeto();
    await expect(contrato.connect(apoiador).apoiar(0, { value: eth("0.3") }))
      .to.emit(contrato, "ApoioRecebido")
      .withArgs(0, apoiador.address, eth("0.3"));
    expect(await contrato.contribuicoes(0, apoiador.address)).to.equal(eth("0.3"));
    expect(await contrato.totalApoiadoPor(apoiador.address)).to.equal(eth("0.3"));
    expect(await ethers.provider.getBalance(await contrato.getAddress())).to.equal(eth("0.3"));
  });

  it("rejeita valor zero", async function () {
    const { contrato, apoiador } = await comProjeto();
    await expect(contrato.connect(apoiador).apoiar(0, { value: 0 }))
      .to.be.revertedWithCustomError(contrato, "ValorInvalido");
  });

  it("rejeita apoio após o prazo de captação", async function () {
    const { contrato, apoiador } = await comProjeto();
    const prazo = (await contrato.obterProjeto(0)).prazoCaptacao;
    await time.increase(31 * 60);
    await expect(contrato.connect(apoiador).apoiar(0, { value: eth("0.1") }))
      .to.be.revertedWithCustomError(contrato, "PrazoEncerrado")
      .withArgs(prazo);
  });

  it("fronteira do prazo: em prazo reverte, em prazo-1 aceita", async function () {
    const { contrato, apoiador } = await comProjeto();
    const prazo = Number((await contrato.obterProjeto(0)).prazoCaptacao);
    await time.setNextBlockTimestamp(prazo - 1);
    await expect(contrato.connect(apoiador).apoiar(0, { value: eth("0.1") }))
      .to.emit(contrato, "ApoioRecebido");
    await time.setNextBlockTimestamp(prazo);
    await expect(contrato.connect(apoiador).apoiar(0, { value: eth("0.1") }))
      .to.be.revertedWithCustomError(contrato, "PrazoEncerrado")
      .withArgs(prazo);
  });

  it("financia ao bater a meta", async function () {
    const { contrato, apoiador, apoiador2 } = await comProjeto();
    const tx = await financiar(contrato, 0, [apoiador, apoiador2]);
    const bloco = await ethers.provider.getBlock(tx.blockNumber);
    await expect(tx)
      .to.emit(contrato, "ProjetoFinanciado")
      .withArgs(0, eth("1"), BigInt(bloco.timestamp) + 3600n);
    const p = await contrato.obterProjeto(0);
    expect(p.status).to.equal(1n);
    expect(p.prazoPlantio).to.equal(BigInt(bloco.timestamp) + 3600n);
  });

  it("aceita excedente", async function () {
    const { contrato, apoiador } = await comProjeto();
    await contrato.connect(apoiador).apoiar(0, { value: eth("1.5") });
    const p = await contrato.obterProjeto(0);
    expect(p.arrecadado).to.equal(eth("1.5"));
    expect(p.status).to.equal(1n);
  });

  it("rejeita apoio após financiado", async function () {
    const { contrato, apoiador, apoiador2, outro } = await comProjeto();
    await financiar(contrato, 0, [apoiador, apoiador2]);
    await expect(contrato.connect(outro).apoiar(0, { value: eth("0.1") }))
      .to.be.revertedWithCustomError(contrato, "EstadoInvalido")
      .withArgs(0, 1, 0);
  });

  it("apoiar projeto inexistente", async function () {
    const { contrato, apoiador } = await comProjeto();
    await expect(contrato.connect(apoiador).apoiar(9, { value: 1 }))
      .to.be.revertedWithCustomError(contrato, "ProjetoInexistente")
      .withArgs(9);
  });

  it("disponível para saque", async function () {
    const { contrato, apoiador, apoiador2 } = await comProjeto();
    expect(await contrato.disponivelParaSaque(0)).to.equal(0n);
    await financiar(contrato, 0, [apoiador, apoiador2]);
    expect(await contrato.disponivelParaSaque(0)).to.equal(eth("0.5"));
    expect(await contrato.calcularPrimeiraParcela(eth("1"))).to.equal(eth("0.5"));
  });

  it("saca a primeira parcela uma única vez", async function () {
    const { contrato, comunidade, apoiador, apoiador2 } = await comProjeto();
    await financiar(contrato, 0, [apoiador, apoiador2]);
    const tx = contrato.connect(comunidade).sacar(0);
    await expect(tx).to.changeEtherBalances(
      [contrato, comunidade],
      [-eth("0.5"), eth("0.5")]
    );
    await expect(tx).to.emit(contrato, "SaqueRealizado").withArgs(0, comunidade.address, eth("0.5"));
    expect((await contrato.obterProjeto(0)).sacado).to.equal(eth("0.5"));
    await expect(contrato.connect(comunidade).sacar(0))
      .to.be.revertedWithCustomError(contrato, "NadaASacar");
  });

  it("só a comunidade do projeto saca", async function () {
    const { contrato, apoiador, apoiador2 } = await comProjeto();
    await financiar(contrato, 0, [apoiador, apoiador2]);
    await expect(contrato.connect(apoiador).sacar(0))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado")
      .withArgs(apoiador.address);
  });

  it("sacar projeto inexistente", async function () {
    const { contrato, comunidade } = await comProjeto();
    await expect(contrato.connect(comunidade).sacar(9))
      .to.be.revertedWithCustomError(contrato, "ProjetoInexistente")
      .withArgs(9);
  });

  it("sem financiamento não há o que sacar", async function () {
    const { contrato, comunidade } = await comProjeto();
    await expect(contrato.connect(comunidade).sacar(0))
      .to.be.revertedWithCustomError(contrato, "NadaASacar");
  });

  it("comunidade desativada ainda saca", async function () {
    const { contrato, dono, comunidade, apoiador, apoiador2 } = await comProjeto();
    await financiar(contrato, 0, [apoiador, apoiador2]);
    await contrato.connect(dono).desativarComunidade(comunidade.address);
    await expect(contrato.connect(comunidade).sacar(0)).to.changeEtherBalance(comunidade, eth("0.5"));
  });

  it("ETH direto é rejeitado", async function () {
    const { contrato, dono } = await comProjeto();
    await expect(dono.sendTransaction({ to: await contrato.getAddress(), value: 1 })).to.be.reverted;
  });
});

module.exports = { implantar, criarProjetoPadrao, financiar };
