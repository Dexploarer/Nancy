// Browser-side snippet shared by the link and sign pages. Returns a `getProvider()`
// that prefers an injected wallet (window.ethereum) and otherwise opens WalletConnect
// (deep-links to a phone wallet) — but only when a project id is configured, so the
// WalletConnect bundle is never referenced when the feature is off.
export function walletProviderScript(walletConnectProjectId?: string, chainId = 56): string {
  const wcProjectJson = JSON.stringify(walletConnectProjectId ?? "");
  const fallback = walletConnectProjectId
    ? `const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2");
      wcProvider = await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        optionalChains: [${chainId}],
        showQrModal: true,
        methods: ["eth_requestAccounts", "personal_sign"],
        events: ["accountsChanged", "chainChanged"]
      });
      await wcProvider.connect();
      return wcProvider;`
    : `throw new Error("No injected wallet found. Open this page in your wallet's in-app browser (MetaMask/Rabby/etc.).");`;
  return `
    const WC_PROJECT_ID = ${wcProjectJson};
    let wcProvider = null;
    async function getProvider() {
      if (window.ethereum) return window.ethereum;
      ${fallback}
    }
  `;
}
