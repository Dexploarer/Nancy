# Lazy UX Phase 1 — Page buttons + WalletConnect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the copy-paste text links to the link/sign pages with one-tap inline buttons, and let those pages connect a wallet via WalletConnect (deep-links to a phone wallet) when no injected wallet is present.

**Architecture:** A new `pageOpenButton` keyboard helper returns a Telegram **WebApp** button in private chats (in-Telegram, auto identity) and a **URL** button in groups (works where WebApp buttons are disallowed; the `/link/<nonce>` and `/sign/<id>` pages already carry their own context, so no `initData` is required). The two HTML pages (`linkPage.ts`, `signingPage.ts`) gain a `getProvider()` that prefers `window.ethereum` and otherwise initialises `@walletconnect/ethereum-provider` (loaded from an ESM CDN, no bundler) using a new `WALLETCONNECT_PROJECT_ID` config value threaded from `server.ts`.

**Tech Stack:** Bun, TypeScript (NodeNext, strict, `exactOptionalPropertyTypes`), grammy, viem, zod, `@walletconnect/ethereum-provider` via `https://esm.sh`.

**Verification gate:** `bun run verify` (typecheck + test + acceptance:static) must pass at the end of every task that changes code.

---

### Task 1: Add `WALLETCONNECT_PROJECT_ID` to config

**Files:**
- Modify: `src/config.ts`
- Modify: `.env.example`

`config.ts` is the only place env vars are read; it builds optional fields with spreads because of `exactOptionalPropertyTypes`. Follow the existing `publicBaseUrl` pattern exactly.

- [ ] **Step 1: Add the zod field.** In the env schema object (near `PUBLIC_BASE_URL`), add:

```ts
WALLETCONNECT_PROJECT_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
```

- [ ] **Step 2: Add the typed field.** In the `AppConfig` type (near `publicBaseUrl?: string;`) add:

```ts
walletConnectProjectId?: string;
```

- [ ] **Step 3: Map it in `loadConfig`.** Where the returned object spreads optional fields (near the `PUBLIC_BASE_URL` spread) add:

```ts
...(env.WALLETCONNECT_PROJECT_ID === undefined ? {} : { walletConnectProjectId: env.WALLETCONNECT_PROJECT_ID }),
```

- [ ] **Step 4: Document it.** In `.env.example`, add under the public-URL section:

```
WALLETCONNECT_PROJECT_ID=
```

- [ ] **Step 5: Typecheck.** Run: `bun run typecheck` → Expected: PASS (exit 0).

- [ ] **Step 6: Commit.**

```bash
git add src/config.ts .env.example
git commit -m "Add WALLETCONNECT_PROJECT_ID config"
```

---

### Task 2: One-tap buttons for the link & sign pages (remove text URLs)

**Files:**
- Modify: `src/bot/keyboards.ts`
- Modify: `src/bot/bot.ts` (the `link_start` command handler, ~line 85-103)
- Modify: `src/bot/prompts.ts` (the `link_start` flow `execute`, ~line 109-122)
- Modify: `src/bot/formatters.ts` (`formatSafeSubmission` — drop the embedded signing URL line)
- Test: `tests/keyboards.test.ts` (create)

The current `link_start` replies embed the URL as plain text. Replace with a tappable button. `safeSubmissionKeyboard` already returns a URL button — make it WebApp-aware and stop printing the URL in the message body.

- [ ] **Step 1: Write the failing test** — create `tests/keyboards.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { linkPageKeyboard, safeSubmissionKeyboard } from "../src/bot/keyboards.js";

function buttons(kb: { inline_keyboard: { text: string; url?: string; web_app?: { url: string } }[][] }) {
  return kb.inline_keyboard.flat();
}

describe("page-open keyboards", () => {
  it("uses a WebApp button in private chats", () => {
    const kb = linkPageKeyboard("abc", "https://x.test", true);
    const b = buttons(kb)[0]!;
    expect(b.web_app?.url).toBe("https://x.test/link/abc");
    expect(b.url).toBeUndefined();
  });

  it("uses a URL button in group chats", () => {
    const kb = linkPageKeyboard("abc", "https://x.test", false);
    const b = buttons(kb)[0]!;
    expect(b.url).toBe("https://x.test/link/abc");
    expect(b.web_app).toBeUndefined();
  });

  it("builds a signing button from the submission id", () => {
    const kb = safeSubmissionKeyboard("safe_1", "https://x.test", true);
    const b = buttons(kb)[0]!;
    expect(b.web_app?.url).toBe("https://x.test/sign/safe_1");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `bun test tests/keyboards.test.ts` → Expected: FAIL (`linkPageKeyboard` not exported).

- [ ] **Step 3: Add the helpers** to `src/bot/keyboards.ts`. Add a private builder and `linkPageKeyboard`, and replace `safeSubmissionKeyboard`:

```ts
function pageOpenButton(label: string, url: string, preferWebApp: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  return preferWebApp ? keyboard.webApp(label, url) : keyboard.url(label, url);
}

function baseUrl(publicBaseUrl?: string): string {
  return publicBaseUrl?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export function linkPageKeyboard(nonce: string, publicBaseUrl: string | undefined, preferWebApp: boolean): InlineKeyboard {
  const url = `${baseUrl(publicBaseUrl)}/link/${encodeURIComponent(nonce)}`;
  return pageOpenButton("Connect & link wallet", url, preferWebApp);
}

export function safeSubmissionKeyboard(submissionId: string, publicBaseUrl: string | undefined, preferWebApp: boolean): InlineKeyboard {
  const url = `${baseUrl(publicBaseUrl)}/sign/${encodeURIComponent(submissionId)}`;
  return pageOpenButton("Open & sign", url, preferWebApp);
}
```

Note: `safeSubmissionKeyboard` gains a third `preferWebApp` parameter — update both call sites (Step 6).

- [ ] **Step 4: Run the test, expect PASS** — Run: `bun test tests/keyboards.test.ts` → Expected: PASS.

- [ ] **Step 5: Replace the `link_start` text URL with a button** — in `src/bot/bot.ts`, the `link_start` handler currently replies with a multi-line string containing `linkUrl`. Replace the reply with:

```ts
const result = await dependencies.walletLinkService.beginLink(fromId, address);
await ctx.reply(
  ["Tap below, connect this wallet, and sign to prove you control it.", "", "Manual fallback: /link_submit <ownerAddress> <signature>", result.message].join("\n"),
  { reply_markup: linkPageKeyboard(result.link.nonce, dependencies.config.publicBaseUrl, ctx.chat?.type === "private") }
);
```

Add `linkPageKeyboard` to the keyboards import in `bot.ts`; remove the now-unused `base`/`linkUrl` locals.

- [ ] **Step 6: Same for the `link_start` prompt flow** — in `src/bot/prompts.ts`, the `link_start` flow `execute` builds `base` and replies with a text URL. Replace its body with:

```ts
const address = parseAddress(required(values, 0));
const result = await c.deps.walletLinkService.beginLink(c.telegramUserId, address);
await c.reply(
  ["Tap below, connect this wallet, and sign.", "", "Manual fallback: /link_submit <ownerAddress> <signature>", result.message].join("\n"),
  linkPageKeyboard(result.link.nonce, c.deps.config.publicBaseUrl, false)
);
```

(`PromptReply` runs in the chat where the prompt lives — pass `false` so groups get a URL button; DM links still work as a URL button too.) Add `linkPageKeyboard` to the keyboards import in `prompts.ts`. Update the `safe_prepare` flow's `safeSubmissionKeyboard(...)` call to pass a third arg `false`.

- [ ] **Step 7: Update the other `safeSubmissionKeyboard` call site** — in `src/bot/bot.ts` (the `safe_prepare` command handler) pass `ctx.chat?.type === "private"` as the third argument.

- [ ] **Step 8: Drop the signing URL from the message body** — open `src/bot/formatters.ts`, find `formatSafeSubmission`, and remove the line that embeds the signing page URL (the `Open ${signingUrl}` / `${...}/sign/${...}` line) so the URL is only reachable via the button. Keep the rest of the owner-flow text. Adjust the function signature if `publicBaseUrl` becomes unused (drop the parameter and its call-site arguments).

- [ ] **Step 9: Verify** — Run: `bun run verify` → Expected: PASS (75+ tests). Fix any compile errors from the signature changes.

- [ ] **Step 10: Commit.**

```bash
git add src/bot/keyboards.ts src/bot/bot.ts src/bot/prompts.ts src/bot/formatters.ts tests/keyboards.test.ts
git commit -m "Replace copy-paste link/sign URLs with one-tap buttons"
```

---

### Task 3: WalletConnect fallback on the link page

**Files:**
- Modify: `src/http/linkPage.ts` (`renderLinkPage` gains a `walletConnectProjectId?` param)
- Modify: `src/http/server.ts` (pass `config.walletConnectProjectId` into `renderLinkPage`)
- Test: `tests/linkPage.test.ts` (create)

The page must prefer the injected provider, else open WalletConnect (deep-links to a phone wallet). Loaded as an ESM module from a CDN — no bundler.

- [ ] **Step 1: Write the failing test** — create `tests/linkPage.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { renderLinkPage } from "../src/http/linkPage.js";

const link = {
  telegramUserId: "1",
  address: "0x1111111111111111111111111111111111111111",
  nonce: "nonce123",
  status: "pending" as const,
  createdAt: new Date("2026-05-28T00:00:00Z")
};

describe("renderLinkPage", () => {
  it("includes the WalletConnect provider and project id when configured", () => {
    const html = renderLinkPage(link, "proj_abc");
    expect(html).toContain("@walletconnect/ethereum-provider");
    expect(html).toContain("proj_abc");
  });

  it("omits the WalletConnect project id when not configured", () => {
    const html = renderLinkPage(link, undefined);
    expect(html).not.toContain("@walletconnect/ethereum-provider");
    expect(html).toContain(link.address);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `bun test tests/linkPage.test.ts` → Expected: FAIL (`renderLinkPage` takes one arg / no WC string).

- [ ] **Step 3: Implement.** Change the signature to `renderLinkPage(link: WalletLink, walletConnectProjectId?: string)`. Add `const wcProjectJson = JSON.stringify(walletConnectProjectId ?? "");` near the other `JSON.stringify` lines. Convert the existing `<script>` to `<script type="module">` and replace the injected-only logic with a provider resolver. Insert, at the top of the module script:

```js
const WC_PROJECT_ID = ${wcProjectJson};
let wcProvider = null;
async function getProvider() {
  if (window.ethereum) return window.ethereum;
  if (!WC_PROJECT_ID) throw new Error("No injected wallet found. Open in your wallet's in-app browser, or set up WalletConnect.");
  const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2");
  wcProvider = await EthereumProvider.init({ projectId: WC_PROJECT_ID, chains: [56], showQrModal: true, methods: ["eth_requestAccounts", "personal_sign"], events: ["accountsChanged", "chainChanged"] });
  await wcProvider.connect();
  return wcProvider;
}
```

Then in the click handler, replace the `if (!window.ethereum) {...}` guard and the two `window.ethereum.request(...)` calls with:

```js
const provider = await getProvider();
const accounts = await provider.request({ method: "eth_requestAccounts" });
// ...existing address check...
const signature = await provider.request({ method: "personal_sign", params: [message, address] });
```

Keep the existing address-match check, fetch POST to `/api/wallet-links/.../signatures`, and output handling unchanged.

- [ ] **Step 4: Run the test, expect PASS** — Run: `bun test tests/linkPage.test.ts` → Expected: PASS.

- [ ] **Step 5: Thread the project id from `server.ts`** — find the `/link/` route handler that calls `renderLinkPage(link)` and change it to `renderLinkPage(link, config.walletConnectProjectId)`. (The handler already has `config` in scope via `createFetchHandler(app, config)`.)

- [ ] **Step 6: Verify** — Run: `bun run verify` → Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/http/linkPage.ts src/http/server.ts tests/linkPage.test.ts
git commit -m "Add WalletConnect fallback to the wallet-link page"
```

---

### Task 4: WalletConnect fallback on the signing page

**Files:**
- Modify: `src/http/signingPage.ts` (`renderSigningPage` gains a `walletConnectProjectId?` param)
- Modify: `src/http/server.ts` (pass `config.walletConnectProjectId` into `renderSigningPage`)
- Test: `tests/signingPage.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `tests/signingPage.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { renderSigningPage } from "../src/http/signingPage.js";

const submission = {
  id: "safe_1",
  safeAddress: "0x2222222222222222222222222222222222222222",
  safeTxHash: "0x" + "0".repeat(64)
} as Parameters<typeof renderSigningPage>[0];

describe("renderSigningPage", () => {
  it("includes the WalletConnect provider when configured", () => {
    expect(renderSigningPage(submission, "proj_abc")).toContain("@walletconnect/ethereum-provider");
  });
  it("omits it when not configured", () => {
    expect(renderSigningPage(submission, undefined)).not.toContain("@walletconnect/ethereum-provider");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `bun test tests/signingPage.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implement.** Mirror Task 3: change the signature to `renderSigningPage(submission: SafeSubmission, walletConnectProjectId?: string)`, add `const wcProjectJson = JSON.stringify(walletConnectProjectId ?? "");`, convert to `<script type="module">`, add the same `getProvider()` helper, and replace the `window.ethereum` guard + the two `window.ethereum.request(...)` calls with `const provider = await getProvider();` then `provider.request(...)`. Leave the Telegram-user-id input, `initData`, localStorage, and the POST to `/api/safe-submissions/.../signatures` unchanged.

- [ ] **Step 4: Run the test, expect PASS** — Run: `bun test tests/signingPage.test.ts` → Expected: PASS.

- [ ] **Step 5: Thread the project id from `server.ts`** — change the `/sign/` route's `renderSigningPage(submission)` call to `renderSigningPage(submission, config.walletConnectProjectId)`.

- [ ] **Step 6: Verify** — Run: `bun run verify` → Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/http/signingPage.ts src/http/server.ts tests/signingPage.test.ts
git commit -m "Add WalletConnect fallback to the Safe signing page"
```

---

### Task 5: Static-acceptance assertion + live verification

**Files:**
- Modify: `src/qa/staticAcceptance.ts`

- [ ] **Step 1: Add a page assertion.** In `staticAcceptance.ts`, after the existing page checks, render the link page with a project id and assert the WalletConnect wiring is present. Use the existing throwing-assert style of that file:

```ts
import { renderLinkPage } from "../http/linkPage.js";
// near the other assertions:
const wcLinkPage = renderLinkPage(
  { telegramUserId: "1", address: "0x1111111111111111111111111111111111111111", nonce: "n", status: "pending", createdAt: new Date(0) },
  "static-acceptance-project"
);
if (!wcLinkPage.includes("@walletconnect/ethereum-provider") || !wcLinkPage.includes("static-acceptance-project")) {
  throw new Error("[StaticAcceptance] link page missing WalletConnect wiring");
}
```

- [ ] **Step 2: Verify** — Run: `bun run verify` → Expected: PASS.

- [ ] **Step 3: Live check (manual, no spend).** Confirm the running bot serves the WalletConnect-enabled page through the tunnel:

Run: `curl -s "$(grep '^PUBLIC_BASE_URL=' .env | cut -d= -f2-)/link/doesnotexist" -o /dev/null -w "%{http_code}\n"`
Expected: `400` (route served; nonce not found). A full render requires a real pending link; the unit/static checks cover the WalletConnect markup.

- [ ] **Step 4: Restart the bot so the new config + pages load.**

```bash
kill "$(pgrep -f 'bun src/index.ts' | head -1)"; sleep 4; curl -s "http://localhost:4444/health"
```
Expected: `{"ok":true}` (the KeepAlive agent respawns it).

- [ ] **Step 5: Commit.**

```bash
git add src/qa/staticAcceptance.ts
git commit -m "Assert WalletConnect wiring in static acceptance"
```

---

## Self-Review

- **Spec coverage (Area 1 of the spec):** WALLETCONNECT_PROJECT_ID config (Task 1); links → buttons with WebApp-in-private / URL-in-group (Task 2); WalletConnect injected-first fallback on both pages (Tasks 3-4); no text URLs in replies (Task 2 steps 5-8). The group/DM button mechanism is resolved: URL button works universally because `/link/<nonce>` and `/sign/<id>` carry their own context; WebApp is used in private chats for auto-identity. ✓
- **Deferred to later phases:** result action-buttons (P2), choice-button prompts (P3), deposit-by-hash + link-by-connect (P4).
- **Type consistency:** `linkPageKeyboard(nonce, publicBaseUrl?, preferWebApp)` and `safeSubmissionKeyboard(id, publicBaseUrl?, preferWebApp)` are used identically in Tasks 2; `renderLinkPage(link, projectId?)` / `renderSigningPage(submission, projectId?)` defined in Tasks 3-4 and called in `server.ts` with `config.walletConnectProjectId`. ✓
- **Risk:** the `@walletconnect/ethereum-provider` ESM import from `esm.sh` runs only in the browser at click time; if it fails to load, the catch block surfaces the error in the page `output`. Injected wallets are unaffected (the import is lazy, inside `getProvider`).
