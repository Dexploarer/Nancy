import { describe, expect, it } from "bun:test";
import type { WalletLink } from "../src/domain/types.js";
import { renderLinkPage } from "../src/http/linkPage.js";

const link: WalletLink = {
  telegramUserId: "1",
  address: "0x1111111111111111111111111111111111111111",
  nonce: "nonce123",
  status: "pending",
  createdAt: new Date("2026-05-28T00:00:00.000Z")
};

describe("renderLinkPage", () => {
  it("includes the WalletConnect provider and project id when configured", () => {
    const html = renderLinkPage(link, "proj_abc");
    expect(html).toContain("@walletconnect/ethereum-provider");
    expect(html).toContain("proj_abc");
  });

  it("omits the WalletConnect provider when not configured", () => {
    const html = renderLinkPage(link, undefined);
    expect(html).not.toContain("@walletconnect/ethereum-provider");
    expect(html).toContain(link.address);
  });
});
