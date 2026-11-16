const { ethers } = require('hardhat');

// Funds the staking reward pool by minting SOHO into the staking contract.
//
// Usage:
//   STAKING=<staking addr> SOHO=<token addr> AMOUNT=20000000 \
//     npx hardhat run scripts/fund-pool.js --network mainnet
//
// AMOUNT defaults to 20,000,000 SOHO. Minting respects the 50M MAX_SUPPLY cap.

async function main() {
  const stakingAddr = process.env.STAKING;
  const sohoAddr = process.env.SOHO;
  const amount = ethers.parseEther(process.env.AMOUNT || '20000000');

  if (!stakingAddr || !sohoAddr) {
    console.error('Set STAKING and SOHO env vars to the deployed addresses.');
    process.exit(1);
  }

  const token = await ethers.getContractAt('UrbanPunkToken', sohoAddr);
  console.log('Minting', ethers.formatEther(amount), 'SOHO into staking', stakingAddr);

  const tx = await token.mint(stakingAddr, amount);
  await tx.wait();

  const pool = await token.balanceOf(stakingAddr);
  const supply = await token.totalSupply();
  const cap = await token.MAX_SUPPLY();
  console.log('Pool balance:', ethers.formatEther(pool), 'SOHO');
  console.log('Total supply:', ethers.formatEther(supply), '/', ethers.formatEther(cap), 'SOHO');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
