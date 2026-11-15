# Roteiro da apresentação (15 min)

Quatro papéis, usados para organizar a fala. **Todos devem saber explicar o contrato e o frontend**, porque a arguição pode perguntar a qualquer um.

Papéis: Contrato = Desenvolvedor(a) do contrato; Frontend = Desenvolvedor(a) frontend; Web3 = Integração Web3; Docs/QA = Documentação e QA.

## Blocos e tempos

| Tempo | Bloco | Quem sugere falar | Conteúdo |
|---|---|---|---|
| 2 min | 1. Problema e solução | Docs/QA | Reflorestamento: o doador não sabe se virou árvore. Duas parcelas (50% na meta, 50% após verificação), reembolso se falhar. Por que blockchain. |
| 2 min | 2. Arquitetura | Web3 | Contrato na Sepolia (Remix + MetaMask), frontend HTML/CSS/JS + Web3.js 4.x, Vercel. Diagrama de estados do README. |
| 4 min | 3. Contrato | Contrato | Os 7 grupos de recursos e onde estão (tabela do README), modificadores, eventos/erros, regras de dinheiro, segurança (CEI, `semReentrada`, pull payment, prazos públicos). |
| 5 min | 4. Demo ao vivo | Frontend + Web3 | Roteiro abaixo; um narra, o outro opera as contas. |
| 2 min | 5. Limitações e fechamento | Docs/QA | Limitações do README, melhorias futuras, declaração de uso de IA, perguntas. |

## Demo de 5 minutos (3 contas)

**Antes de começar (já preparado):** um projeto **Financiado e Plantado** aguardando verificação (prazo de 5 min: registre o plantio pouco antes de entrar na demo, ou use um segundo ainda em `Financiado` e registre ao vivo) e um projeto **Cancelado** com reembolso pendente do Apoiador. O projeto Plantado preparado deve ter tido a **1ª parcela (50%) sacada antes** da demo, para que o "Sacar" ao vivo libere só o restante. Para o erro personalizado, deixe a comunidade com **3 projetos ativos** (veja o passo 4). Três abas ou perfis de navegador, uma por conta, na Sepolia.

1. **Conectar (30 s).** Conta Apoiador: "Conectar carteira"; mostrar endereço abreviado, saldo, selo "Sepolia ✓". Trocar a MetaMask para outra rede e mostrar o banner "rede errada"; voltar com "Trocar para Sepolia".
2. **Ler (30 s).** Totais e cards dos projetos: status, barra de progresso, contagem regressiva, hash da prova.
3. **Apoiar com ETH (1 min).** Em um projeto em captação, apoiar com `0,01` ETH. Mostrar a MetaMask, o hash com estado pendente → confirmada e o link do Etherscan. O apoio que bate a meta muda o card para Financiado na hora.
4. **Provocar erro (1 min).** Digitar um valor maior que o saldo (aviso de saldo antes da MetaMask) e um valor inválido (ex.: `abc`), que são erros tratados pela própria tela. Em seguida, **erro personalizado do contrato (demo principal):** com a conta Comunidade já com 3 projetos ativos (prepare antes), tentar criar um 4º projeto: "Limite de 3 projetos atingido." (`LimiteDeProjetosAtingido(3)`). Explicar que o erro vem decodificado da ABI via simulação com `.call()`, sem gastar gas. Também mostrar a rejeição na MetaMask (código 4001): "Você cancelou a transação na MetaMask.". (Alternativa mais frágil: `EstadoInvalido` com duas abas; ao voltar para a aba 1, clique em até ~15 s, antes da atualização automática, ou mantenha o cursor no campo de valor, que pausa a atualização. `PrazoNaoEncerrado`: mostrar no Remix chamando `encerrarPorPrazo` antes do prazo, se sobrar tempo.)
5. **Histórico e Etherscan (30 s).** Mostrar o "Histórico de eventos" (`getPastEvents`) com o apoio e abrir a transação no Etherscan.
6. **Verificação e saque (1,5 min).** Conta Dono: "Verificar plantio" no projeto preparado; reputação da comunidade sobe. Conta Comunidade: "Sacar" (primeira parcela já sacada, agora o restante). Conta Apoiador: "Reembolsar" no projeto cancelado, valor devolvido.

## Checklist da véspera

- [ ] SepoliaETH suficiente nas 3 contas (o faucet pode ter fila; confira o saldo no dia anterior).
- [ ] Contrato verificado no Etherscan e `frontend/contrato.js` com endereço e bloco corretos.
- [ ] URL da Vercel abre, conecta e lista os projetos; README com os `<!-- PREENCHER -->` resolvidos.
- [ ] Comunidade cadastrada e projetos preparados (um Financiado/Plantado dentro do prazo de verificação e com a 1ª parcela já sacada, um Cancelado com reembolso, um em captação com prazo longo para apoiar).
- [ ] **Vídeo plano B** gravado (3 a 5 min) e baixado no computador, caso a rede ou a MetaMask falhem.
- [ ] Prints em `docs/prints/` e slides prontos (`docs/slides.pdf`).
- [ ] Cada integrante ensaiou o roteiro e sabe explicar contrato e frontend.
- [ ] Navegador com a MetaMask desbloqueada, aba do Remix e do Etherscan abertas.

## Perguntas prováveis da arguição

- **Por que `immutable`?** `dono` e `prazoVerificacaoSeg` são definidos uma vez no constructor e nunca mudam; ficam no bytecode (leitura mais barata) e ninguém, nem o dono, pode alterá-los depois.
- **Por que pull payment?** O contrato nunca envia ETH dentro de outras funções. Quem tem direito pede (`sacar`, `pedirReembolso`), então um destinatário que rejeita ETH só trava a si mesmo e não o resto do sistema. O custo é que valores devidos ficam no contrato até o titular pedir.
- **O que é CEI?** Checks-effects-interactions: primeiro checar as condições, depois atualizar o estado (`sacado`, contribuição zerada) e só no fim enviar o ETH. Assim, uma chamada de volta durante a transferência encontra o estado já atualizado. Além disso há o modificador `semReentrada`.
- **E se o dono sumir?** Nenhum ETH depende só do dono: `encerrarPorPrazo` é pública e cancela qualquer projeto cujo prazo venceu, liberando o reembolso. O que se perde é a verificação (nenhum projeto novo chega a `Verificado`), não o dinheiro dos apoiadores. Cadastrar comunidades e verificar plantios continuam dependendo do dono.
- **Por que só o hash da prova?** Guardar foto ou laudo on-chain seria caro e público. O hash (`bytes32`, keccak256) prova que o arquivo existia e não foi alterado: qualquer pessoa recalcula o hash do arquivo e compara. O arquivo fica com a comunidade.
- **Como o frontend decodifica erros personalizados?** Antes de enviar, simula a chamada com `.call()` (sem gastar gas); o nó devolve o *selector* do erro com os argumentos, e o frontend compara com os erros da ABI (`contrato.js`), pega o nome e mapeia para uma frase em português (ex.: `PrazoNaoEncerrado` vira "o prazo ainda não terminou").
- **Por que duas parcelas?** Dá efeito real à verificação: a comunidade recebe 50% para comprar mudas e os outros 50% só saem depois da prova validada. Se não for validada, o retido volta aos apoiadores.
- **A comunidade pode se auto-financiar?** Sim, de outro endereço; é uma limitação conhecida, mitigada só pela reputação e pelo dono verificador.
- **Por que não há `receive`?** Para que ETH enviado por engano seja rejeitado; o único caminho de entrada é `apoiar`, que registra a contribuição.
- **Por que Hardhat no repositório?** Só para rodar 57 testes automatizados localmente; o contrato foi compilado e implantado no Remix, e o frontend usa apenas Web3.js. Os testes do Hardhat compilam com solc 0.8.24 e optimizer desligado; o deploy na Sepolia foi compilado no Remix com 0.8.34 e optimizer 200 (mesmo código-fonte; bytecode conferido, igual exceto pelos `immutable`).
