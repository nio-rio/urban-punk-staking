require('dotenv').config();
const { ethers } = require('ethers');

const rpc = process.env.MAINNET_RPC_URL;
const pk = process.env.PRIVATE_KEY;

if (!rpc || rpc.includes('YOUR_KEY')) {
  console.log('MAINNET_RPC_URL: NOT SET (or still a placeholder)');
  process.exit(0);
}
console.log('MAINNET_RPC_URL: set ✓');

if (!pk) {
  console.log('PRIVATE_KEY: not set');
  process.exit(0);
}

const wallet = new ethers.Wallet(pk, new ethers.JsonRpcProvider(rpc));
console.log('Wallet address:', wallet.address);

(async () => {
  const bal = await wallet.provider.getBalance(wallet.address);
  console.log('Mainnet balance:', ethers.formatEther(bal), 'ETH');
})().catch((e) => console.error('ERR:', e.message));
