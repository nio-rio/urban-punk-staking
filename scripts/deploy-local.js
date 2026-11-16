const { ethers } = require('hardhat');
const fs = require('fs');

// Demo-only rate: 86,400 SOHO / NFT / day = 1 SOHO / second / NFT, so rewards are
// visible instantly. Production uses 10 SOHO / NFT / day (see scripts/deploy.js).
const DEMO_RATE = ethers.parseEther('86400');
const NFTS_TO_MINT = 5;
const POOL_FUND = ethers.parseEther('1000000'); // 1,000,000 SOHO in the reward pool

// Hardhat's well-known second test account (default mnemonic "test ... junk").
const DEMO_USER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

async function main() {
  const [owner, user] = await ethers.getSigners();

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
    DEMO_RATE,
  );
  await staking.waitForDeployment();

  // Mint demo NFTs to the demo user (IDs 1..5).
  for (let i = 0; i < NFTS_TO_MINT; i++) {
    await (await nft.mint(user.address)).wait();
  }

  // Fund the reward pool.
  await (await token.mint(await staking.getAddress(), POOL_FUND)).wait();

  const out = {
    mockNft: await nft.getAddress(),
    soho: await token.getAddress(),
    staking: await staking.getAddress(),
    ratePerDay: ethers.formatEther(DEMO_RATE),
    demoUser: user.address,
    demoUserPrivateKey: DEMO_USER_PK,
    demoNftIds: Array.from({ length: NFTS_TO_MINT }, (_, i) => i + 1),
    poolSoho: ethers.formatEther(POOL_FUND),
  };

  fs.writeFileSync('deploy-output.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
