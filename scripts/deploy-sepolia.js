const { ethers } = require('hardhat');
const fs = require('fs');

// Production reward rate: 10 SOHO per NFT per day.
const REWARD_PER_DAY = ethers.parseEther('10');
const NFTS_TO_MINT = 5;
const POOL_FUND = ethers.parseEther('1000000'); // 1,000,000 SOHO in the reward pool

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const NFT = await ethers.getContractFactory('MockNFT');
  const nft = await NFT.deploy();
  await nft.waitForDeployment();

  const Token = await ethers.getContractFactory('UrbanPunkToken');
  const token = await Token.deploy();
  await token.waitForDeployment();

  const Staking = await ethers.getContractFactory('UrbanPunkStaking');
  const staking = await Staking.deploy(
    await nft.getAddress(),
    await token.getAddress(),
    REWARD_PER_DAY,
  );
  await staking.waitForDeployment();

  // Mint test NFTs to the deployer (IDs 1..5).
  for (let i = 0; i < NFTS_TO_MINT; i++) {
    await (await nft.mint(deployer.address)).wait();
  }

  // Fund the reward pool.
  await (await token.mint(await staking.getAddress(), POOL_FUND)).wait();

  const out = {
    mockNft: await nft.getAddress(),
    soho: await token.getAddress(),
    staking: await staking.getAddress(),
    ratePerDay: ethers.formatEther(REWARD_PER_DAY),
    deployer: deployer.address,
    nftIds: Array.from({ length: NFTS_TO_MINT }, (_, i) => i + 1),
    poolSoho: ethers.formatEther(POOL_FUND),
  };

  fs.writeFileSync('deploy-sepolia-output.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
