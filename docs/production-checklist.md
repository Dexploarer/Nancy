# Production Checklist

## Required external services

- Telegram bot token from BotFather.
- BSC RPC URL with reliable `eth_call`, transaction submission, and log support.
- Safe Transaction Service access for BNB Chain.
- Pinata JWT for Flap metadata uploads.
- Postgres database.
- Public HTTPS base URL for Telegram webhooks and signing pages.

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
PINATA_JWT=...
RISK_CHECK_MODE=warn
SAFE_TRANSACTION_SERVICE_URL=https://api.safe.global/tx-service/bnb
```

`SAFE_EXECUTOR_PRIVATE_KEY` is optional. If set, it pays gas for `/safe_execute`; it must not be a Safe owner key.

## Launch steps

1. Run `npm install`.
2. Run `npm run migrate`.
3. Run `npm run verify`.
4. Run `npm run build`.
5. Start with `npm start`.
6. Confirm `GET /health` returns `{ "ok": true }`.
7. Add the bot to a Telegram group and keep privacy mode compatible with slash commands.
8. Use `/safe_create`, create the Safe in Safe Wallet, then `/wallet_set`.
9. Link every Safe owner with `/link_start` and `/link_submit`.
10. Create a small test proposal, prepare it, sign it, submit it, and verify it appears in Safe Wallet before funding the Safe materially.

## Mainnet release gates

- Test one BSC Safe proposal with no value.
- Test one PancakeSwap buy with the smallest practical value.
- Test one Flap bonding-curve buy with the smallest practical value.
- Test one Flap metadata upload.
- Test one Flap launch on testnet or with explicitly approved mainnet spend.
- Review GoPlus/DexScreener risk output for at least five known tokens.
- Confirm Telegram group admin checks block a non-admin.
- Confirm a non-linked Telegram user cannot submit a Safe owner signature.
