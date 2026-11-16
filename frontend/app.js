import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm';

// ---------------------------------------------------------------------------
// Config — fill the two placeholders after deploying the contracts.
// ---------------------------------------------------------------------------
const UPO = '0x3bf0d09463f3ab326eb213f653325896a8c2cba4'; // Urban Punk Official (mainnet)
const SOHO = '0xD6Fd077A7fBEfd67127B2CaD7F37e235Db6Ef752'; // SOHO token (mainnet)
const STAKING = '0xa358865C0ee106309F02279313925549d227bc52'; // Staking (mainnet)

const ZERO = '0x0000000000000000000000000000000000000000';
const CHAIN_ID = '0x1'; // 1 = Ethereum mainnet.

// Minimal ABIs — just the functions the UI needs.
const UPO_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
];
const SOHO_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
];
const STAKING_ABI = [
  'function stake(uint256[] tokenIds)',
  'function unstake(uint256[] tokenIds)',
  'function claim()',
  'function pendingRewardsOf(address) view returns (uint256)',
  'function stakedCount(address) view returns (uint256)',
  'function stakedTokenIdsOf(address) view returns (uint256[])',
  'function totalStaked() view returns (uint256)',
  'function rewardPerTokenPerDay() view returns (uint256)',
];

const $ = (id) => document.getElementById(id);
let signer = null;
let account = null;
let upo = null;
let soho = null;
let staking = null;
let ownedIds = [];
let stakedIds = [];
let ratePerDayNum = 10;

function setMsg(text, cls = '') {
  const el = $('msg');
  el.textContent = text;
  el.className = 'msg ' + cls;
}

function fmt(v) {
  return Number(ethers.formatEther(v)).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

// --- Wallet modal & connection ---

function openWalletModal() {
  $('wallet-modal').classList.add('open');
  $('wallet-modal').setAttribute('aria-hidden', 'false');
}

function closeWalletModal() {
  $('wallet-modal').classList.remove('open');
  $('wallet-modal').setAttribute('aria-hidden', 'true');
}

function walletLabel(wallet) {
  const map = { metamask: 'MetaMask', coinbase: 'Coinbase Wallet', walletconnect: 'WalletConnect', rabby: 'Rabby', trustwallet: 'Trust Wallet' };
  return map[wallet] || wallet;
}

function getProvider(wallet) {
  const p = window.ethereum;
  const providers = (p && p.providers) || [];
  switch (wallet) {
    case 'metamask':
      if (p && p.isMetaMask) return p;
      return providers.find((x) => x.isMetaMask) || null;
    case 'coinbase':
      if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
      return providers.find((x) => x.isCoinbaseWallet) || null;
    case 'rabby':
      return providers.find((x) => x.isRabby) || null;
    case 'trustwallet':
      if (window.trustwallet) return window.trustwallet;
      return providers.find((x) => x.isTrust || x.isTrustWallet) || null;
    default:
      return null;
  }
}

async function connectWallet(wallet) {
  closeWalletModal();
  if (wallet === 'walletconnect') {
    return setMsg('WalletConnect needs a Reown project ID — not wired up yet. Use an installed wallet for now.', 'err');
  }
  const provider = getProvider(wallet);
  if (!provider) {
    return setMsg(`${walletLabel(wallet)} isn't installed in this browser — install it or pick another wallet.`, 'err');
  }
  try {
    await doConnect(provider);
  } catch (e) {
    setMsg('Connect failed: ' + (e.shortMessage || e.message || e), 'err');
  }
}

async function doConnect(provider) {
  // Prompt to connect FIRST — accounts can't be read before this.
  await provider.request({ method: 'eth_requestAccounts' });

  // Ensure the right chain; switch (or add) if needed.
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (chainId !== CHAIN_ID) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
    } catch (switchErr) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_ID,
            chainName: 'Ethereum',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://ethereum-rpc.publicnode.com'],
            blockExplorerUrls: ['https://etherscan.io'],
          }],
        });
      } catch (addErr) {
        return setMsg('Wrong network — add Sepolia (chain 11155111) to your wallet and retry.', 'err');
      }
    }
  }

  const bp = new ethers.BrowserProvider(provider);
  signer = await bp.getSigner();
  account = await signer.getAddress();

  upo = new ethers.Contract(UPO, UPO_ABI, signer);
  soho = SOHO !== ZERO ? new ethers.Contract(SOHO, SOHO_ABI, signer) : null;
  staking = STAKING !== ZERO ? new ethers.Contract(STAKING, STAKING_ABI, signer) : null;

  $('addr').textContent = account.slice(0, 6) + '…' + account.slice(-4);
  $('connect').textContent = 'Connected';
  await refresh();
}

async function refresh() {
  if (!account) return;
  if (!staking) return setMsg('Contracts not deployed yet — fill SOHO + STAKING addresses in app.js.', 'err');

  const staked = await staking.stakedCount(account);
  const pending = await staking.pendingRewardsOf(account);
  const ratePerDay = await staking.rewardPerTokenPerDay();
  const totalStaked = await staking.totalStaked();
  ratePerDayNum = Number(ethers.formatEther(ratePerDay));

  $('staked').textContent = staked.toString();
  $('pending').textContent = fmt(pending) + ' SOHO';
  $('rate').textContent = fmt(ratePerDay) + ' SOHO';
  updateCalc();
  $('soho').textContent = soho ? fmt(await soho.balanceOf(account)) : '0';
  $('nft-status').textContent = `${totalStaked.toString()} total staked in the pool`;
  await updateMetrics(totalStaked);

  await renderNfts();
}

async function renderNfts() {
  const wrap = $('nfts');
  wrap.innerHTML = '';
  ownedIds = [];
  stakedIds = [];

  // 1. Owned (in-wallet) NFTs — available to stake.
  let enumerable = true;
  try {
    const bal = Number(await upo.balanceOf(account));
    for (let i = 0; i < bal; i++) ownedIds.push(Number(await upo.tokenOfOwnerByIndex(account, i)));
  } catch {
    enumerable = false;
  }

  // 2. Staked NFTs — available to unstake.
  try {
    stakedIds = (await staking.stakedTokenIdsOf(account)).map(Number);
  } catch {}

  // Live count + estimated daily earnings.
  const ratePerDay = await staking.rewardPerTokenPerDay();
  const daily = stakedIds.length * Number(ethers.formatEther(ratePerDay));
  $('nft-count').textContent =
    `${ownedIds.length} in wallet · ${stakedIds.length} staked · earning ${daily.toLocaleString('en-US', { maximumFractionDigits: 2 })} SOHO/day`;
  $('stake-all').textContent = `Stake all (${ownedIds.length})`;
  $('unstake-all').textContent = `Unstake all (${stakedIds.length})`;
  $('stake-all').disabled = ownedIds.length === 0;
  $('unstake-all').disabled = stakedIds.length === 0;

  if (!enumerable) {
    $('nft-status').textContent = 'Collection is not enumerable — enter token IDs below to stake.';
    const input = document.createElement('input');
    input.id = 'manual-ids';
    input.placeholder = 'Token IDs, e.g. 12, 34, 56';
    wrap.appendChild(input);
    return;
  }

  const all = [
    ...ownedIds.map((id) => ({ id, staked: false })),
    ...stakedIds.map((id) => ({ id, staked: true })),
  ];
  if (all.length === 0) {
    $('nft-status').textContent = 'No Urban Punk NFTs (owned or staked) in this wallet.';
    return;
  }

  // Cap the tile grid for large wallets; bulk actions handle the rest.
  const MAX_TILES = 30;
  const shown = all.slice(0, MAX_TILES);
  for (const { id, staked } of shown) {
    const div = document.createElement('div');
    div.className = 'nft' + (staked ? ' staked' : '');
    div.dataset.id = id;
    div.dataset.staked = staked ? '1' : '0';
    div.innerHTML = `<div class="id">Punk #${id}</div><div class="st">${staked ? 'Staked' : 'In wallet'}</div>`;
    div.addEventListener('click', () => {
      div.classList.toggle('sel');
      updateButtons();
    });
    wrap.appendChild(div);
  }
  if (all.length > MAX_TILES) {
    const note = document.createElement('p');
    note.className = 'note';
    note.style.margin = '10px 0 0';
    note.textContent = `… and ${all.length - MAX_TILES} more — use "Stake all" / "Unstake all" above.`;
    wrap.appendChild(note);
  }
  updateButtons();
}

function selected(onlyStaked) {
  const manual = $('manual-ids');
  if (manual && manual.value.trim()) {
    return manual.value.split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
  }
  return Array.from(document.querySelectorAll('.nft.sel'))
    .filter((d) => (onlyStaked ? d.dataset.staked === '1' : d.dataset.staked === '0'))
    .map((d) => Number(d.dataset.id));
}

function updateButtons() {
  if ($('manual-ids')) return; // manual-ID mode: keep default button styling
  const sel = Array.from(document.querySelectorAll('.nft.sel'));
  const hasInWallet = sel.some((d) => d.dataset.staked === '0');
  const hasStaked = sel.some((d) => d.dataset.staked === '1');
  $('stake').classList.toggle('ghost', !hasInWallet);
  $('unstake').classList.toggle('ghost', !hasStaked);
}

async function ensureApproved() {
  const approved = await upo.isApprovedForAll(account, STAKING);
  if (!approved) {
    setMsg('Approving staking contract…');
    const tx = await upo.setApprovalForAll(STAKING, true);
    await tx.wait();
  }
}

async function stake() {
  if (!staking) return setMsg('Contracts not deployed yet.', 'err');
  const ids = selected(false);
  if (ids.length === 0) return setMsg('Select at least one in-wallet NFT.', 'err');
  try {
    setMsg('Staking…');
    await ensureApproved();
    const tx = await staking.stake(ids);
    await tx.wait();
    setMsg('Staked ' + ids.length + ' NFT(s) ✓', 'ok');
    await refresh();
  } catch (e) {
    setMsg('Stake failed: ' + (e.shortMessage || e.message || e), 'err');
  }
}

async function unstake() {
  if (!staking) return setMsg('Contracts not deployed yet.', 'err');
  const ids = selected(true);
  if (ids.length === 0) return setMsg('Select at least one staked NFT.', 'err');
  try {
    setMsg('Unstaking…');
    const tx = await staking.unstake(ids);
    await tx.wait();
    setMsg('Unstaked ' + ids.length + ' NFT(s) ✓', 'ok');
    await refresh();
  } catch (e) {
    setMsg('Unstake failed: ' + (e.shortMessage || e.message || e), 'err');
  }
}

async function claim() {
  if (!staking) return setMsg('Contracts not deployed yet.', 'err');
  try {
    setMsg('Claiming…');
    const tx = await staking.claim();
    await tx.wait();
    setMsg('Rewards claimed ✓', 'ok');
    await refresh();
  } catch (e) {
    setMsg('Claim failed: ' + (e.shortMessage || e.message || e), 'err');
  }
}

async function stakeAll() {
  if (!staking) return setMsg('Contracts not deployed yet.', 'err');
  if (ownedIds.length === 0) return setMsg('No in-wallet NFTs to stake.', 'err');
  try {
    await ensureApproved();
    const CHUNK = 80;
    const batches = Math.ceil(ownedIds.length / CHUNK);
    for (let i = 0; i < ownedIds.length; i += CHUNK) {
      const batch = ownedIds.slice(i, i + CHUNK);
      setMsg(`Staking batch ${Math.floor(i / CHUNK) + 1}/${batches} (${batch.length} NFTs)…`);
      const tx = await staking.stake(batch);
      await tx.wait();
    }
    setMsg(`Staked ${ownedIds.length} NFTs ✓`, 'ok');
    await refresh();
  } catch (e) {
    setMsg('Stake failed: ' + (e.shortMessage || e.message || e), 'err');
  }
}

async function unstakeAll() {
  if (!staking) return setMsg('Contracts not deployed yet.', 'err');
  if (stakedIds.length === 0) return setMsg('No staked NFTs to unstake.', 'err');
  try {
    const CHUNK = 80;
    const batches = Math.ceil(stakedIds.length / CHUNK);
    for (let i = 0; i < stakedIds.length; i += CHUNK) {
      const batch = stakedIds.slice(i, i + CHUNK);
      setMsg(`Unstaking batch ${Math.floor(i / CHUNK) + 1}/${batches} (${batch.length} NFTs)…`);
      const tx = await staking.unstake(batch);
      await tx.wait();
    }
    setMsg(`Unstaked ${stakedIds.length} NFTs ✓`, 'ok');
    await refresh();
  } catch (e) {
    setMsg('Unstake failed: ' + (e.shortMessage || e.message || e), 'err');
  }
}

function updateCalc() {
  const n = Math.max(0, Number($('calc-nfts').value) || 0);
  const f = (x) => x.toLocaleString('en-US', { maximumFractionDigits: 2 });
  $('calc-day').textContent = f(n * ratePerDayNum) + ' SOHO';
  $('calc-week').textContent = f(n * ratePerDayNum * 7) + ' SOHO';
  $('calc-month').textContent = f(n * ratePerDayNum * 30) + ' SOHO';
  $('calc-rate').textContent = ratePerDayNum.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function renderStats(totalStaked, supply, cap, pool) {
  const supplyNum = Number(ethers.formatEther(supply));
  const capNum = Number(ethers.formatEther(cap)) || 1;
  const poolNum = Number(ethers.formatEther(pool));
  const f0 = (x) => x.toLocaleString('en-US', { maximumFractionDigits: 0 });

  $('m-cap').textContent = f0(capNum) + ' SOHO';
  $('m-supply').textContent = f0(supplyNum) + ' SOHO';
  $('m-supply-pct').textContent = ((supplyNum / capNum) * 100).toFixed(2) + '% of cap';
  $('m-pool').textContent = f0(poolNum) + ' SOHO';
  $('m-emission').textContent = f0(Number(totalStaked) * ratePerDayNum) + ' SOHO';
  $('supply-fill').style.width = Math.min(100, (supplyNum / capNum) * 100) + '%';

  $('hs-staked').textContent = totalStaked.toString();
  $('hs-pool').textContent = f0(poolNum);
  $('hs-minted').textContent = f0(supplyNum) + ' / ' + f0(capNum);
}

async function updateMetrics(totalStaked) {
  if (!soho || !staking) return;
  try {
    const [supply, cap, pool] = await Promise.all([
      soho.totalSupply(),
      soho.MAX_SUPPLY(),
      soho.balanceOf(await staking.getAddress()),
    ]);
    renderStats(totalStaked, supply, cap, pool);
  } catch {}
}

// Read-only protocol stats — fill the hero + tokenomics before a wallet connects.
const RPC_URL = 'https://ethereum-rpc.publicnode.com';
async function loadProtocolStats() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const token = new ethers.Contract(SOHO, SOHO_ABI, provider);
    const stk = new ethers.Contract(STAKING, STAKING_ABI, provider);
    const [totalStaked, supply, cap, pool, rate] = await Promise.all([
      stk.totalStaked(),
      token.totalSupply(),
      token.MAX_SUPPLY(),
      token.balanceOf(STAKING),
      stk.rewardPerTokenPerDay(),
    ]);
    ratePerDayNum = Number(ethers.formatEther(rate));
    $('hs-rate').textContent = ratePerDayNum;
    renderStats(totalStaked, supply, cap, pool);
  } catch (e) {
    console.error('Protocol stats error:', e);
  }
}
loadProtocolStats();

$('connect').addEventListener('click', openWalletModal);
$('wallet-close').addEventListener('click', closeWalletModal);
$('wallet-backdrop').addEventListener('click', closeWalletModal);
document.querySelectorAll('.wallet-item').forEach((el) => {
  el.addEventListener('click', () => connectWallet(el.dataset.wallet));
});
$('stake').addEventListener('click', stake);
$('unstake').addEventListener('click', unstake);
$('claim').addEventListener('click', claim);
$('stake-all').addEventListener('click', stakeAll);
$('unstake-all').addEventListener('click', unstakeAll);
$('calc-nfts').addEventListener('input', updateCalc);
updateCalc();

// Live polling — refresh accruing rewards without disturbing selection.
setInterval(async () => {
  if (!account || !staking) return;
  try {
    const pending = await staking.pendingRewardsOf(account);
    $('pending').textContent = fmt(pending) + ' SOHO';
  } catch {}
}, 5000);
