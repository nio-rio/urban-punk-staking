// Returns the token IDs a wallet owns from the Urban Punk Official collection.
// UPO is a plain ERC-721 (not enumerable), so the frontend can't enumerate it
// on-chain. This proxies Alchemy's NFT API, keeping the API key server-side.
const UPO = '0x3bf0d09463f3ab326eb213f653325896a8c2cba4';

exports.handler = async (event) => {
  const owner = (event.queryStringParameters || {}).owner;
  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid owner address' }) };
  }
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ALCHEMY_API_KEY' }) };
  }

  const ids = [];
  let pageKey = '';
  try {
    do {
      const qs = `owner=${owner}&contractAddresses[]=${UPO}&withMetadata=false&pageSize=100` +
        (pageKey ? `&pageKey=${encodeURIComponent(pageKey)}` : '');
      const res = await fetch(`https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner?${qs}`);
      if (!res.ok) {
        return { statusCode: res.status, body: JSON.stringify({ error: 'Alchemy error ' + res.status }) };
      }
      const data = await res.json();
      for (const n of (data.ownedNfts || [])) ids.push(Number(n.tokenId));
      pageKey = data.pageKey || '';
    } while (pageKey && ids.length < 10000);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ owned: ids }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
