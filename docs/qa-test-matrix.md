# QA Test Matrix

## Automated local coverage

Run:

```bash
bun run verify
```

This runs typecheck, unit tests, integration-style service tests, edge-case tests, and static acceptance.

Covered:

- Safe transaction building, signature normalization, signature sorting, and submission flow.
- Safe group setup with linked wallets and managed wallets.
- Managed wallet generation, encryption, linking, and Safe hash signing.
- Wallet link nonce signing.
- Flap Split Vault recipient encoding, salt generation, launch transaction building, and metadata page behavior.
- Pancake/Flap trade proposal transaction batching.
- Platform fee splitting.
- Token risk blocking.
- Pool accounting math, deposit share minting, queued withdrawals, fee math, NAV snapshots, role gating, and open-position liquidity blocking.
- Verified deposit edge cases through injected RPC responses.
- Safe withdrawal preparation and execution marking through pool accounting.
- Telegram command metadata, Nancy bot identity limits, and duplicate command guards.
- Telegram init data HMAC verification.
- Signing page and pool Mini App rendering.
- App composition with memory storage.

## Live smoke

Run with local runtime up:

```bash
bun run smoke:live
```

Covered:

- Telegram Bot API readback for Nancy name, descriptions, command names, and command descriptions.
- BSC RPC chain ID and latest block.
- Contract bytecode checks for Safe, Flap, Split Vault, PancakeSwap, and WBNB where configured.
- Safe Transaction Service `/about`.
- PancakeSwap quote against BSC mainnet using `LIVE_SMOKE_PANCAKE_TOKEN` or BSC USDT.
- HTTP `/health` and `/pool/live-smoke` when `PUBLIC_BASE_URL` is configured.
- Postgres `select 1` when `STORAGE_DRIVER=postgres`.
- Pinata auth when `PINATA_JWT` is configured.
- Executor gas wallet balance when `SAFE_EXECUTOR_PRIVATE_KEY` is configured.

## Full deterministic simulation

Run:

```bash
bun run sim:full
```

Covered without live spend:

- Telegram group Safe creation using managed owner wallets and a 2-of-2 threshold.
- Safe deployment through a simulated SafeProxyFactory response.
- Deposit receipt verification through simulated BSC transaction/receipt data.
- Pool deposits that produce 10% / 30% / 60% ownership.
- Trader role authorization and member trade rejection.
- Trade proposal Safe preparation, first owner proposal, failed execution before threshold, second owner confirmation, and simulated execution.
- NAV profit update from 100 BNB to 150 BNB with 90 BNB liquid and 60 BNB open positions.
- 50% member withdrawal while positions remain open.
- Withdrawal share burn, queued gross claim, 25 bps withdrawal fee, net payout, Safe threshold approval, execution, final NAV, and final PnL.

The simulation uses production service code with fake external surfaces for deployment, Safe Transaction Service, and BSC deposit receipts. It is deterministic and no-spend.

## Full verification

Run:

```bash
bun run verify:full
```

This runs local verification, build, full deterministic simulation, live acceptance, and live smoke.

## Not fully automated

These require funded keys, real group actions, or explicit spend approval:

- Deploying a real Safe from `/safe_group` or `/safe_create`.
- Executing a real Safe transaction on-chain.
- Performing a real PancakeSwap buy.
- Performing a real Flap bonding-curve buy.
- Launching a real Flap token.
- Full Telegram group inline-button UX with multiple real group members.
- Pinata metadata upload that creates a real third-party artifact.
