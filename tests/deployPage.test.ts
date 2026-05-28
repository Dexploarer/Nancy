import { describe, expect, it } from "bun:test";
import { renderDeployPage } from "../src/http/deployPage.js";

describe("renderDeployPage", () => {
  it("sends the deploy tx from the wallet and posts the hash for verification", () => {
    const html = renderDeployPage({
      sessionId: "setup_1",
      owners: ["0x1111111111111111111111111111111111111111"],
      threshold: 1,
      to: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
      data: "0xabc123",
      walletConnectProjectId: "proj_abc",
      chainId: 56
    });
    expect(html).toContain("eth_sendTransaction");
    expect(html).toContain("/api/safe-deployments/");
    expect(html).toContain("@walletconnect/ethereum-provider");
    expect(html).toContain("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67");
  });
});
