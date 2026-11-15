# Guia de deploy: Remix, Sepolia, Etherscan, GitHub e Vercel

Passo a passo para a equipe. O contrato da entrega já foi implantado (ver README, seção 3); este guia serve para refazer o processo ou para conferir cada etapa.

## 1. Contas, rede e faucet

1. Na MetaMask, crie 3 contas: **Dono**, **Comunidade** e **Apoiador**.
2. Ative "Mostrar redes de teste" e selecione **Sepolia** (Chain ID 11155111).
3. Pegue SepoliaETH no faucet do Google Cloud (https://cloud.google.com/application/web3/faucet/ethereum/sepolia) para as 3 contas. Faça isso cedo: faucets podem ter fila.

## 2. Compilar e implantar no Remix

1. Abra https://remix.ethereum.org e crie `FlorestaViva.sol`; cole o conteúdo de `contracts/FlorestaViva.sol` (arquivo único, sem imports).
2. Aba "Solidity compiler": versão **0.8.34** (qualquer 0.8.24 ou superior serve, pois o pragma é `^0.8.24`), **Enable optimization** ligado com **200 runs**. Compile. A versão e as opções usadas aqui precisam ser as mesmas na verificação (passo 4).
3. Aba "Deploy & run": Environment **Injected Provider – MetaMask**, conta **Dono** selecionada, rede Sepolia. Contrato `FlorestaViva`. No campo do constructor, `prazoVerificacaoMin` = **5** (5 minutos, bom para a demo ao vivo). Clique em Deploy e confirme na MetaMask.
4. Anote: **endereço do contrato**, **hash da transação** e **bloco** (veja a transação no Etherscan: https://sepolia.etherscan.io).

## 3. Testes rápidos no Remix e prints

No Remix, em "Deployed Contracts", com a conta **Dono**: `cadastrarComunidade(<endereço da conta Comunidade>, "Nome")`. Troque a conta no Remix para **Comunidade** e chame `criarProjeto("Teste", "Manacapuru - AM", 10, 10000000000000000, 10, 10)`. Chame `totalProjetos()` e `obterProjeto(0)`.

Tire prints (deploy, chamadas, transações no Etherscan) e salve em `docs/prints/`.

## 4. Verificar no Etherscan

Em `https://sepolia.etherscan.io/address/<endereço>#code`, "Verify and Publish":

- Compiler Type: **Solidity (Single file)**
- Compiler Version: **v0.8.34** (a mesma usada no Remix)
- Open Source License Type: **MIT**
- Optimization: **Yes, 200 runs**
- Cole o código de `contracts/FlorestaViva.sol`.
- Constructor Arguments (ABI-encoded): o argumento `prazoVerificacaoMin = 5` codificado é um valor de 32 bytes, ou seja, **64 caracteres hexadecimais terminando em 5** (`0x0000…0005`, sem o prefixo `0x` no campo do Etherscan). O Remix também mostra esse valor codificado ao lado da transação de deploy.

Alternativa: plugin "Contract Verification" do Remix. Se o argumento do constructor for outro, a codificação muda de acordo.

## 5. Preencher `frontend/contrato.js`

Preencha `endereco` e `blocoDeploy` (o bloco do deploy, usado pelo histórico de eventos). A ABI já está no arquivo. Se o contrato mudar, recompile e rode `node scripts/exportar-abi.js` (antes: `npx hardhat compile`); o script preserva endereço e bloco.

## 6. GitHub

1. Crie um repositório **público** e envie o projeto.
2. Cada integrante deve ter commits da sua parte (o professor confere o histórico).
3. Confirme que não há chave privada nem frase de recuperação no repositório.

## 7. Vercel

1. Em vercel.com, "Add New Project" e importe o repositório do GitHub.
2. Framework Preset: **Other**. **Root Directory: `frontend`**. Sem build command e sem output directory.
3. Deploy. Abra `https://<projeto>.vercel.app`, conecte a MetaMask na Sepolia e confirme que lista os projetos.

## 8. Fechar o README

Preencha os `<!-- PREENCHER -->` do `README.md`: integrantes e papéis, URL da Vercel, link do vídeo e a declaração de revisão de cada integrante. Depois confira os links do README e rode `npm test` uma última vez.
