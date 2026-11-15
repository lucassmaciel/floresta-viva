// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FlorestaViva
/// @notice Financiamento coletivo de reflorestamento: apoiadores enviam ETH a projetos de
///         comunidades cadastradas e o dinheiro e liberado conforme o plantio e comprovado.
/// @dev Arquivo unico, sem imports, para ser colado direto no Remix IDE.
contract FlorestaViva {
    // ------------------------------------------------------------------
    // Tipos: enum e structs
    // ------------------------------------------------------------------

    /// @notice Ciclo de vida de um projeto. Verificado e Cancelado sao estados finais.
    // [Recurso: StructsEEnums]
    enum Status { Captando, Financiado, Plantado, Verificado, Cancelado }

    /// @notice Dados completos de um projeto de reflorestamento.
    // [Recurso: StructsEEnums]
    struct Projeto {
        uint256 id;
        address payable comunidade;
        string titulo;
        string local;                       // ex.: "Manacapuru - AM"
        uint256 quantidadeMudas;
        uint256 meta;                       // em wei
        uint256 arrecadado;
        uint256 sacado;
        uint256 saldoReembolsavel;          // gravado no cancelamento
        uint256 prazoCaptacao;              // timestamp
        uint256 duracaoPlantio;             // segundos, informado na criacao
        uint256 prazoPlantio;               // timestamp, definido ao financiar
        uint256 prazoVerificacao;           // timestamp, definido ao registrar o plantio
        uint256 contribuicoesReembolsadas;  // soma das contribuicoes ja reembolsadas
        uint256 totalReembolsado;           // wei ja devolvidos
        bytes32 provaPlantio;               // keccak256 do arquivo de prova
        Status status;
    }

    /// @notice Dados de uma comunidade cadastrada pelo dono.
    // [Recurso: StructsEEnums]
    struct Comunidade {
        string nome;
        bool cadastrada;        // true para sempre depois do primeiro cadastro
        bool ativa;             // false impede apenas a criacao de novos projetos
        int256 reputacao;       // pode ficar negativa
        uint256[] projetos;     // ids dos projetos da comunidade
    }

    // ------------------------------------------------------------------
    // Constantes, imutaveis e estado
    // ------------------------------------------------------------------

    // [Recurso: TiposDeDados]
    uint256 public constant PERCENTUAL_PRIMEIRA_PARCELA = 50;
    uint256 public constant MAX_PROJETOS_ATIVOS = 3;
    uint256 public constant MAX_PROJETOS_POR_COMUNIDADE = 20;
    int256 public constant REPUTACAO_MINIMA = -2;
    uint256 public constant MAX_DURACAO_MIN = 525_600; // 1 ano, em minutos
    uint256 public constant MAX_TEXTO = 80;

    /// @notice Quem implantou o contrato; cadastra comunidades e verifica plantios.
    // [Recurso: TiposDeDados]
    address payable public immutable dono;

    /// @notice Tempo (segundos) que o dono tem para verificar um plantio registrado.
    // [Recurso: TiposDeDados]
    uint256 public immutable prazoVerificacaoSeg;

    /// @dev Lista de todos os projetos; o id de cada projeto e a sua posicao no array.
    // [Recurso: ArraysEMappings]
    Projeto[] private projetos;

    /// @notice Comunidades por endereco (o getter devolve nome, cadastrada, ativa e reputacao).
    // [Recurso: ArraysEMappings]
    mapping(address => Comunidade) public comunidades;

    /// @notice Quanto (em wei) cada apoiador colocou em cada projeto: contribuicoes[id][apoiador].
    // [Recurso: ArraysEMappings]
    mapping(uint256 => mapping(address => uint256)) public contribuicoes;

    /// @notice Total (em wei) que cada endereco ja apoiou, somando todos os projetos.
    // [Recurso: ArraysEMappings]
    mapping(address => uint256) public totalApoiadoPor;

    /// @dev Trava usada pelo modificador semReentrada.
    // [Recurso: TiposDeDados]
    bool private travado;

    // ------------------------------------------------------------------
    // Eventos
    // ------------------------------------------------------------------

    // [Recurso: EventosEErros]
    /// @notice Uma comunidade foi cadastrada pelo dono.
    event ComunidadeCadastrada(address indexed conta, string nome);
    /// @notice Uma comunidade foi desativada pelo dono.
    event ComunidadeDesativada(address indexed conta);
    /// @notice Um projeto de reflorestamento foi criado.
    event ProjetoCriado(
        uint256 indexed id,
        address indexed comunidade,
        string titulo,
        uint256 meta,
        uint256 prazoCaptacao
    );
    /// @notice Um apoiador contribuiu com ETH para um projeto.
    event ApoioRecebido(uint256 indexed id, address indexed apoiador, uint256 valor);
    /// @notice O projeto atingiu a meta e passou a Financiado.
    event ProjetoFinanciado(uint256 indexed id, uint256 arrecadado, uint256 prazoPlantio);
    /// @notice A comunidade registrou a prova de plantio.
    event PlantioRegistrado(uint256 indexed id, bytes32 prova);
    /// @notice O dono verificou o plantio e liberou o projeto.
    event PlantioVerificado(uint256 indexed id, address indexed verificador);
    /// @notice O projeto foi cancelado e o saldo ficou reembolsavel.
    event ProjetoCancelado(uint256 indexed id, string motivo, uint256 saldoReembolsavel);
    /// @notice A comunidade sacou fundos do projeto.
    event SaqueRealizado(uint256 indexed id, address indexed comunidade, uint256 valor);
    /// @notice Um apoiador recebeu reembolso.
    event ReembolsoRealizado(uint256 indexed id, address indexed apoiador, uint256 valor);

    // ------------------------------------------------------------------
    // Erros personalizados
    // ------------------------------------------------------------------

    // [Recurso: EventosEErros]
    /// @notice O chamador nao tem permissao para a operacao.
    error NaoAutorizado(address chamador);
    /// @notice O id informado nao corresponde a nenhum projeto.
    error ProjetoInexistente(uint256 id);
    /// @notice O projeto nao esta no estado exigido pela operacao.
    error EstadoInvalido(uint256 id, Status atual, Status esperado);
    /// @notice A operacao exige que o prazo ja tenha vencido.
    error PrazoNaoEncerrado(uint256 agora, uint256 prazo);
    /// @notice A operacao exige que o prazo ainda esteja aberto.
    error PrazoEncerrado(uint256 prazo);
    /// @notice O valor enviado e invalido.
    error ValorInvalido();
    /// @notice Nao ha saldo disponivel para saque.
    error NadaASacar();
    /// @notice Nao ha valor a reembolsar para o apoiador.
    error NadaAReembolsar();
    /// @notice A reputacao da comunidade impede novos projetos.
    error ReputacaoInsuficiente(int256 atual);
    /// @notice A comunidade atingiu o limite de projetos ativos.
    error LimiteDeProjetosAtingido(uint256 limite);
    /// @notice A transferencia de ETH falhou.
    error TransferenciaFalhou(address para, uint256 valor);

    // ------------------------------------------------------------------
    // Modificadores
    // ------------------------------------------------------------------

    /// @dev So o dono do contrato pode continuar.
    // [Recurso: Modificadores]
    modifier apenasDono() {
        if (msg.sender != dono) {
            revert NaoAutorizado(msg.sender); // [Recurso: EventosEErros]
        }
        _;
    }

    /// @dev So uma comunidade cadastrada e ativa pode continuar.
    // [Recurso: Modificadores]
    modifier apenasComunidadeAtiva() {
        if (!comunidades[msg.sender].ativa) {
            revert NaoAutorizado(msg.sender); // [Recurso: EventosEErros]
        }
        _;
    }

    /// @dev So a comunidade dona do projeto `id` pode continuar (nao exige estar ativa).
    // [Recurso: Modificadores]
    modifier apenasComunidadeDoProjeto(uint256 id) {
        if (id >= projetos.length) {
            revert ProjetoInexistente(id); // [Recurso: EventosEErros]
        }
        if (projetos[id].comunidade != msg.sender) {
            revert NaoAutorizado(msg.sender); // [Recurso: EventosEErros]
        }
        _;
    }

    /// @dev O projeto `id` precisa existir.
    // [Recurso: Modificadores]
    modifier projetoExiste(uint256 id) {
        if (id >= projetos.length) {
            revert ProjetoInexistente(id); // [Recurso: EventosEErros]
        }
        _;
    }

    /// @dev O projeto `id` precisa estar no estado `esperado`.
    // [Recurso: Modificadores]
    modifier noEstado(uint256 id, Status esperado) {
        if (projetos[id].status != esperado) {
            revert EstadoInvalido(id, projetos[id].status, esperado); // [Recurso: EventosEErros]
        }
        _;
    }

    /// @dev Impede reentrada: a funcao nao pode ser chamada de novo enquanto executa.
    // [Recurso: Modificadores]
    modifier semReentrada() {
        require(!travado, "Reentrada bloqueada"); // [Recurso: EstruturasDeControle]
        travado = true;
        _;
        travado = false;
    }

    // ------------------------------------------------------------------
    // Construtor
    // ------------------------------------------------------------------

    /// @notice Implanta o contrato; quem implanta vira o dono.
    /// @param prazoVerificacaoMin Prazo (em minutos) para o dono verificar um plantio.
    // [Recurso: Funcoes]
    constructor(uint256 prazoVerificacaoMin) {
        require(
            prazoVerificacaoMin > 0 && prazoVerificacaoMin <= MAX_DURACAO_MIN,
            "Prazo de verificacao invalido"
        ); // [Recurso: EstruturasDeControle]
        dono = payable(msg.sender);
        prazoVerificacaoSeg = prazoVerificacaoMin * 1 minutes;
    }

    // ------------------------------------------------------------------
    // Comunidades
    // ------------------------------------------------------------------

    /// @notice Cadastra uma comunidade. Se ja existir, apenas reativa e atualiza o nome,
    ///         mantendo reputacao e historico.
    /// @param conta Endereco que recebera o dinheiro da comunidade.
    /// @param nome Nome da comunidade (nao vazio, ate MAX_TEXTO bytes).
    // [Recurso: Funcoes]
    function cadastrarComunidade(address payable conta, string calldata nome)
        external
        apenasDono // [Recurso: Modificadores]
    {
        require(conta != address(0), "Endereco invalido");
        require(conta != dono, "O dono nao pode ser comunidade");
        require(bytes(nome).length > 0, "Nome vazio");
        require(bytes(nome).length <= MAX_TEXTO, "Nome muito longo");

        Comunidade storage c = comunidades[conta];
        if (c.cadastrada) {
            // Ja existia: so reativa e atualiza o nome (reputacao e projetos ficam).
            c.ativa = true;
            c.nome = nome;
        } else {
            c.nome = nome;
            c.cadastrada = true;
            c.ativa = true;
        } // [Recurso: EstruturasDeControle]

        emit ComunidadeCadastrada(conta, nome); // [Recurso: EventosEErros]
    }

    /// @notice Impede que a comunidade crie NOVOS projetos; os existentes seguem normalmente.
    /// @param conta Endereco da comunidade.
    // [Recurso: Funcoes]
    function desativarComunidade(address conta)
        external
        apenasDono // [Recurso: Modificadores]
    {
        require(comunidades[conta].cadastrada, "Comunidade nao cadastrada");
        comunidades[conta].ativa = false;
        emit ComunidadeDesativada(conta); // [Recurso: EventosEErros]
    }

    /// @notice Lista os ids dos projetos de uma comunidade.
    /// @param conta Endereco da comunidade.
    /// @return ids Ids dos projetos criados por ela.
    // [Recurso: Funcoes]
    function projetosDaComunidade(address conta) external view returns (uint256[] memory ids) {
        return comunidades[conta].projetos;
    }

    // ------------------------------------------------------------------
    // Projetos: criacao e leituras
    // ------------------------------------------------------------------

    /// @notice Cria um projeto de reflorestamento (a comunidade precisa estar ativa).
    /// @param titulo Titulo do projeto (nao vazio, ate MAX_TEXTO bytes).
    /// @param local Local do plantio (nao vazio, ate MAX_TEXTO bytes).
    /// @param quantidadeMudas Quantidade de mudas a plantar (maior que zero).
    /// @param meta Meta de arrecadacao em wei (maior que zero).
    /// @param duracaoCaptacaoMin Duracao da captacao em minutos (1 a MAX_DURACAO_MIN).
    /// @param duracaoPlantioMin Prazo para plantar, em minutos, apos financiar (1 a MAX_DURACAO_MIN).
    /// @return id Id do novo projeto.
    // [Recurso: Funcoes]
    function criarProjeto(
        string calldata titulo,
        string calldata local,
        uint256 quantidadeMudas,
        uint256 meta,
        uint256 duracaoCaptacaoMin,
        uint256 duracaoPlantioMin
    )
        external
        apenasComunidadeAtiva // [Recurso: Modificadores]
        returns (uint256 id)
    {
        _validarDadosProjeto(titulo, local, quantidadeMudas, meta, duracaoCaptacaoMin, duracaoPlantioMin);

        Comunidade storage c = comunidades[msg.sender];
        if (c.reputacao < REPUTACAO_MINIMA) {
            revert ReputacaoInsuficiente(c.reputacao); // [Recurso: EventosEErros]
        }
        if (c.projetos.length >= MAX_PROJETOS_POR_COMUNIDADE) {
            revert LimiteDeProjetosAtingido(MAX_PROJETOS_POR_COMUNIDADE); // [Recurso: EventosEErros]
        }
        if (_contarProjetosAtivos(msg.sender) >= MAX_PROJETOS_ATIVOS) {
            revert LimiteDeProjetosAtingido(MAX_PROJETOS_ATIVOS); // [Recurso: EventosEErros]
        }

        id = projetos.length;
        uint256 prazo = block.timestamp + duracaoCaptacaoMin * 1 minutes;

        // [Recurso: StructsEEnums] campos nao informados comecam em zero.
        projetos.push(
            Projeto({
                id: id,
                comunidade: payable(msg.sender),
                titulo: titulo,
                local: local,
                quantidadeMudas: quantidadeMudas,
                meta: meta,
                arrecadado: 0,
                sacado: 0,
                saldoReembolsavel: 0,
                prazoCaptacao: prazo,
                duracaoPlantio: duracaoPlantioMin * 1 minutes,
                prazoPlantio: 0,
                prazoVerificacao: 0,
                contribuicoesReembolsadas: 0,
                totalReembolsado: 0,
                provaPlantio: bytes32(0),
                status: Status.Captando
            })
        );
        c.projetos.push(id); // [Recurso: ArraysEMappings]

        emit ProjetoCriado(id, msg.sender, titulo, meta, prazo); // [Recurso: EventosEErros]
    }

    /// @notice Quantidade total de projetos ja criados.
    /// @return Total de projetos.
    // [Recurso: Funcoes]
    function totalProjetos() public view returns (uint256) {
        return projetos.length;
    }

    /// @notice Devolve todos os dados de um projeto.
    /// @param id Id do projeto.
    /// @return O projeto completo.
    // [Recurso: Funcoes]
    function obterProjeto(uint256 id)
        external
        view
        projetoExiste(id) // [Recurso: Modificadores]
        returns (Projeto memory)
    {
        return projetos[id];
    }

    // ------------------------------------------------------------------
    // Apoio, financiamento e saque
    // ------------------------------------------------------------------

    /// @notice Apoia um projeto em captacao enviando ETH. O apoio que atinge a meta financia o
    ///         projeto na mesma transacao (o excedente e aceito).
    /// @param id Id do projeto.
    // [Recurso: Funcoes]
    function apoiar(uint256 id)
        external
        payable
        projetoExiste(id) // [Recurso: Modificadores]
        noEstado(id, Status.Captando) // [Recurso: Modificadores]
    {
        Projeto storage p = projetos[id];

        if (msg.value == 0) {
            revert ValorInvalido(); // [Recurso: EventosEErros]
        }
        // Aberto enquanto agora < prazo; em prazo ou depois a captacao esta encerrada.
        if (block.timestamp >= p.prazoCaptacao) {
            revert PrazoEncerrado(p.prazoCaptacao); // [Recurso: EventosEErros]
        }

        // Efeitos: registra o apoio.
        p.arrecadado += msg.value;
        contribuicoes[id][msg.sender] += msg.value; // [Recurso: ArraysEMappings]
        totalApoiadoPor[msg.sender] += msg.value;
        emit ApoioRecebido(id, msg.sender, msg.value); // [Recurso: EventosEErros]

        // Bateu a meta: o projeto passa a Financiado e comeca a contar o prazo de plantio.
        if (p.arrecadado >= p.meta) {
            p.status = Status.Financiado;
            p.prazoPlantio = block.timestamp + p.duracaoPlantio;
            emit ProjetoFinanciado(id, p.arrecadado, p.prazoPlantio); // [Recurso: EventosEErros]
        } // [Recurso: EstruturasDeControle]
    }

    /// @notice Calcula a primeira parcela (PERCENTUAL_PRIMEIRA_PARCELA %) de um valor.
    /// @param valor Valor total arrecadado, em wei.
    /// @return A primeira parcela, em wei.
    // [Recurso: Funcoes]
    function calcularPrimeiraParcela(uint256 valor) public pure returns (uint256) {
        return (valor * PERCENTUAL_PRIMEIRA_PARCELA) / 100;
    }

    /// @notice Quanto a comunidade ainda pode sacar do projeto agora.
    /// @dev Financiado/Plantado liberam a primeira parcela; Verificado libera tudo;
    ///      Captando/Cancelado nao liberam nada novo. Resultado = liberado - sacado.
    /// @param id Id do projeto.
    /// @return Valor disponivel, em wei.
    // [Recurso: Funcoes]
    function disponivelParaSaque(uint256 id)
        public
        view
        projetoExiste(id) // [Recurso: Modificadores]
        returns (uint256)
    {
        Projeto storage p = projetos[id];
        uint256 liberado;

        if (p.status == Status.Financiado || p.status == Status.Plantado) {
            liberado = calcularPrimeiraParcela(p.arrecadado);
        } else if (p.status == Status.Verificado) {
            liberado = p.arrecadado;
        } else {
            liberado = p.sacado; // Captando ou Cancelado: nada novo
        } // [Recurso: EstruturasDeControle]

        return liberado - p.sacado;
    }

    /// @notice A comunidade do projeto saca o valor liberado ainda nao sacado.
    /// @dev Checks-effects-interactions: atualiza `sacado` antes de enviar o ETH.
    /// @param id Id do projeto.
    // [Recurso: Funcoes]
    function sacar(uint256 id)
        external
        projetoExiste(id) // [Recurso: Modificadores]
        apenasComunidadeDoProjeto(id) // [Recurso: Modificadores]
        semReentrada // [Recurso: Modificadores]
    {
        // Checks
        uint256 valor = disponivelParaSaque(id);
        if (valor == 0) {
            revert NadaASacar(); // [Recurso: EventosEErros]
        }

        // Effects
        projetos[id].sacado += valor;
        emit SaqueRealizado(id, msg.sender, valor); // [Recurso: EventosEErros]

        // Interactions
        _transferir(payable(msg.sender), valor);
    }

    // ------------------------------------------------------------------
    // Plantio, verificacao, cancelamento e prazos
    // ------------------------------------------------------------------

    /// @notice A comunidade registra a prova do plantio (hash do arquivo) de um projeto Financiado.
    /// @dev Aberto enquanto agora < prazoPlantio. Inicia o prazo de verificacao do dono.
    /// @param id Id do projeto.
    /// @param prova keccak256 do arquivo de prova (nao pode ser zero).
    // [Recurso: Funcoes]
    function registrarPlantio(uint256 id, bytes32 prova)
        external
        projetoExiste(id) // [Recurso: Modificadores]
        apenasComunidadeDoProjeto(id) // [Recurso: Modificadores]
        noEstado(id, Status.Financiado) // [Recurso: Modificadores]
    {
        Projeto storage p = projetos[id];

        require(prova != bytes32(0), "Prova invalida"); // [Recurso: EstruturasDeControle]
        if (block.timestamp >= p.prazoPlantio) {
            revert PrazoEncerrado(p.prazoPlantio); // [Recurso: EventosEErros]
        }

        p.provaPlantio = prova;
        p.prazoVerificacao = block.timestamp + prazoVerificacaoSeg;
        p.status = Status.Plantado;

        emit PlantioRegistrado(id, prova); // [Recurso: EventosEErros]
    }

    /// @notice O dono aprova o plantio: libera o restante do valor e sobe a reputacao em 1.
    /// @dev Aberto enquanto agora < prazoVerificacao.
    /// @param id Id do projeto.
    // [Recurso: Funcoes]
    function verificarPlantio(uint256 id)
        external
        apenasDono // [Recurso: Modificadores]
        projetoExiste(id) // [Recurso: Modificadores]
        noEstado(id, Status.Plantado) // [Recurso: Modificadores]
    {
        Projeto storage p = projetos[id];

        if (block.timestamp >= p.prazoVerificacao) {
            revert PrazoEncerrado(p.prazoVerificacao); // [Recurso: EventosEErros]
        }

        p.status = Status.Verificado;
        comunidades[p.comunidade].reputacao += 1;

        emit PlantioVerificado(id, msg.sender); // [Recurso: EventosEErros]
    }

    /// @notice O dono cancela um projeto: Captando (suspeita, antes de prazoCaptacao),
    ///         Financiado (so depois de prazoPlantio) ou Plantado (prova rejeitada,
    ///         antes de prazoVerificacao).
    /// @dev Toda via do dono penaliza a comunidade em -1 de reputacao. Regra "sem corrida
    ///      apos os prazos": vencido o prazo de Captando ou de Plantado, o dono nao cancela
    ///      mais (PrazoEncerrado) e apenas encerrarPorPrazo decide o desfecho.
    /// @param id Id do projeto.
    /// @param motivo Texto livre explicando o cancelamento.
    // [Recurso: Funcoes]
    function cancelarProjeto(uint256 id, string calldata motivo)
        external
        apenasDono // [Recurso: Modificadores]
        projetoExiste(id) // [Recurso: Modificadores]
    {
        Projeto storage p = projetos[id];

        if (p.status == Status.Captando) {
            // Suspeita: so enquanto a captacao esta aberta; depois so encerrarPorPrazo decide.
            if (block.timestamp >= p.prazoCaptacao) {
                revert PrazoEncerrado(p.prazoCaptacao); // [Recurso: EventosEErros]
            }
            _cancelar(p, motivo, true);
        } else if (p.status == Status.Financiado) {
            // Protege a comunidade: so depois de vencido o prazo de plantio.
            if (block.timestamp < p.prazoPlantio) {
                revert PrazoNaoEncerrado(block.timestamp, p.prazoPlantio); // [Recurso: EventosEErros]
            }
            _cancelar(p, motivo, true);
        } else if (p.status == Status.Plantado) {
            // Prova rejeitada: so enquanto o prazo de verificacao esta aberto.
            if (block.timestamp >= p.prazoVerificacao) {
                revert PrazoEncerrado(p.prazoVerificacao); // [Recurso: EventosEErros]
            }
            _cancelar(p, motivo, true);
        } else {
            // Verificado ou Cancelado: estados finais.
            revert EstadoInvalido(id, p.status, Status.Plantado); // [Recurso: EventosEErros]
        } // [Recurso: EstruturasDeControle]
    }

    /// @notice Qualquer pessoa cancela um projeto cujo prazo da etapa atual venceu.
    /// @dev Captando (meta nao atingida) e Plantado (verificador omisso) nao penalizam;
    ///      Financiado (plantio nao registrado) penaliza em -1.
    /// @param id Id do projeto.
    // [Recurso: Funcoes]
    function encerrarPorPrazo(uint256 id)
        external
        projetoExiste(id) // [Recurso: Modificadores]
    {
        Projeto storage p = projetos[id];

        if (p.status == Status.Captando) {
            if (block.timestamp < p.prazoCaptacao) {
                revert PrazoNaoEncerrado(block.timestamp, p.prazoCaptacao); // [Recurso: EventosEErros]
            }
            _cancelar(p, "Meta nao atingida no prazo", false);
        } else if (p.status == Status.Financiado) {
            if (block.timestamp < p.prazoPlantio) {
                revert PrazoNaoEncerrado(block.timestamp, p.prazoPlantio); // [Recurso: EventosEErros]
            }
            _cancelar(p, "Plantio nao registrado no prazo", true);
        } else if (p.status == Status.Plantado) {
            if (block.timestamp < p.prazoVerificacao) {
                revert PrazoNaoEncerrado(block.timestamp, p.prazoVerificacao); // [Recurso: EventosEErros]
            }
            _cancelar(p, "Verificacao nao realizada no prazo", false);
        } else {
            revert EstadoInvalido(id, p.status, Status.Plantado); // [Recurso: EventosEErros]
        } // [Recurso: EstruturasDeControle]
    }

    // ------------------------------------------------------------------
    // Reembolso
    // ------------------------------------------------------------------

    /// @notice Quanto um apoiador recebe se pedir reembolso agora (0 se o projeto nao estiver
    ///         Cancelado ou se ele nao tiver contribuicao).
    /// @dev Proporcional (contribuicao * saldoReembolsavel / arrecadado); o ultimo apoiador a
    ///      reembolsar recebe o que sobrou (saldoReembolsavel - totalReembolsado), sem resto preso.
    /// @param id Id do projeto.
    /// @param apoiador Endereco do apoiador.
    /// @return Valor reembolsavel, em wei.
    // [Recurso: Funcoes]
    function valorReembolsavel(uint256 id, address apoiador)
        public
        view
        projetoExiste(id) // [Recurso: Modificadores]
        returns (uint256)
    {
        Projeto storage p = projetos[id];
        uint256 c = contribuicoes[id][apoiador];

        // Checa antes de dividir: projeto cancelado sem apoios tem arrecadado == 0.
        if (p.status != Status.Cancelado || c == 0) {
            return 0;
        } // [Recurso: EstruturasDeControle]

        if (p.contribuicoesReembolsadas + c == p.arrecadado) {
            return p.saldoReembolsavel - p.totalReembolsado; // ultimo: absorve o arredondamento
        }
        return (c * p.saldoReembolsavel) / p.arrecadado;
    }

    /// @notice O apoiador recupera sua parte do dinheiro de um projeto Cancelado.
    /// @dev Checks-effects-interactions: zera a contribuicao e atualiza os totais antes de
    ///      enviar o ETH. Valor calculado 0 conclui sem transferir.
    /// @param id Id do projeto.
    // [Recurso: Funcoes]
    function pedirReembolso(uint256 id)
        external
        projetoExiste(id) // [Recurso: Modificadores]
        noEstado(id, Status.Cancelado) // [Recurso: Modificadores]
        semReentrada // [Recurso: Modificadores]
    {
        // Checks
        uint256 c = contribuicoes[id][msg.sender];
        if (c == 0) {
            revert NadaAReembolsar(); // [Recurso: EventosEErros]
        }
        uint256 valor = valorReembolsavel(id, msg.sender);

        // Effects
        Projeto storage p = projetos[id];
        contribuicoes[id][msg.sender] = 0;
        p.contribuicoesReembolsadas += c;
        p.totalReembolsado += valor;
        emit ReembolsoRealizado(id, msg.sender, valor); // [Recurso: EventosEErros]

        // Interactions
        if (valor > 0) {
            _transferir(payable(msg.sender), valor);
        }
    }

    /// @dev Cancela o projeto: grava o saldo reembolsavel (arrecadado - sacado), muda o status
    ///      e, se `penalizar`, tira 1 ponto de reputacao da comunidade.
    // [Recurso: Funcoes]
    function _cancelar(Projeto storage p, string memory motivo, bool penalizar) internal {
        p.saldoReembolsavel = p.arrecadado - p.sacado;
        p.status = Status.Cancelado;
        if (penalizar) {
            comunidades[p.comunidade].reputacao -= 1;
        } // [Recurso: EstruturasDeControle]
        emit ProjetoCancelado(p.id, motivo, p.saldoReembolsavel); // [Recurso: EventosEErros]
    }

    /// @dev Envia ETH com call{value:} e reverte se a transferencia falhar.
    // [Recurso: Funcoes]
    function _transferir(address payable para, uint256 valor) private {
        (bool ok, ) = para.call{value: valor}("");
        if (!ok) {
            revert TransferenciaFalhou(para, valor); // [Recurso: EventosEErros]
        }
    }

    /// @dev Valida os textos, numeros e duracoes de um novo projeto.
    // [Recurso: Funcoes]
    function _validarDadosProjeto(
        string calldata titulo,
        string calldata local,
        uint256 mudas,
        uint256 meta,
        uint256 durCapMin,
        uint256 durPlantMin
    ) internal pure {
        require(
            bytes(titulo).length > 0 && bytes(titulo).length <= MAX_TEXTO,
            "Titulo invalido"
        ); // [Recurso: EstruturasDeControle]
        require(
            bytes(local).length > 0 && bytes(local).length <= MAX_TEXTO,
            "Local invalido"
        );
        require(mudas > 0, "Quantidade de mudas invalida");
        require(meta > 0, "Meta deve ser maior que zero");
        require(durCapMin > 0 && durCapMin <= MAX_DURACAO_MIN, "Duracao de captacao invalida");
        require(durPlantMin > 0 && durPlantMin <= MAX_DURACAO_MIN, "Duracao de plantio invalida");
    }

    /// @dev Conta os projetos da comunidade em Captando, Financiado ou Plantado.
    // [Recurso: Funcoes]
    function _contarProjetosAtivos(address conta) internal view returns (uint256 ativos) {
        uint256[] storage ids = comunidades[conta].projetos;
        for (uint256 i = 0; i < ids.length; i++) { // [Recurso: EstruturasDeControle]
            Status s = projetos[ids[i]].status;
            if (s == Status.Captando || s == Status.Financiado || s == Status.Plantado) {
                ativos++;
            }
        }
    }
}
