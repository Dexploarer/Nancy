import { describe, expect, it } from "bun:test";
import { renderExecutePage } from "../src/http/executePage.js";

describe("renderExecutePage", () => {
  it("sends execTransaction from the wallet and posts the hash for verification", () => {
    const html = renderExecutePage({
      submissionId: "safe_1",
      safeAddress: "0x2222222222222222222222222222222222222222",
      data: "0xabc123",
      walletConnectProjectId: "proj_abc",
      chainId: 56
    });
    expect(html).toContain("eth_sendTransaction");
    expect(html).toContain("/api/safe-executions/");
    expect(html).toContain("@walletconnect/ethereum-provider");
    expect(html).toContain("0x2222222222222222222222222222222222222222");
  });
});
