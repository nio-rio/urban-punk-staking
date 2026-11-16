const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const DAY = 86400;
// Block timestamps aren't second-exact, so treat reward values as equal within 0.01 UPUNK.
const EPS = ethers.parseEther('0.01');

function expectApprox(actual, expected) {
  const diff = actual > expected ? actual - expected : expected - actual;
  expect(diff).to.be.lt(EPS);
}

describe('UrbanPunkStaking', function () {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory('MockNFT');
    const nft = await NFT.deploy();
    await nft.waitForDeployment();

    const Token = await ethers.getContractFactory('UrbanPunkToken');
    const token = await Token.deploy();
    await token.waitForDeployment();

    // Fixed rate: 10 UPUNK per NFT per day.
    const Staking = await ethers.getContractFactory('UrbanPunkStaking');
    const staking = await Staking.deploy(
      await nft.getAddress(),
      await token.getAddress(),
      ethers.parseEther('10'),
    );
    await staking.waitForDeployment();

    return { owner, alice, bob, nft, token, staking };
  }

  it('stakes, accrues fixed-rate rewards, claims, and unstakes', async function () {
    const { alice, nft, token, staking } = await deploy();

    await nft.mint(alice.address);
    await nft.mint(alice.address);

    await nft.connect(alice).setApprovalForAll(await staking.getAddress(), true);
    await staking.connect(alice).stake([1, 2]);

    expect(await staking.stakedCount(alice.address)).to.equal(2n);
    expect(await staking.totalStaked()).to.equal(2n);
    expect(await nft.ownerOf(1)).to.equal(await staking.getAddress());
    expect(await staking.stakedTokenIdsOf(alice.address)).to.deep.equal([1n, 2n]);

    // One day passes.
    await time.increase(DAY);

    // 2 NFTs * 10 UPUNK/day = ~20 UPUNK.
    expectApprox(await staking.pendingRewardsOf(alice.address), ethers.parseEther('20'));

    // Fund the pool and claim.
    await token.mint(await staking.getAddress(), ethers.parseEther('1000'));
    await staking.connect(alice).claim();
    expectApprox(await token.balanceOf(alice.address), ethers.parseEther('20'));

    // Unstake returns the NFTs.
    await staking.connect(alice).unstake([1, 2]);
    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await staking.stakedCount(alice.address)).to.equal(0n);
    expect(await staking.totalStaked()).to.equal(0n);
    expect(await staking.stakedTokenIdsOf(alice.address)).to.deep.equal([]);
  });

  it('rejects staking an NFT that is already staked', async function () {
    const { alice, nft, staking } = await deploy();
    await nft.mint(alice.address);
    await nft.connect(alice).setApprovalForAll(await staking.getAddress(), true);
    await staking.connect(alice).stake([1]);

    await expect(staking.connect(alice).stake([1])).to.be.revertedWith('already staked');
  });

  it('rejects unstaking an NFT staked by someone else', async function () {
    const { alice, bob, nft, staking } = await deploy();
    await nft.mint(alice.address);
    await nft.connect(alice).setApprovalForAll(await staking.getAddress(), true);
    await staking.connect(alice).stake([1]);

    await expect(staking.connect(bob).unstake([1])).to.be.revertedWith('not staker');
  });

  it('rejects staking while paused', async function () {
    const { owner, alice, nft, staking } = await deploy();
    await nft.mint(alice.address);
    await staking.connect(owner).pause();

    await nft.connect(alice).setApprovalForAll(await staking.getAddress(), true);
    await expect(staking.connect(alice).stake([1])).to.be.revertedWithCustomError(
      staking,
      'EnforcedPause',
    );
  });

  it('accrues at the old rate before a rate change', async function () {
    const { owner, alice, nft, token, staking } = await deploy();
    await nft.mint(alice.address);
    await nft.connect(alice).setApprovalForAll(await staking.getAddress(), true);
    await staking.connect(alice).stake([1]);

    // One day at 10/day.
    await time.increase(DAY);

    // Owner raises the rate to 20/day; the first day should accrue at ~10.
    await staking.connect(owner).setRewardRate(ethers.parseEther('20'));

    await token.mint(await staking.getAddress(), ethers.parseEther('1000'));
    await staking.connect(alice).claim();
    expectApprox(await token.balanceOf(alice.address), ethers.parseEther('10'));
  });

  it('blocks reentrancy during unstake', async function () {
    const { nft, token, staking } = await deploy();

    const Probe = await ethers.getContractFactory('ReentrancyProbe');
    const probe = await Probe.deploy();
    await probe.waitForDeployment();
    await probe.setStaking(await staking.getAddress());

    await nft.mint(await probe.getAddress());
    await probe.stakeOne(await nft.getAddress(), 1);

    // Fund the pool and accrue rewards so the reentrant claim() has something to move.
    await token.mint(await staking.getAddress(), ethers.parseEther('1000'));
    await time.increase(DAY);

    await probe.unstakeOne(1);

    expect(await probe.attempted()).to.equal(true);
    expect(await probe.reenterSucceeded()).to.equal(false);
  });

  it('owner can recover a stuck NFT but not a staked one', async function () {
    const { owner, alice, nft, staking } = await deploy();

    // A non-UPO NFT sent directly (would otherwise be stuck).
    const NFT2 = await ethers.getContractFactory('MockNFT');
    const nft2 = await NFT2.deploy();
    await nft2.waitForDeployment();
    await nft2.mint(alice.address);
    await nft2.connect(alice).transferFrom(alice.address, await staking.getAddress(), 1);
    expect(await nft2.ownerOf(1)).to.equal(await staking.getAddress());

    await staking.connect(owner).recoverNFT(await nft2.getAddress(), 1);
    expect(await nft2.ownerOf(1)).to.equal(owner.address);

    // A staked UPO NFT cannot be recovered.
    await nft.mint(alice.address);
    await nft.connect(alice).setApprovalForAll(await staking.getAddress(), true);
    await staking.connect(alice).stake([1]);
    await expect(staking.connect(owner).recoverNFT(await nft.getAddress(), 1)).to.be.revertedWith(
      'staked',
    );
  });

  it('rejects an absurd reward rate', async function () {
    const { owner, staking } = await deploy();
    await expect(staking.connect(owner).setRewardRate(ethers.parseEther('2000000'))).to.be.revertedWith(
      'rate too high',
    );
  });

  it('uses two-step ownership transfer', async function () {
    const { owner, alice, staking } = await deploy();
    await staking.connect(owner).transferOwnership(alice.address);
    expect(await staking.owner()).to.equal(owner.address);
    expect(await staking.pendingOwner()).to.equal(alice.address);
    await staking.connect(alice).acceptOwnership();
    expect(await staking.owner()).to.equal(alice.address);
  });

  it('rejects duplicate token IDs in a single call', async function () {
    const { alice, nft, staking } = await deploy();
    await nft.mint(alice.address);
    await nft.connect(alice).setApprovalForAll(await staking.getAddress(), true);
    await expect(staking.connect(alice).stake([1, 1])).to.be.revertedWith('already staked');

    await nft.mint(alice.address);
    await staking.connect(alice).stake([1, 2]);
    await expect(staking.connect(alice).unstake([1, 1])).to.be.revertedWith('not staker');
  });

  it('enforces the 50M max supply cap', async function () {
    const { owner, token } = await deploy();
    expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther('50000000'));
    await token.mint(owner.address, ethers.parseEther('50000000'));
    await expect(token.mint(owner.address, 1)).to.be.revertedWith('exceeds max supply');
  });
});
