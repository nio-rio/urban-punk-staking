# Urban Punk Staking

Custodial ERC-721 staking protocol for the **Urban Punk Official (UPO)** collection
(Ethereum, `0x3bf0d09463f3ab326eb213f653325896a8c2cba4`).

Stakers lock their UPO NFTs and earn a **fixed rate** of a new ERC-20 reward token
(`SOHO`) per NFT per day. Rewards accrue in real time and are claimable anytime.

## Contracts

| Contract | Purpose |
|---|---|
| `UrbanPunkToken` | ERC-20 reward token (name/symbol configurable in constructor). Owner-mintable to fund the reward pool. |
| `UrbanPunkStaking` | Custodial staking: `stake`, `unstake`, `claim`, `pendingRewardsOf`, plus admin (`setRewardRate`, `fundRewards`, `pause`, `recoverToken`). |

Staking is **custodial** — the NFT transfers into the staking contract for the
duration of the stake, and is returned on `unstake`. This is the standard model
for staking an existing collection you don't control (you can't "mark" NFTs
staked without modifying the NFT contract).

## Reward model

- `rewardPerTokenPerDay` — fixed reward per staked NFT per day (18-decimal units).
- Default in the deploy script: **10 SOHO / NFT / day**.
- Rewards accrue proportionally: `stakedCount × rate × elapsedSeconds / 86400`.
- `setRewardRate` accrues every staker at the old rate before switching (no
  retroactive re-pricing).

## Test

```bash
npm install
npx hardhat test
```

5 tests: stake → accrue → claim → unstake, double-stake rejection, non-owner
unstake rejection, pause rejection, and rate-change accrual.

## Deploy (mainnet)

```bash
npx hardhat run scripts/deploy.js --network mainnet
```

Requires `RPC_URL` and a funded deployer key. Before real money:
- confirm the token name/symbol,
- set the final reward rate,
- get the contracts audited,
- fund the reward pool (`UrbanPunkToken.mint(staking, amount)`).

## Notes

- Reward rate and token name/symbol are constructor/deploy args — easy to change.
- `fundRewards(amount)` lets the owner top up the pool from an ERC-20 balance
  (needs `approve` first); alternatively the owner mints straight to the staking
  contract since it holds mint rights.
