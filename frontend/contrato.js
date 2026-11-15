// Gerado por scripts/exportar-abi.js. Preencha endereco e blocoDeploy apos o deploy.
const CONTRATO = {
  endereco: "0x0000000000000000000000000000000000000000",
  blocoDeploy: 0,
  abi: [
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "prazoVerificacaoMin",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "enum FlorestaViva.Status",
          "name": "atual",
          "type": "uint8"
        },
        {
          "internalType": "enum FlorestaViva.Status",
          "name": "esperado",
          "type": "uint8"
        }
      ],
      "name": "EstadoInvalido",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "limite",
          "type": "uint256"
        }
      ],
      "name": "LimiteDeProjetosAtingido",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NadaAReembolsar",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NadaASacar",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "chamador",
          "type": "address"
        }
      ],
      "name": "NaoAutorizado",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "prazo",
          "type": "uint256"
        }
      ],
      "name": "PrazoEncerrado",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agora",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "prazo",
          "type": "uint256"
        }
      ],
      "name": "PrazoNaoEncerrado",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "ProjetoInexistente",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "int256",
          "name": "atual",
          "type": "int256"
        }
      ],
      "name": "ReputacaoInsuficiente",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "para",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "valor",
          "type": "uint256"
        }
      ],
      "name": "TransferenciaFalhou",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ValorInvalido",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "apoiador",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "valor",
          "type": "uint256"
        }
      ],
      "name": "ApoioRecebido",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "conta",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "nome",
          "type": "string"
        }
      ],
      "name": "ComunidadeCadastrada",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "conta",
          "type": "address"
        }
      ],
      "name": "ComunidadeDesativada",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "prova",
          "type": "bytes32"
        }
      ],
      "name": "PlantioRegistrado",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "verificador",
          "type": "address"
        }
      ],
      "name": "PlantioVerificado",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "motivo",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "saldoReembolsavel",
          "type": "uint256"
        }
      ],
      "name": "ProjetoCancelado",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "comunidade",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "titulo",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "meta",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "prazoCaptacao",
          "type": "uint256"
        }
      ],
      "name": "ProjetoCriado",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "arrecadado",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "prazoPlantio",
          "type": "uint256"
        }
      ],
      "name": "ProjetoFinanciado",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "apoiador",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "valor",
          "type": "uint256"
        }
      ],
      "name": "ReembolsoRealizado",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "comunidade",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "valor",
          "type": "uint256"
        }
      ],
      "name": "SaqueRealizado",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "MAX_DURACAO_MIN",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_PROJETOS_ATIVOS",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_PROJETOS_POR_COMUNIDADE",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_TEXTO",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "PERCENTUAL_PRIMEIRA_PARCELA",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "REPUTACAO_MINIMA",
      "outputs": [
        {
          "internalType": "int256",
          "name": "",
          "type": "int256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "apoiar",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address payable",
          "name": "conta",
          "type": "address"
        },
        {
          "internalType": "string",
          "name": "nome",
          "type": "string"
        }
      ],
      "name": "cadastrarComunidade",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "valor",
          "type": "uint256"
        }
      ],
      "name": "calcularPrimeiraParcela",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "pure",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "motivo",
          "type": "string"
        }
      ],
      "name": "cancelarProjeto",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "comunidades",
      "outputs": [
        {
          "internalType": "string",
          "name": "nome",
          "type": "string"
        },
        {
          "internalType": "bool",
          "name": "cadastrada",
          "type": "bool"
        },
        {
          "internalType": "bool",
          "name": "ativa",
          "type": "bool"
        },
        {
          "internalType": "int256",
          "name": "reputacao",
          "type": "int256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "contribuicoes",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "titulo",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "local",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "quantidadeMudas",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "meta",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "duracaoCaptacaoMin",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "duracaoPlantioMin",
          "type": "uint256"
        }
      ],
      "name": "criarProjeto",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "conta",
          "type": "address"
        }
      ],
      "name": "desativarComunidade",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "disponivelParaSaque",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "dono",
      "outputs": [
        {
          "internalType": "address payable",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "encerrarPorPrazo",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "obterProjeto",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "id",
              "type": "uint256"
            },
            {
              "internalType": "address payable",
              "name": "comunidade",
              "type": "address"
            },
            {
              "internalType": "string",
              "name": "titulo",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "local",
              "type": "string"
            },
            {
              "internalType": "uint256",
              "name": "quantidadeMudas",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "meta",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "arrecadado",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "sacado",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "saldoReembolsavel",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "prazoCaptacao",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "duracaoPlantio",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "prazoPlantio",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "prazoVerificacao",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "contribuicoesReembolsadas",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "totalReembolsado",
              "type": "uint256"
            },
            {
              "internalType": "bytes32",
              "name": "provaPlantio",
              "type": "bytes32"
            },
            {
              "internalType": "enum FlorestaViva.Status",
              "name": "status",
              "type": "uint8"
            }
          ],
          "internalType": "struct FlorestaViva.Projeto",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "pedirReembolso",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "prazoVerificacaoSeg",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "conta",
          "type": "address"
        }
      ],
      "name": "projetosDaComunidade",
      "outputs": [
        {
          "internalType": "uint256[]",
          "name": "ids",
          "type": "uint256[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "prova",
          "type": "bytes32"
        }
      ],
      "name": "registrarPlantio",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "sacar",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "totalApoiadoPor",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "totalProjetos",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "apoiador",
          "type": "address"
        }
      ],
      "name": "valorReembolsavel",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "verificarPlantio",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
};
