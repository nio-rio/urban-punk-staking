// Returns the token IDs a wallet owns from the Urban Punk Official collection.
// UPO is a plain ERC-721 (not enumerable), so the frontend can't enumerate it
// on-chain. This reconstructs ownership from Alchemy's transfer index:
//   owned = incoming transfers (to owner) - outgoing transfers (from owner).
// Uses alchemy_getAssetTransfers, which works on the free tier (unlike
// eth_getLogs archive, which is capped at a 10-block range there).
const UPO = '0x3bf0d09463f3ab326eb213f653325896a8c2cba4';

async function collectTransfers(key, owner, fromOwner) {
  const ids = [];
  let pageKey = null;
  for (let i = 0; i < 50; i++) {
    const params = {
      fromBlock: '0x0',
      toBlock: 'latest',
      category: ['erc721'],
      contractAddresses: [UPO],
      withMetadata: false,
      maxCount: '0x3e8', // 1000
      excludeZeroValue: true,
    };
    if (fromOwner) params.fromAddress = owner;
    else params.toAddress = owner;
    if (pageKey) params.pageKey = pageKey;

    const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Alchemy RPC error');
    const transfers = (data.result && data.result.transfers) || [];
    for (const t of transfers) ids.push(parseInt(t.tokenId, 16));
    pageKey = (data.result && data.result.pageKey) || null;
    if (!pageKey) break;
  }
  return ids;
}

exports.handler = async (event) => {
  const owner = (event.queryStringParameters || {}).owner;
  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid owner address' }) };
  }
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ALCHEMY_API_KEY' }) };
  }

  try {
    const [incoming, outgoing] = await Promise.all([
      collectTransfers(key, owner, false),
      collectTransfers(key, owner, true),
    ]);

    const inc = {};
    for (const id of incoming) inc[id] = (inc[id] || 0) + 1;
    const out = {};
    for (const id of outgoing) out[id] = (out[id] || 0) + 1;

    const owned = Object.keys(inc)
      .filter((id) => (inc[id] || 0) > (out[id] || 0))
      .map(Number)
      .sort((a, b) => a - b);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ owned }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
