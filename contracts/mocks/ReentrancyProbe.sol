// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Test helper: stakes an NFT, then on unstake (when it receives the NFT
/// back) attempts to re-enter `claim()`. Used to prove ReentrancyGuard works.
contract ReentrancyProbe is IERC721Receiver {
    address public stakingAddr;
    bool public attempted;
    bool public reenterSucceeded;

    function setStaking(address s) external {
        stakingAddr = s;
    }

    function stakeOne(address nftAddr, uint256 id) external {
        IERC721(nftAddr).setApprovalForAll(stakingAddr, true);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        (bool ok, ) = stakingAddr.call(abi.encodeWithSignature("stake(uint256[])", ids));
        require(ok, "stake failed");
    }

    function unstakeOne(uint256 id) external {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        (bool ok, ) = stakingAddr.call(abi.encodeWithSignature("unstake(uint256[])", ids));
        require(ok, "unstake failed");
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        if (!attempted) {
            attempted = true;
            (bool ok, ) = stakingAddr.call(abi.encodeWithSignature("claim()"));
            reenterSucceeded = ok;
        }
        return this.onERC721Received.selector;
    }
}
