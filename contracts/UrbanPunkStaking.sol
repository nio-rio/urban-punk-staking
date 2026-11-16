// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title UrbanPunkStaking
/// @notice Custodial ERC-721 staking for the Urban Punk Official collection.
/// Stakers lock NFTs and earn a fixed rate of reward tokens per NFT per day.
/// Rewards accrue in real time and are claimable at any time.
contract UrbanPunkStaking is IERC721Receiver, Ownable2Step, Pausable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    IERC721 public immutable nft;
    IERC20 public immutable rewardToken;

    uint256 public constant SECONDS_PER_DAY = 86400;

    /// @notice Upper bound on the reward rate (guards against an accidental overflow DoS).
    uint256 public constant MAX_RATE = 1_000_000e18; // 1,000,000 SOHO / NFT / day

    /// @notice Reward tokens earned per staked NFT per day (18-decimal units).
    uint256 public rewardPerTokenPerDay;

    /// @notice Total NFTs currently staked.
    uint256 public totalStaked;

    /// @notice tokenId => address that staked it.
    mapping(uint256 => address) public stakerOf;

    /// @notice user => number of NFTs staked.
    mapping(address => uint256) public stakedCount;

    /// @notice user => last timestamp rewards were accrued for them.
    mapping(address => uint256) public lastRewardTime;

    /// @notice user => accrued but unclaimed rewards.
    mapping(address => uint256) public pendingRewards;

    /// @notice user => token IDs they currently have staked (for enumeration in the UI).
    mapping(address => uint256[]) private _stakedIds;

    EnumerableSet.AddressSet private _stakers;

    event Staked(address indexed user, uint256[] tokenIds);
    event Unstaked(address indexed user, uint256[] tokenIds);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardRateUpdated(uint256 newRate);
    event Funded(uint256 amount);

    constructor(
        address nft_,
        address rewardToken_,
        uint256 rewardPerTokenPerDay_
    ) Ownable(msg.sender) {
        require(nft_ != address(0), "zero nft");
        require(rewardToken_ != address(0), "zero token");
        nft = IERC721(nft_);
        rewardToken = IERC20(rewardToken_);
        require(rewardPerTokenPerDay_ <= MAX_RATE, "rate too high");
        rewardPerTokenPerDay = rewardPerTokenPerDay_;
    }

    // ---------------------------------------------------------------------
    // Reward math (divide last to avoid per-second precision loss)
    // ---------------------------------------------------------------------

    function _update(address user) internal {
        uint256 earned = stakedCount[user] *
            rewardPerTokenPerDay *
            (block.timestamp - lastRewardTime[user]) /
            SECONDS_PER_DAY;
        pendingRewards[user] += earned;
        lastRewardTime[user] = block.timestamp;
    }

    function pendingRewardsOf(address user) public view returns (uint256) {
        return
            pendingRewards[user] +
            (stakedCount[user] *
                rewardPerTokenPerDay *
                (block.timestamp - lastRewardTime[user])) /
            SECONDS_PER_DAY;
    }

    /// @notice Token IDs currently staked by `user`.
    function stakedTokenIdsOf(address user) external view returns (uint256[] memory) {
        return _stakedIds[user];
    }

    // ---------------------------------------------------------------------
    // Staking
    // ---------------------------------------------------------------------

    function stake(uint256[] calldata tokenIds) external whenNotPaused nonReentrant {
        require(tokenIds.length > 0, "empty");
        _update(msg.sender);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 id = tokenIds[i];
            require(stakerOf[id] == address(0), "already staked");
            stakerOf[id] = msg.sender;
            _stakedIds[msg.sender].push(id);
        }
        stakedCount[msg.sender] += tokenIds.length;
        totalStaked += tokenIds.length;
        _stakers.add(msg.sender);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            nft.safeTransferFrom(msg.sender, address(this), tokenIds[i]);
        }
        emit Staked(msg.sender, tokenIds);
    }

    function unstake(uint256[] calldata tokenIds) external nonReentrant {
        require(tokenIds.length > 0, "empty");
        _update(msg.sender);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 id = tokenIds[i];
            require(stakerOf[id] == msg.sender, "not staker");
            stakerOf[id] = address(0);
            _removeStaked(msg.sender, id);
        }
        stakedCount[msg.sender] -= tokenIds.length;
        totalStaked -= tokenIds.length;
        if (stakedCount[msg.sender] == 0) _stakers.remove(msg.sender);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            nft.safeTransferFrom(address(this), msg.sender, tokenIds[i]);
        }
        emit Unstaked(msg.sender, tokenIds);
    }

    function claim() external nonReentrant {
        _update(msg.sender);
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingRewards[msg.sender] = 0;
        require(rewardToken.transfer(msg.sender, amount), "transfer failed");
        emit RewardsClaimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Remove a token ID from a user's staked list (swap-and-pop).
    function _removeStaked(address user, uint256 id) internal {
        uint256[] storage arr = _stakedIds[user];
        for (uint256 j = 0; j < arr.length; j++) {
            if (arr[j] == id) {
                arr[j] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }
    }

    /// @notice Accrues everyone at the old rate, then switches the rate.
    function setRewardRate(uint256 newRate) external onlyOwner {
        require(newRate <= MAX_RATE, "rate too high");
        address[] memory all = _stakers.values();
        for (uint256 i = 0; i < all.length; i++) _update(all[i]);
        rewardPerTokenPerDay = newRate;
        emit RewardRateUpdated(newRate);
    }

    /// @notice Top up the reward pool (owner must approve this contract first).
    function fundRewards(uint256 amount) external onlyOwner nonReentrant {
        require(rewardToken.transferFrom(msg.sender, address(this), amount), "fund failed");
        emit Funded(amount);
    }

    /// @notice Rescue a token mistakenly sent here (never the reward token).
    function recoverToken(address token, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(rewardToken), "reward token");
        require(IERC20(token).transfer(msg.sender, amount), "recover failed");
    }

    /// @notice Rescue an NFT mistakenly sent here. For the UPO collection, refuses
    /// to move a staked token; for any other collection it is always allowed.
    function recoverNFT(address tokenContract, uint256 tokenId) external onlyOwner nonReentrant {
        if (tokenContract == address(nft)) {
            require(stakerOf[tokenId] == address(0), "staked");
        }
        IERC721(tokenContract).transferFrom(address(this), msg.sender, tokenId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // ERC-721 receiver (required to accept NFT transfers)
    // ---------------------------------------------------------------------

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        require(msg.sender == address(nft), "not the UPO collection");
        return this.onERC721Received.selector;
    }
}
