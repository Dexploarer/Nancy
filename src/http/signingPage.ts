import type { SafeSubmission } from "../domain/types.js";

export function renderSigningPage(submission: SafeSubmission): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The Family Safe Signature</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101318; color: #f7f3e8; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { width: min(720px, 100%); border: 1px solid #303744; border-radius: 8px; padding: 24px; background: #171b22; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    p, code { color: #c9d1dc; line-height: 1.5; }
    code { word-break: break-all; }
    button { border: 0; border-radius: 6px; padding: 12px 16px; background: #f0b90b; color: #101318; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    textarea { width: 100%; min-height: 120px; margin-top: 16px; border-radius: 6px; background: #0d1016; color: #f7f3e8; border: 1px solid #303744; padding: 12px; }
  </style>
</head>
<body>
  <main>
    <h1>Sign Safe Transaction</h1>
    <p>Safe: <code>${submission.safeAddress}</code></p>
    <p>Hash: <code id="hash">${submission.safeTxHash}</code></p>
    <button id="sign">Connect wallet and sign</button>
    <textarea id="output" readonly placeholder="Signature output appears here"></textarea>
  </main>
  <script>
    const button = document.getElementById("sign");
    const output = document.getElementById("output");
    button.addEventListener("click", async () => {
      if (!window.ethereum) {
        output.value = "No injected wallet found. Open this page in a wallet browser.";
        return;
      }
      button.disabled = true;
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts[0];
        const signature = await window.ethereum.request({
          method: "personal_sign",
          params: [document.getElementById("hash").textContent, address]
        });
        output.value = "/safe_submit ${submission.id} " + address + " " + signature;
      } catch (error) {
        output.value = error instanceof Error ? error.message : "Signing failed";
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
