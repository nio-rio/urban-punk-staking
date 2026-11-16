// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice ERC-20 reward token for the Urban Punk staking protocol.
/// Mintable only by the owner (used to fund the staking reward pool).
contract UrbanPunkToken is ERC20, Ownable2Step {
    /// @notice Hard cap on total supply: 50,000,000 SOHO.
    uint256 public constant MAX_SUPPLY = 50_000_000e18;

    constructor() ERC20("SOHO", "SOHO") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "exceeds max supply");
        _mint(to, amount);
    }
}
