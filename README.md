# The Family Bot

Telegram MVP for BSC group trading wallets and Flap token launches.

## MVP surface

- Link one Safe-style group wallet per Telegram group.
- Link Telegram users to Safe owner wallets with signed nonces.
- Restrict group wallet setup, Flap metadata, Flap launches, and execution to Telegram group admins.
- Create a BSC Safe from Telegram when `SAFE_EXECUTOR_PRIVATE_KEY` is configured, then bind it to the group automatically.
- Create group trade proposals for Flap bonding-curve tokens.
- Route migrated Flap tokens and regular BSC tokens through PancakeSwap V2.
- Run token risk checks before buy proposals.
- Add a minimal platform fee leg to bot-built trade proposals.
- Optionally upload Flap token metadata to IPFS through Pinata.
- Launch Flap `TOKEN_TAXED_V3` tokens through `VaultPortal` with the official Split Vault.
- Route Flap launch commission to the configured platform wallet through Flap's existing `commissionReceiver`.
- Prepare Safe transactions, collect owner signatures, and submit proposals/confirmations to Safe Transaction Service.

This MVP does not custody user keys, does not deploy custom contracts, and does not implement a custom vault.

## Setup

```bash
bun install
cp .env.example .env
bun run verify
bun run dev
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
/safe_status <safeSubmissionId>
/safe_execute <safeSubmissionId>
```

Example:

```text
/safe_create 2 0x2222222222222222222222222222222222222222 0x3333333333333333333333333333333333333333
/link_start 0x2222222222222222222222222222222222222222
/link_submit 0x2222222222222222222222222222222222222222 0x...
/buy 0x4444444444444444444444444444444444444444 0.25 150
/flap_metadata Family Coin|FAM|Group token launched through Flap|ipfs://bafy-image...
/flap_launch Family Coin|FAM|ipfs://bafy...|200|200|30|0x2222222222222222222222222222222222222222:5000,0x3333333333333333333333333333333333333333:5000|0.1
/safe_prepare trade trade_...
/safe_execute safe_...
```

## Flap metadata

Pinata is only needed for `/flap_metadata`, which uploads token metadata JSON and returns an `ipfs://` URI. `/flap_launch` accepts any metadata URI you already have, so Pinata is not required for trading or launching when metadata is hosted elsewhere.

## Safe creation flow

`/safe_create <threshold> <owner1> [owner2 ...]` deploys a Safe v1.4.1 proxy through SafeProxyFactory on BSC using the configured `SAFE_EXECUTOR_PRIVATE_KEY`. The executor only pays deployment gas and is not added as a Safe owner. After the deployment receipt emits `ProxyCreation`, the bot stores the new Safe as the group wallet.

If you already have a Safe, use `/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]`.

## Safe owner signing flow

1. Create a trade or Flap launch proposal.
2. Run `/safe_prepare trade <proposalId>` or `/safe_prepare flap <launchId>`.
3. The bot returns the Safe transaction hash, transaction service URL, and signing page URL.
4. A linked Safe owner opens `/sign/<safeSubmissionId>`, signs with the owner wallet, and submits from the page. Telegram Web App init data is verified when present; wallet-browser fallback accepts a manually entered Telegram user ID.
5. The first valid owner signature proposes the transaction to Safe Transaction Service. Later signatures are added as confirmations.
6. Use `/safe_status <safeSubmissionId>` to inspect confirmations and execution state.
7. If `SAFE_EXECUTOR_PRIVATE_KEY` is set, run `/safe_execute <safeSubmissionId>` after threshold is met.

## Important limitations

- Flap tokens in the bonding-curve phase route through Flap `Portal`.
- Flap tokens already migrated to DEX and regular BSC tokens route through PancakeSwap V2.
- Safe Transaction Service submission requires a real Safe owner signature. The bot validates that the signature recovers to a configured owner before submitting it.
- Execution can be done from Safe Wallet or by `/safe_execute` using an optional executor gas key. That key only pays gas; it is not a Safe owner key.
- `/safe_create` also uses the optional executor gas key. Without it, create the Safe outside the bot and link it with `/wallet_set`.
- `STORAGE_DRIVER=memory` is for local testing. Use the schema in `db/schema.sql` before production.
