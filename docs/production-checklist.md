# Production Checklist

## Required external services

- Telegram bot token from BotFather.
- BSC RPC URL with reliable `eth_call`, transaction submission, and log support.
- Safe Transaction Service access for BNB Chain.
- Postgres database.
- Public HTTPS base URL for Telegram webhooks and signing pages.
- Optional Pinata JWT when using `/flap_metadata` instead of supplying an existing metadata URI.

## Required environment

```text
APP_ENV=production
STORAGE_DRIVER=postgres
TELEGRAM_BOT_TOKEN=...
BSC_CHAIN_ID=56
BSC_RPC_URL=...
PLATFORM_FEE_RECIPIENT=...
PLATFORM_COMMISSION_RECEIVER=...
DATABASE_URL=...
PUBLIC_BASE_URL=https://...
TELEGRAM_WEBHOOK_SECRET=<random-32-byte-string>
RISK_CHECK_MODE=warn
SAFE_TRANSACTION_SERVICE_URL=https://api.safe.global/tx-service/bnb
SAFE_EXECUTOR_PRIVATE_KEY=<gas-only-deployer-and-executor-key>
```

`SAFE_EXECUTOR_PRIVATE_KEY` pays gas for `/safe_create` and `/safe_execute`; it must not be a Safe owner key.

## Launch steps

1. Run `bun install`.
2. Run `bun run migrate`.
3. Run `bun run verify`.
4. Run `bun run build`.
5. Run `bun run acceptance:live` with production credentials. Add `PINATA_JWT` only if testing `/flap_metadata`.
6. Start with `bun start`.
7. Confirm `GET /health` returns `{ "ok": true }`.
8. Add the bot to a Telegram group and keep privacy mode compatible with slash commands.
9. Link every Safe owner with `/link_start` and `/link_submit`.
10. Use `/safe_group <threshold>`, have owners tap `Join as owner`, then deploy from the inline button.
11. Create a small test proposal, prepare it, sign from `/sign/<safeSubmissionId>`, and verify it appears in Safe Wallet before funding the Safe materially.

## Mainnet release gates

- Test one BSC Safe proposal with no value.
- Test one PancakeSwap buy with the smallest practical value.
- Test one Flap bonding-curve buy with the smallest practical value.
- Test one Flap metadata upload if using Pinata-hosted metadata.
- Test one Flap launch on testnet or with explicitly approved mainnet spend.
- Review GoPlus/DexScreener risk output for at least five known tokens.
- Confirm Telegram group admin checks block a non-admin.
- Confirm a non-linked Telegram user cannot submit a Safe owner signature.
- Confirm `/safe_group` only accepts linked wallets and the deploy receipt contains the expected `ProxyCreation` event.
