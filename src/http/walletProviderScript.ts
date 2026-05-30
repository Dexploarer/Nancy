// Browser-side snippet shared by the link / sign / deploy / execute pages. Returns a
// `getProvider()` that discovers every injected wallet via EIP-6963 and lets the user
// PICK one (so MetaMask works even when Phantom also injects window.ethereum and would
// otherwise win the global). When a WalletConnect project id is configured it also
// offers WalletConnect (scan / mobile); when it isn't, the page never references the
// WalletConnect bundle at all.
export function walletProviderScript(walletConnectProjectId?: string, chainId = 56): string {
  const wcProjectJson = JSON.stringify(walletConnectProjectId ?? "");
  const wcEnabled = Boolean(walletConnectProjectId);

  // Only emitted when WalletConnect is on, so a disabled feature is never referenced.
  const wcConnect = wcEnabled
    ? `
    let wcProvider = null;
    async function connectWalletConnect() {
      const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2");
      wcProvider = await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        optionalChains: [CHAIN_ID],
        showQrModal: true,
        methods: ["eth_requestAccounts", "personal_sign"],
        events: ["accountsChanged", "chainChanged"]
      });
      await wcProvider.connect();
      return wcProvider;
    }`
    : "";
  const wcOption = wcEnabled
    ? `opts.push({ label: "WalletConnect — scan or mobile", icon: null, pick: connectWalletConnect });`
    : "";

  return `
    const WC_PROJECT_ID = ${wcProjectJson};
    const CHAIN_ID = ${chainId};

    // EIP-6963: collect every injected wallet that announces itself.
    const __wallets = new Map();
    window.addEventListener("eip6963:announceProvider", (e) => {
      if (e && e.detail && e.detail.info && e.detail.provider) __wallets.set(e.detail.info.uuid, e.detail);
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    ${wcConnect}

    // Minimal wallet picker (no innerHTML with wallet-supplied strings).
    function chooseWallet(options) {
      return new Promise((resolve, reject) => {
        const overlay = document.createElement("div");
        overlay.setAttribute("style", "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(8,8,10,0.72);backdrop-filter:blur(4px);padding:18px;");
        const box = document.createElement("div");
        box.setAttribute("style", "inline-size:min(360px,92vw);background:#14171d;border:1px solid #2a313c;border-radius:12px;padding:18px;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f4efe2;");
        const title = document.createElement("div");
        title.textContent = "Choose a wallet";
        title.setAttribute("style", "font-weight:700;font-size:16px;margin:2px 4px 14px;");
        box.appendChild(title);
        options.forEach((opt) => {
          const b = document.createElement("button");
          b.setAttribute("style", "display:flex;align-items:center;gap:12px;inline-size:100%;text-align:start;background:#1b1f27;border:1px solid #2a313c;border-radius:10px;padding:12px 14px;margin-block:6px;color:#f4efe2;font:inherit;font-weight:600;cursor:pointer;");
          if (opt.icon) {
            const img = document.createElement("img");
            img.src = opt.icon; img.width = 26; img.height = 26; img.alt = "";
            img.setAttribute("style", "border-radius:6px;flex:0 0 auto;");
            b.appendChild(img);
          } else {
            const s = document.createElement("span"); s.textContent = "🔌";
            s.setAttribute("style", "inline-size:26px;text-align:center;flex:0 0 auto;");
            b.appendChild(s);
          }
          const label = document.createElement("span");
          label.textContent = opt.label;
          b.appendChild(label);
          b.addEventListener("click", () => { document.body.removeChild(overlay); resolve(opt); });
          box.appendChild(b);
        });
        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.setAttribute("style", "inline-size:100%;background:none;border:0;color:#9c968a;padding:10px;margin-top:6px;cursor:pointer;font:inherit;");
        cancel.addEventListener("click", () => { document.body.removeChild(overlay); reject(new Error("Wallet selection cancelled")); });
        box.appendChild(cancel);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
      });
    }

    async function getProvider() {
      await new Promise((r) => setTimeout(r, 100)); // let EIP-6963 wallets announce
      const opts = [...__wallets.values()].map((d) => ({ label: d.info.name, icon: d.info.icon, pick: () => d.provider }));
      ${wcOption}
      // Offer a legacy injected wallet that didn't announce via EIP-6963 (older / some
      // in-app browsers, or one slower than the wait above) ALONGSIDE WalletConnect —
      // keyed on __wallets.size, not opts.length, since WC already populates opts in prod.
      if (__wallets.size === 0 && window.ethereum) opts.push({ label: "Browser wallet", icon: null, pick: () => window.ethereum });
      if (opts.length === 0) {
        throw new Error("No wallet found. Install MetaMask (or another EVM wallet), or open this page in your wallet's in-app browser.");
      }
      const chosen = opts.length === 1 ? opts[0] : await chooseWallet(opts);
      return await chosen.pick();
    }

    // Pin the wallet to BNB Chain before SENDING a transaction. A picked wallet
    // (e.g. MetaMask) often defaults to Ethereum, so deploy/execute call this first.
    // Message signing (personal_sign for link/sign) is chain-agnostic and skips it.
    async function ensureChain(provider) {
      const target = "0x" + CHAIN_ID.toString(16);
      try {
        const current = await provider.request({ method: "eth_chainId" });
        if (typeof current === "string" && parseInt(current, 16) === CHAIN_ID) return;
      } catch (e) { /* some providers can't report chain before a switch; fall through */ }
      const addParams = {
        56: { chainId: "0x38", chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: ["https://bsc-dataseed.binance.org"], blockExplorerUrls: ["https://bscscan.com"] },
        97: { chainId: "0x61", chainName: "BNB Smart Chain Testnet", nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 }, rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545"], blockExplorerUrls: ["https://testnet.bscscan.com"] }
      }[CHAIN_ID];
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] });
      } catch (err) {
        // 4902 (or wrapped) = chain not yet added to the wallet; add it, which also selects it.
        const code = err && (err.code ?? (err.data && err.data.originalError && err.data.originalError.code));
        if (addParams && (code === 4902 || code === -32603)) {
          await provider.request({ method: "wallet_addEthereumChain", params: [addParams] });
        } else {
          throw err;
        }
      }
    }
  `;
}
