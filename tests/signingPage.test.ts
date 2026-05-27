import { describe, expect, it } from "bun:test";
import { renderSigningPage } from "../src/http/signingPage.js";
import type { SafeSubmission } from "../src/domain/types.js";

describe("renderSigningPage", () => {
  it("submits signatures through the HTTP API instead of emitting Telegram paste commands", () => {
    const html = renderSigningPage(submission());

    expect(html).toContain("/api/safe-submissions/");
    expect(html).toContain("fetch(");
    expect(html).not.toContain("/safe_submit");
  });
});

function submission(): SafeSubmission {
  return {
    id: "safe_123",
    chatId: "chat",
    sourceType: "trade",
    sourceId: "trade_123",
    safeAddress: "0x1111111111111111111111111111111111111111",
    safeTxHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    safeTransaction: {
      to: "0x3333333333333333333333333333333333333333",
      value: 0n,
      data: "0x",
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 0n
    },
    transactionServiceUrl: "https://safe.example",
    status: "prepared",
    createdAt: new Date("2026-05-27T00:00:00.000Z")
  };
}
