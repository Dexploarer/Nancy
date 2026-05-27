# The Family Bot

Telegram MVP for BSC group trading wallets and Flap token launches.

## MVP surface

- Link one Safe-style group wallet per Telegram group.
- Link Telegram users to Safe owner wallets with signed nonces.
- Restrict group wallet setup, Flap metadata, Flap launches, and execution to Telegram group admins.
- Create group trade proposals for Flap bonding-curve tokens.
- Route migrated Flap tokens and regular BSC tokens through PancakeSwap V2.
- Run token risk checks before buy proposals.
- Add a minimal platform fee leg to bot-built trade proposals.
- Upload Flap token metadata to IPFS through Pinata.
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

For production, set `PUBLIC_BASE_URL` and `TELEGRAM_WEBHOOK_SECRET`. The process starts an HTTP server with `/health`, `/telegram/<secret>`, and `/sign/<safeSubmissionId>`.

See [docs/production-checklist.md](docs/production-checklist.md) for deployment gates.

## Telegram commands

```text
/start
/link_start <ownerAddress>
/link_submit <ownerAddress> <signature>
/safe_create <threshold> <owner1> [owner2 ...]
/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]
/wallet
/buy <tokenAddress> <bnbAmount> [slippageBps]
/proposal <proposalId>
/flap_metadata <name>|<symbol>|<description>|<imageUri>|[website]|[telegram]|[x]
/flap_launch <name>|<symbol>|<metadataCid>|<buyTaxBps>|<sellTaxBps>|<taxDays>|<recipient:bps,recipient:bps>|<initialBuyBnb>
/safe_prepare trade <proposalId>
/safe_prepare flap <launchId>
/safe_submit <safeSubmissionId> <ownerAddress> <signature>
/safe_status <safeSubmissionId>
/safe_execute <safeSubmissionId>
```

Example:

```text
/wallet_set 0x1111111111111111111111111111111111111111 2 0x2222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333
/link_start 0x2222222222222222222222222222222222222222
/link_submit 0x2222222222222222222222222222222222222222 0x...
/buy 0x4444444444444444444444444444444444444444 0.25 150
/flap_metadata Family Coin|FAM|Group token launched through Flap|ipfs://bafy-image...
/flap_launch Family Coin|FAM|ipfs://bafy...|200|200|30|0x2222222222222222222222222222222222222222:5000,0x3333333333333333333333333333333333333333:5000|0.1
/safe_prepare trade trade_...
/safe_submit safe_... 0x2222222222222222222222222222222222222222 0x...
/safe_execute safe_...
```

## Safe owner signing flow

1. Create a trade or Flap launch proposal.
2. Run `/safe_prepare trade <proposalId>` or `/safe_prepare flap <launchId>`.
3. The bot returns the Safe transaction hash and transaction service URL.
4. A configured Safe owner signs that hash with `personal_sign` / `eth_sign`, either manually or from `/sign/<safeSubmissionId>`.
5. Paste the signature with `/safe_submit <safeSubmissionId> <ownerAddress> <signature>`. The Telegram user must first link that owner wallet with `/link_start` and `/link_submit`.
6. The first valid owner signature proposes the transaction to Safe Transaction Service. Later signatures are added as confirmations.
7. Use `/safe_status <safeSubmissionId>` to inspect confirmations and execution state.
8. If `SAFE_EXECUTOR_PRIVATE_KEY` is set, run `/safe_execute <safeSubmissionId>` after threshold is met.

## Important limitations

- Flap tokens in the bonding-curve phase route through Flap `Portal`.
- Flap tokens already migrated to DEX and regular BSC tokens route through PancakeSwap V2.
- Safe Transaction Service submission requires a real Safe owner signature. The bot validates that the signature recovers to a configured owner before submitting it.
- Execution can be done from Safe Wallet or by `/safe_execute` using an optional executor gas key. That key only pays gas; it is not a Safe owner key.
- `/safe_create` guides users to Safe Wallet. Fully automated Safe deployment is intentionally not custodial here; users create the Safe with their own signer wallet, then link it with `/wallet_set`.
- `STORAGE_DRIVER=memory` is for local testing. Use the schema in `db/schema.sql` before production.
