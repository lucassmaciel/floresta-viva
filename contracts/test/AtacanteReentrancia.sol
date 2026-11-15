// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Interface minima do FlorestaViva, so o necessario para o ataque.
interface IFlorestaViva {
    function apoiar(uint256 id) external payable;
    function pedirReembolso(uint256 id) external;
}

/// @title AtacanteReentrancia
/// @notice Contrato SOMENTE DE TESTE: tenta chamar pedirReembolso de novo ao receber ETH.
contract AtacanteReentrancia {
    IFlorestaViva public immutable alvo;
    uint256 public idAlvo;

    /// @param _alvo Endereco do FlorestaViva atacado.
    constructor(address _alvo) {
        alvo = IFlorestaViva(_alvo);
    }

    /// @notice Apoia o projeto `id` repassando o ETH enviado.
    /// @param id Id do projeto.
    function apoiar(uint256 id) external payable {
        idAlvo = id;
        alvo.apoiar{value: msg.value}(id);
    }

    /// @notice Pede o reembolso do projeto alvo (inicia o ataque).
    function atacar() external {
        alvo.pedirReembolso(idAlvo);
    }

    /// @dev Ao receber o reembolso, tenta reentrar em pedirReembolso.
    receive() external payable {
        alvo.pedirReembolso(idAlvo);
    }
}
