import { brandHead } from "./brand.js";

// Public landing page served at "/". Marketing surface for the bot: brand, what
// Nancy does, and a one-tap "Open in Telegram" CTA. No app state — safe to cache.
export function renderLandingPage(botUsername = "nancy_bsc_bot"): string {
  const telegramUrl = `https://t.me/${botUsername}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead()}
  <title>Nancy, the Golden Girl of Binance</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0c0f14;
      --panel: #161b22;
      --line: #2a313c;
      --text: #f7f3e8;
      --muted: #aab2bd;
      --gold: #f0b90b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-block-size: 100dvh;
      background: radial-gradient(1200px 600px at 50% -10%, rgba(240,185,11,0.14), transparent 60%), var(--bg);
      color: var(--text);
      font: 16px/1.6 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .shell { inline-size: min(960px, 92%); margin-inline: auto; padding-block: 40px 56px; }
    header { display: flex; align-items: center; gap: 10px; font-weight: 700; }
    header .dot { color: var(--gold); font-size: 22px; }
    .hero { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 32px; align-items: center; margin-block: 40px 28px; }
    @media (max-width: 720px) { .hero { grid-template-columns: 1fr; text-align: center; } }
    h1 { font-size: clamp(30px, 6vw, 52px); line-height: 1.05; margin: 0 0 14px; letter-spacing: -0.5px; }
    h1 .gold { color: var(--gold); }
    .lede { color: var(--muted); font-size: 18px; margin: 0 0 24px; max-inline-size: 46ch; }
    @media (max-width: 720px) { .lede { margin-inline: auto; } }
    .cta { display: inline-flex; align-items: center; gap: 8px; background: var(--gold); color: #0c0f14; font-weight: 800; text-decoration: none; padding: 14px 22px; border-radius: 10px; }
    .cta:hover { filter: brightness(1.06); }
    .ghost { display: inline-flex; align-items: center; margin-inline-start: 12px; color: var(--text); text-decoration: none; font-weight: 600; opacity: 0.85; }
    .ghost:hover { opacity: 1; }
    .portrait { justify-self: center; max-inline-size: 280px; inline-size: 100%; border-radius: 16px; border: 1px solid var(--line); box-shadow: 0 24px 60px rgb(0 0 0 / 45%); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-block: 36px 28px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px; }
    .card h3 { margin: 0 0 6px; font-size: 16px; }
    .card p { margin: 0; color: var(--muted); font-size: 14px; }
    .steps { color: var(--muted); font-size: 15px; padding-inline-start: 20px; }
    .steps li { margin-block: 6px; }
    footer { margin-block-start: 36px; padding-block-start: 20px; border-block-start: 1px solid var(--line); color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 10px 18px; justify-content: space-between; }
    footer a { color: var(--muted); }
  </style>
</head>
<body>
  <main class="shell">
    <header><span class="dot">💛</span> Nancy</header>

    <section class="hero">
      <div>
        <h1>The <span class="gold">Golden Girl</span> of Binance</h1>
        <p class="lede">Your Telegram group's shared BSC trading desk — a Safe multisig the owners control, pooled BNB with share-based accounting, and on-chain trades &amp; token launches. Nancy never holds your keys.</p>
        <div>
          <a class="cta" href="${telegramUrl}">💬 Open Nancy in Telegram</a>
          <a class="ghost" href="${telegramUrl}">@${botUsername} →</a>
        </div>
      </div>
      <img class="portrait" src="/og-image.png" alt="Nancy, the Golden Girl of Binance" />
    </section>

    <section class="grid">
      <article class="card"><h3>🔐 Non-custodial</h3><p>Owners control a Safe multisig. Nancy prepares transactions; funds stay in your group's Safe.</p></article>
      <article class="card"><h3>📊 Pooled &amp; tracked</h3><p>Pool BNB into deterministic shares with live NAV, ownership, and PnL per member.</p></article>
      <article class="card"><h3>⚡ Trade &amp; launch</h3><p>Token buys via PancakeSwap and Flap launches become Safe transactions owners sign.</p></article>
      <article class="card"><h3>🤖 Right in Telegram</h3><p>Button-driven — no addresses to type — plus a live analytics Mini App.</p></article>
    </section>

    <section>
      <h3>Three taps to get going</h3>
      <ol class="steps">
        <li>Generate or link an owner wallet (your key, never stored).</li>
        <li>Create your group Safe and deploy it from your own wallet.</li>
        <li>Init the pool, deposit BNB, and watch your share grow.</li>
      </ol>
    </section>

    <footer>
      <span>Nancy is infrastructure only — no profit, token, or execution guarantees.</span>
      <a href="${telegramUrl}">Open in Telegram</a>
    </footer>
  </main>
</body>
</html>`;
}
