// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/// @notice Minimal enumerable ERC-721 used only in tests to stand in for Urban Punk Official.
contract MockNFT is ERC721Enumerable {
    uint256 private _nextId = 1;

    constructor() ERC721("Mock Urban Punk", "MUP") {}

    function mint(address to) external returns (uint256) {
        uint256 id = _nextId++;
        _mint(to, id);
        return id;
    }
}
