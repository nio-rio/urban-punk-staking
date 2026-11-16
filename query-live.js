const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://ethereum-rpc.publicnode.com');

const STAKING = '0xa358865C0ee106309F02279313925549d227bc52';
const SOHO = '0xD6Fd077A7fBEfd67127B2CaD7F37e235Db6Ef752';

const stakingAbi = [
  'function totalStaked() view returns (uint256)',
  'function rewardPerTokenPerDay() view returns (uint256)',
  'function rewardToken() view returns (address)',
  'function nft() view returns (address)',
];
const sohoAbi = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
];

(async () => {
  const s = new ethers.Contract(STAKING, stakingAbi, provider);
  const t = new ethers.Contract(SOHO, sohoAbi, provider);
  const [totalStaked, rate, rewardToken, nft, totalSupply, poolBalance, maxSupply] =
    await Promise.all([
      s.totalStaked(), s.rewardPerTokenPerDay(), s.rewardToken(), s.nft(),
      t.totalSupply(), t.balanceOf(STAKING), t.MAX_SUPPLY(),
    ]);
  console.log('totalStaked:', totalStaked.toString());
  console.log('rewardPerTokenPerDay:', ethers.formatUnits(rate, 18), 'SOHO/NFT/day');
  console.log('rewardToken:', rewardToken);
  console.log('nft:', nft);
  console.log('SOHO totalSupply (minted):', ethers.formatUnits(totalSupply, 18));
  console.log('SOHO in staking pool:', ethers.formatUnits(poolBalance, 18));
  console.log('SOHO MAX_SUPPLY:', ethers.formatUnits(maxSupply, 18));
})().catch(e => { console.error(e.message); process.exit(1); });
