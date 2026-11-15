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

describe("Ciclo do plantio", function () {
  const eth = (v) => ethers.parseEther(v);
  const prova = ethers.id("foto-plantio.jpg");
  const MOTIVO_META = "Meta nao atingida no prazo";
  const MOTIVO_PLANTIO = "Plantio nao registrado no prazo";
  const MOTIVO_VERIF = "Verificacao nao realizada no prazo";

  // Projeto 0 em Captando.
  async function captando() {
    const ctx = await implantar();
    await ctx.contrato.cadastrarComunidade(ctx.comunidade.address, "Viveiro Manacapuru");
    await criarProjetoPadrao(ctx.contrato, ctx.comunidade);
    return ctx;
  }
  // Projeto 0 em Financiado (1 ETH arrecadado).
  async function financiado() {
    const ctx = await captando();
    await financiar(ctx.contrato, 0, [ctx.apoiador, ctx.apoiador2]);
    return ctx;
  }
  // Projeto 0 em Plantado.
  async function plantado() {
    const ctx = await financiado();
    await ctx.contrato.connect(ctx.comunidade).registrarPlantio(0, prova);
    return ctx;
  }
  const prazoPlantioDe = async (c) => Number((await c.obterProjeto(0)).prazoPlantio);
  const prazoVerifDe = async (c) => Number((await c.obterProjeto(0)).prazoVerificacao);
  const reputacao = async (c, conta) => (await c.comunidades(conta.address)).reputacao;

  it("registra plantio", async function () {
    const { contrato, comunidade } = await financiado();
    const tx = await contrato.connect(comunidade).registrarPlantio(0, prova);
    const bloco = await ethers.provider.getBlock(tx.blockNumber);
    await expect(tx).to.emit(contrato, "PlantioRegistrado").withArgs(0, prova);
    const p = await contrato.obterProjeto(0);
    expect(p.status).to.equal(2n);
    expect(p.provaPlantio).to.equal(prova);
    expect(p.prazoVerificacao).to.equal(BigInt(bloco.timestamp) + 600n);
  });

  it("registrar: prova zero, após o prazo e por não-comunidade", async function () {
    const { contrato, comunidade, apoiador } = await financiado();
    await expect(contrato.connect(comunidade).registrarPlantio(0, ethers.ZeroHash))
      .to.be.revertedWith("Prova invalida");
    await expect(contrato.connect(apoiador).registrarPlantio(0, prova))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado")
      .withArgs(apoiador.address);
    await expect(contrato.connect(comunidade).registrarPlantio(9, prova))
      .to.be.revertedWithCustomError(contrato, "ProjetoInexistente")
      .withArgs(9);
    const prazo = await prazoPlantioDe(contrato);
    await time.increase(61 * 60);
    await expect(contrato.connect(comunidade).registrarPlantio(0, prova))
      .to.be.revertedWithCustomError(contrato, "PrazoEncerrado")
      .withArgs(prazo);
  });

  it("registrar fora de Financiado reverte com EstadoInvalido", async function () {
    const { contrato, comunidade } = await captando();
    await expect(contrato.connect(comunidade).registrarPlantio(0, prova))
      .to.be.revertedWithCustomError(contrato, "EstadoInvalido")
      .withArgs(0, 0, 1);
  });

  it("verifica e libera o restante (já sacou a 1ª parcela)", async function () {
    const { contrato, dono, comunidade } = await plantado();
    await contrato.connect(comunidade).sacar(0);
    await expect(contrato.connect(dono).verificarPlantio(0))
      .to.emit(contrato, "PlantioVerificado")
      .withArgs(0, dono.address);
    expect((await contrato.obterProjeto(0)).status).to.equal(3n);
    expect(await reputacao(contrato, comunidade)).to.equal(1n);
    expect(await contrato.disponivelParaSaque(0)).to.equal(eth("0.5"));
    await contrato.connect(comunidade).sacar(0);
    expect(await ethers.provider.getBalance(await contrato.getAddress())).to.equal(0n);
  });

  it("verifica e libera tudo (não sacou antes)", async function () {
    const { contrato, dono, comunidade } = await plantado();
    await contrato.connect(dono).verificarPlantio(0);
    expect(await contrato.disponivelParaSaque(0)).to.equal(eth("1"));
    await expect(contrato.connect(comunidade).sacar(0)).to.changeEtherBalances(
      [contrato, comunidade],
      [-eth("1"), eth("1")]
    );
    expect(await ethers.provider.getBalance(await contrato.getAddress())).to.equal(0n);
  });

  it("só o dono verifica, e só em Plantado", async function () {
    const { contrato, comunidade } = await plantado();
    await expect(contrato.connect(comunidade).verificarPlantio(0))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado")
      .withArgs(comunidade.address);
    const c2 = await financiado();
    await expect(c2.contrato.connect(c2.dono).verificarPlantio(0))
      .to.be.revertedWithCustomError(c2.contrato, "EstadoInvalido")
      .withArgs(0, 1, 2);
  });

  it("verificar após prazoVerificacao reverte", async function () {
    const { contrato, dono } = await plantado();
    const prazo = await prazoVerifDe(contrato);
    await time.increase(11 * 60);
    await expect(contrato.connect(dono).verificarPlantio(0))
      .to.be.revertedWithCustomError(contrato, "PrazoEncerrado")
      .withArgs(prazo);
  });

  it("dono cancela em Captando (penalidade) com saldo reembolsável", async function () {
    const { contrato, dono, comunidade, apoiador } = await captando();
    await contrato.connect(apoiador).apoiar(0, { value: eth("0.3") });
    await expect(contrato.connect(dono).cancelarProjeto(0, "suspeita"))
      .to.emit(contrato, "ProjetoCancelado")
      .withArgs(0, "suspeita", eth("0.3"));
    const p = await contrato.obterProjeto(0);
    expect(p.status).to.equal(4n);
    expect(p.saldoReembolsavel).to.equal(eth("0.3"));
    expect(await reputacao(contrato, comunidade)).to.equal(-1n);
  });

  it("dono cancela em Plantado antes do prazo (penalidade)", async function () {
    const { contrato, dono, comunidade } = await plantado();
    await contrato.connect(comunidade).sacar(0);
    await contrato.connect(dono).cancelarProjeto(0, "prova rejeitada");
    const p = await contrato.obterProjeto(0);
    expect(p.status).to.equal(4n);
    expect(p.saldoReembolsavel).to.equal(eth("0.5")); // arrecadado - sacado
    expect(await reputacao(contrato, comunidade)).to.equal(-1n);
  });

  it("dono em Plantado após prazoVerificacao: PrazoEncerrado", async function () {
    const { contrato, dono } = await plantado();
    const prazo = await prazoVerifDe(contrato);
    await time.increase(11 * 60);
    await expect(contrato.connect(dono).cancelarProjeto(0, "x"))
      .to.be.revertedWithCustomError(contrato, "PrazoEncerrado")
      .withArgs(prazo);
  });

  it("só o dono cancela e o projeto precisa existir", async function () {
    const { contrato, comunidade, outro } = await captando();
    await expect(contrato.connect(outro).cancelarProjeto(0, "x"))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado")
      .withArgs(outro.address);
    await expect(contrato.connect(comunidade).cancelarProjeto(0, "x"))
      .to.be.revertedWithCustomError(contrato, "NaoAutorizado");
    await expect(contrato.encerrarPorPrazo(9))
      .to.be.revertedWithCustomError(contrato, "ProjetoInexistente")
      .withArgs(9);
  });

  it("fronteira cancelarProjeto em Captando: prazo-1 cancela (-1), prazo reverte e encerrarPorPrazo decide", async function () {
    let c = await captando();
    const prazoCap = async (x) => Number((await x.obterProjeto(0)).prazoCaptacao);
    let prazo = await prazoCap(c.contrato);
    await time.setNextBlockTimestamp(prazo - 1);
    await expect(c.contrato.connect(c.dono).cancelarProjeto(0, "suspeita"))
      .to.emit(c.contrato, "ProjetoCancelado");
    expect(await reputacao(c.contrato, c.comunidade)).to.equal(-1n);

    c = await captando();
    prazo = await prazoCap(c.contrato);
    await time.setNextBlockTimestamp(prazo);
    await expect(c.contrato.connect(c.dono).cancelarProjeto(0, "x"))
      .to.be.revertedWithCustomError(c.contrato, "PrazoEncerrado")
      .withArgs(prazo);
    await expect(c.contrato.connect(c.outro).encerrarPorPrazo(0))
      .to.emit(c.contrato, "ProjetoCancelado");
    expect(await reputacao(c.contrato, c.comunidade)).to.equal(0n);
  });

  it("fronteira registrarPlantio: prazo-1 abre, prazo reverte e encerra", async function () {
    let c = await financiado();
    let prazo = await prazoPlantioDe(c.contrato);
    await time.setNextBlockTimestamp(prazo - 1);
    await expect(c.contrato.connect(c.comunidade).registrarPlantio(0, prova))
      .to.emit(c.contrato, "PlantioRegistrado");

    c = await financiado();
    prazo = await prazoPlantioDe(c.contrato);
    await time.setNextBlockTimestamp(prazo - 1);
    await expect(c.contrato.connect(c.outro).encerrarPorPrazo(0))
      .to.be.revertedWithCustomError(c.contrato, "PrazoNaoEncerrado")
      .withArgs(prazo - 1, prazo);

    c = await financiado();
    prazo = await prazoPlantioDe(c.contrato);
    await time.setNextBlockTimestamp(prazo);
    await expect(c.contrato.connect(c.comunidade).registrarPlantio(0, prova))
      .to.be.revertedWithCustomError(c.contrato, "PrazoEncerrado")
      .withArgs(prazo);

    c = await financiado();
    prazo = await prazoPlantioDe(c.contrato);
    await time.setNextBlockTimestamp(prazo);
    await expect(c.contrato.connect(c.outro).encerrarPorPrazo(0))
      .to.emit(c.contrato, "ProjetoCancelado");
  });

  it("fronteira verificarPlantio: prazo-1 abre, prazo reverte e encerra", async function () {
    let c = await plantado();
    let prazo = await prazoVerifDe(c.contrato);
    await time.setNextBlockTimestamp(prazo - 1);
    await expect(c.contrato.connect(c.dono).verificarPlantio(0))
      .to.emit(c.contrato, "PlantioVerificado");

    c = await plantado();
    prazo = await prazoVerifDe(c.contrato);
    await time.setNextBlockTimestamp(prazo - 1);
    await expect(c.contrato.connect(c.outro).encerrarPorPrazo(0))
      .to.be.revertedWithCustomError(c.contrato, "PrazoNaoEncerrado")
      .withArgs(prazo - 1, prazo);

    c = await plantado();
    prazo = await prazoVerifDe(c.contrato);
    await time.setNextBlockTimestamp(prazo);
    await expect(c.contrato.connect(c.dono).verificarPlantio(0))
      .to.be.revertedWithCustomError(c.contrato, "PrazoEncerrado")
      .withArgs(prazo);

    c = await plantado();
    prazo = await prazoVerifDe(c.contrato);
    await time.setNextBlockTimestamp(prazo);
    await expect(c.contrato.connect(c.outro).encerrarPorPrazo(0))
      .to.emit(c.contrato, "ProjetoCancelado");
  });

  it("dono não cancela Financiado antes de prazoPlantio; depois sim (-1)", async function () {
    const { contrato, dono, comunidade } = await financiado();
    const prazo = await prazoPlantioDe(contrato);
    await time.setNextBlockTimestamp(prazo - 1);
    await expect(contrato.connect(dono).cancelarProjeto(0, "x"))
      .to.be.revertedWithCustomError(contrato, "PrazoNaoEncerrado")
      .withArgs(prazo - 1, prazo);
    await time.setNextBlockTimestamp(prazo);
    await expect(contrato.connect(dono).cancelarProjeto(0, "sem plantio"))
      .to.emit(contrato, "ProjetoCancelado");
    expect(await reputacao(contrato, comunidade)).to.equal(-1n);
  });

  it("dono não cancela Verificado nem Cancelado", async function () {
    const { contrato, dono } = await plantado();
    await contrato.connect(dono).verificarPlantio(0);
    await expect(contrato.connect(dono).cancelarProjeto(0, "x"))
      .to.be.revertedWithCustomError(contrato, "EstadoInvalido")
      .withArgs(0, 3, 2);

    const c = await captando();
    await c.contrato.connect(c.dono).cancelarProjeto(0, "x");
    await expect(c.contrato.connect(c.dono).cancelarProjeto(0, "y"))
      .to.be.revertedWithCustomError(c.contrato, "EstadoInvalido")
      .withArgs(0, 4, 2);
  });

  it("encerrarPorPrazo em Captando: motivo 1, sem penalidade", async function () {
    const { contrato, comunidade, apoiador, outro } = await captando();
    await contrato.connect(apoiador).apoiar(0, { value: eth("0.2") });
    await expect(contrato.connect(outro).encerrarPorPrazo(0))
      .to.be.revertedWithCustomError(contrato, "PrazoNaoEncerrado");
    await time.increase(31 * 60);
    await expect(contrato.connect(outro).encerrarPorPrazo(0))
      .to.emit(contrato, "ProjetoCancelado")
      .withArgs(0, MOTIVO_META, eth("0.2"));
    expect((await contrato.obterProjeto(0)).status).to.equal(4n);
    expect(await reputacao(contrato, comunidade)).to.equal(0n);
  });

  it("encerrarPorPrazo em Financiado: motivo 2, penalidade -1", async function () {
    const { contrato, comunidade, outro } = await financiado();
    await expect(contrato.connect(outro).encerrarPorPrazo(0))
      .to.be.revertedWithCustomError(contrato, "PrazoNaoEncerrado");
    await time.increase(61 * 60);
    await expect(contrato.connect(outro).encerrarPorPrazo(0))
      .to.emit(contrato, "ProjetoCancelado")
      .withArgs(0, MOTIVO_PLANTIO, eth("1"));
    expect(await reputacao(contrato, comunidade)).to.equal(-1n);
  });

  it("encerrarPorPrazo em Plantado: motivo 3, sem penalidade, mantém 1ª parcela", async function () {
    const { contrato, comunidade, outro } = await plantado();
    await contrato.connect(comunidade).sacar(0);
    await expect(contrato.connect(outro).encerrarPorPrazo(0))
      .to.be.revertedWithCustomError(contrato, "PrazoNaoEncerrado");
    await time.increase(11 * 60);
    await expect(contrato.connect(outro).encerrarPorPrazo(0))
      .to.emit(contrato, "ProjetoCancelado")
      .withArgs(0, MOTIVO_VERIF, eth("0.5"));
    expect(await reputacao(contrato, comunidade)).to.equal(0n);
  });

  it("encerrarPorPrazo em Verificado e Cancelado: EstadoInvalido", async function () {
    const { contrato, dono, outro } = await plantado();
    await contrato.connect(dono).verificarPlantio(0);
    await expect(contrato.connect(outro).encerrarPorPrazo(0))
      .to.be.revertedWithCustomError(contrato, "EstadoInvalido")
      .withArgs(0, 3, 2);
    const c = await captando();
    await c.contrato.connect(c.dono).cancelarProjeto(0, "x");
    await expect(c.contrato.connect(c.outro).encerrarPorPrazo(0))
      .to.be.revertedWithCustomError(c.contrato, "EstadoInvalido")
      .withArgs(0, 4, 2);
  });

  it("reputação baixa bloqueia novos projetos e persiste após reativar", async function () {
    const { contrato, dono, comunidade } = await captando();
    await contrato.connect(dono).cancelarProjeto(0, "x");
    for (let i = 1; i <= 2; i++) {
      await criarProjetoPadrao(contrato, comunidade);
      await contrato.connect(dono).cancelarProjeto(i, "x");
    }
    expect(await reputacao(contrato, comunidade)).to.equal(-3n);
    await expect(criarProjetoPadrao(contrato, comunidade))
      .to.be.revertedWithCustomError(contrato, "ReputacaoInsuficiente")
      .withArgs(-3);
    await contrato.desativarComunidade(comunidade.address);
    await contrato.cadastrarComunidade(comunidade.address, "Viveiro Manacapuru");
    expect(await reputacao(contrato, comunidade)).to.equal(-3n);
    await expect(criarProjetoPadrao(contrato, comunidade))
      .to.be.revertedWithCustomError(contrato, "ReputacaoInsuficiente")
      .withArgs(-3);
  });

  it("limite de 20 projetos por comunidade", async function () {
    const { contrato, outro, comunidade } = await captando();
    for (let i = 0; i < 20; i++) {
      if (i > 0) await criarProjetoPadrao(contrato, comunidade);
      await time.increase(31 * 60);
      await contrato.connect(outro).encerrarPorPrazo(i); // sem penalidade
    }
    expect(await reputacao(contrato, comunidade)).to.equal(0n);
    await expect(criarProjetoPadrao(contrato, comunidade))
      .to.be.revertedWithCustomError(contrato, "LimiteDeProjetosAtingido")
      .withArgs(20);
  });

  it("projetos cancelados deixam de contar no limite de ativos", async function () {
    const { contrato, outro, comunidade } = await captando();
    await criarProjetoPadrao(contrato, comunidade);
    await criarProjetoPadrao(contrato, comunidade);
    await expect(criarProjetoPadrao(contrato, comunidade))
      .to.be.revertedWithCustomError(contrato, "LimiteDeProjetosAtingido")
      .withArgs(3);
    await time.increase(31 * 60);
    await contrato.connect(outro).encerrarPorPrazo(0);
    await expect(criarProjetoPadrao(contrato, comunidade)).to.emit(contrato, "ProjetoCriado");
  });
});

describe("Reembolso", function () {
  const eth = (v) => ethers.parseEther(v);
  const prova = ethers.id("foto-plantio.jpg");

  async function captando() {
    const ctx = await implantar();
    await ctx.contrato.cadastrarComunidade(ctx.comunidade.address, "Viveiro Manacapuru");
    await criarProjetoPadrao(ctx.contrato, ctx.comunidade);
    return ctx;
  }

  it("integral quando meta não atingida", async function () {
    const { contrato, apoiador, outro } = await captando();
    await contrato.connect(apoiador).apoiar(0, { value: eth("0.3") });
    await time.increase(31 * 60);
    await contrato.connect(outro).encerrarPorPrazo(0);
    expect(await contrato.valorReembolsavel(0, apoiador.address)).to.equal(eth("0.3"));
    const tx = contrato.connect(apoiador).pedirReembolso(0);
    await expect(tx).to.changeEtherBalance(apoiador, eth("0.3"));
    await expect(tx).to.emit(contrato, "ReembolsoRealizado").withArgs(0, apoiador.address, eth("0.3"));
    await expect(contrato.connect(apoiador).pedirReembolso(0))
      .to.be.revertedWithCustomError(contrato, "NadaAReembolsar");
  });

  it("proporcional após 1ª parcela", async function () {
    const { contrato, comunidade, apoiador, apoiador2, outro } = await captando();
    await financiar(contrato, 0, [apoiador, apoiador2]);
    await contrato.connect(comunidade).sacar(0);
    await time.increase(61 * 60);
    await contrato.connect(outro).encerrarPorPrazo(0);
    await expect(contrato.connect(apoiador).pedirReembolso(0))
      .to.changeEtherBalance(apoiador, eth("0.3"));
    await expect(contrato.connect(apoiador2).pedirReembolso(0))
      .to.changeEtherBalance(apoiador2, eth("0.2"));
    expect(await ethers.provider.getBalance(await contrato.getAddress())).to.equal(0n);
  });

  it("sem resto preso", async function () {
    const { contrato, comunidade, apoiador, apoiador2, outro } = await captando();
    const [, , , , , terceiro] = await ethers.getSigners();
    await criarProjetoPadrao(contrato, comunidade, { meta: 10n });
    // projeto 0 fica de lado; usa o projeto 1 (meta 10 wei)
    await contrato.connect(apoiador).apoiar(1, { value: 3n });
    await contrato.connect(apoiador2).apoiar(1, { value: 3n });
    await contrato.connect(terceiro).apoiar(1, { value: 4n });
    await contrato.connect(comunidade).sacar(1); // 5 wei
    await time.increase(61 * 60);
    await contrato.connect(outro).encerrarPorPrazo(1);
    let soma = 0n;
    for (const conta of [apoiador, apoiador2, terceiro]) {
      soma += await contrato.valorReembolsavel(1, conta.address);
      await contrato.connect(conta).pedirReembolso(1);
    }
    expect(soma).to.equal(5n); // 1 + 1 + 3: o último absorve o arredondamento
    expect(await ethers.provider.getBalance(await contrato.getAddress())).to.equal(0n);
    const p = await contrato.obterProjeto(1);
    expect(p.contribuicoesReembolsadas).to.equal(10n);
    expect(p.totalReembolsado).to.equal(5n);
  });

  it("antes de cancelado", async function () {
    const { contrato, apoiador } = await captando();
    await contrato.connect(apoiador).apoiar(0, { value: eth("0.3") });
    await expect(contrato.connect(apoiador).pedirReembolso(0))
      .to.be.revertedWithCustomError(contrato, "EstadoInvalido");
    await expect(contrato.connect(apoiador).pedirReembolso(7))
      .to.be.revertedWithCustomError(contrato, "ProjetoInexistente");
    expect(await contrato.valorReembolsavel(0, apoiador.address)).to.equal(0n);
  });

  it("cancelado sem apoios", async function () {
    const { contrato, apoiador } = await captando();
    await contrato.cancelarProjeto(0, "Suspeita");
    expect(await contrato.valorReembolsavel(0, apoiador.address)).to.equal(0n);
    await expect(contrato.connect(apoiador).pedirReembolso(0))
      .to.be.revertedWithCustomError(contrato, "NadaAReembolsar");
  });

  it("reentrância bloqueada", async function () {
    const { contrato, outro } = await captando();
    const Atacante = await ethers.getContractFactory("AtacanteReentrancia");
    const atacante = await Atacante.deploy(await contrato.getAddress());
    await atacante.apoiar(0, { value: eth("0.3") });
    await contrato.cancelarProjeto(0, "Suspeita");
    await expect(atacante.atacar())
      .to.be.revertedWithCustomError(contrato, "TransferenciaFalhou");
    expect(await contrato.contribuicoes(0, await atacante.getAddress())).to.equal(eth("0.3"));
    expect(await ethers.provider.getBalance(await contrato.getAddress())).to.equal(eth("0.3"));
  });
});

module.exports = { implantar, criarProjetoPadrao, financiar };
