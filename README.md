# The Family Bot

Telegram MVP for BSC group trading wallets and Flap token launches.

## MVP surface

- Link one Safe-style group wallet per Telegram group.
- Create group trade proposals for Flap bonding-curve tokens.
- Add a minimal platform fee leg to bot-built trade proposals.
- Launch Flap `TOKEN_TAXED_V3` tokens through `VaultPortal` with the official Split Vault.
- Route Flap launch commission to the configured platform wallet through Flap's existing `commissionReceiver`.
- Prepare Safe transactions, collect owner signatures, and submit proposals/confirmations to Safe Transaction Service.

This MVP does not custody user keys, does not deploy custom contracts, and does not implement a custom vault.

## Setup

```bash
npm install
cp .env.example .env
npm run verify
npm run dev
```

## Telegram commands

```text
/start
/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]
/wallet
/buy <tokenAddress> <bnbAmount> [slippageBps]
/proposal <proposalId>
/flap_launch <name>|<symbol>|<metadataCid>|<buyTaxBps>|<sellTaxBps>|<taxDays>|<recipient:bps,recipient:bps>|<initialBuyBnb>
/safe_prepare trade <proposalId>
/safe_prepare flap <launchId>
/safe_submit <safeSubmissionId> <ownerAddress> <signature>
/safe_status <safeSubmissionId>
```

Example:

```text
/wallet_set 0x1111111111111111111111111111111111111111 2 0x2222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333
/buy 0x4444444444444444444444444444444444444444 0.25 150
/flap_launch Family Coin|FAM|ipfs://bafy...|200|200|30|0x2222222222222222222222222222222222222222:5000,0x3333333333333333333333333333333333333333:5000|0.1
/safe_prepare trade trade_...
/safe_submit safe_... 0x2222222222222222222222222222222222222222 0x...
```

## Safe owner signing flow

1. Create a trade or Flap launch proposal.
2. Run `/safe_prepare trade <proposalId>` or `/safe_prepare flap <launchId>`.
3. The bot returns the Safe transaction hash and transaction service URL.
4. A configured Safe owner signs that hash with `personal_sign` / `eth_sign`.
5. Paste the signature with `/safe_submit <safeSubmissionId> <ownerAddress> <signature>`.
6. The first valid owner signature proposes the transaction to Safe Transaction Service. Later signatures are added as confirmations.
7. Use `/safe_status <safeSubmissionId>` to inspect confirmations and execution state.

## Important limitations

- Flap tokens in the bonding-curve phase route through Flap `Portal`.
- Flap tokens already migrated to DEX are detected, but PancakeSwap routing is left for the next slice.
- Safe Transaction Service submission requires a real Safe owner signature. The bot validates that the signature recovers to a configured owner before submitting it.
- Execution can be done from Safe Wallet after threshold is reached. The MVP does not hold an executor gas key.
- `STORAGE_DRIVER=memory` is for local testing. Use the schema in `db/schema.sql` before production.
