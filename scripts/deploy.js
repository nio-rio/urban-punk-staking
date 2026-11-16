const { ethers } = require('hardhat');
const fs = require('fs');

// Urban Punk Official (UPO) — Ethereum mainnet.
const UPO_NFT = '0x3bf0d09463f3ab326eb213f653325896a8c2cba4';
// Fixed reward rate: 10 SOHO per NFT per day.
const REWARD_PER_DAY = ethers.parseEther('10');

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Deploying with account:', deployer.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  if (balance < ethers.parseEther('0.02')) {
    console.warn('WARNING: low ETH balance — deployment may fail.');
  }

  const Token = await ethers.getContractFactory('UrbanPunkToken');
  const token = await Token.deploy();
  await token.waitForDeployment();
  console.log('Reward token (SOHO):', await token.getAddress());

  const Staking = await ethers.getContractFactory('UrbanPunkStaking');
  const staking = await Staking.deploy(UPO_NFT, await token.getAddress(), REWARD_PER_DAY);
  await staking.waitForDeployment();
  console.log('Staking contract:', await staking.getAddress());

  const out = {
    network: 'mainnet',
    upo: UPO_NFT,
    soho: await token.getAddress(),
    staking: await staking.getAddress(),
    ratePerDay: ethers.formatEther(REWARD_PER_DAY),
    deployer: deployer.address,
  };
  fs.writeFileSync('deploy-mainnet-output.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log('\nNext steps:');
  console.log('  1. Fund the pool:  STAKING=<addr> SOHO=<addr> AMOUNT=20000000 npx hardhat run scripts/fund-pool.js --network mainnet');
  console.log('  2. Verify contracts on Etherscan.');
  console.log('  3. Wire frontend/app.js (addresses + CHAIN_ID "0x1").');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
