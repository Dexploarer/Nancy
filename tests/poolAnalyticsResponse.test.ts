import { describe, expect, it } from "bun:test";
import type { PoolAnalytics } from "../src/domain/types.js";
import { serializePoolAnalytics } from "../src/http/poolAnalyticsResponse.js";

describe("serializePoolAnalytics", () => {
  it("serializes bigint accounting values as JSON-safe strings", () => {
    const response = serializePoolAnalytics(analytics());

    expect(response.navWei).toBe("1000");
    expect(response.member.shares).toBe("500");
    expect(response.member.unrealizedPnlWei).toBe("-25");
    expect(response.withdrawals[0]?.grossAmountWei).toBe("200");
    expect(response.ledger[0]?.sharesDelta).toBe("-100");
    expect(JSON.stringify(response)).toContain("\"navWei\":\"1000\"");
  });
});

function analytics(): PoolAnalytics {
  const capturedAt = new Date("2026-05-27T00:00:00.000Z");
  return {
    chatId: "chat",
    telegramUserId: "user",
    safeAddress: "0x1111111111111111111111111111111111111111",
    navWei: 1000n,
    liquidWei: 700n,
    positionsWei: 300n,
    activeNavWei: 800n,
    reservedWithdrawalWei: 200n,
    totalShares: 1000n,
    withdrawalFeeBps: 25,
    member: {
      telegramUserId: "user",
      role: "member",
      shares: 500n,
      ownershipBps: 5000,
      activeValueWei: 400n,
      depositedWei: 625n,
      withdrawnWei: 0n,
      queuedWithdrawalWei: 200n,
      unrealizedPnlWei: -25n
    },
    members: [],
    withdrawals: [
      {
        id: "wd_1",
        chatId: "chat",
        telegramUserId: "user",
        recipientAddress: "0x2222222222222222222222222222222222222222",
        shares: 100n,
        grossAmountWei: 200n,
        feeAmountWei: 1n,
        netAmountWei: 199n,
        navWei: 1000n,
        totalSharesAtRequest: 1000n,
        status: "queued",
        requestedAt: capturedAt
      }
    ],
    ledger: [
      {
        id: "ledger_1",
        chatId: "chat",
        telegramUserId: "user",
        type: "withdrawal-request",
        amountWei: 200n,
        sharesDelta: -100n,
        navWei: 1000n,
        totalSharesAfter: 900n,
        createdAt: capturedAt
      }
    ],
    capturedAt
  };
}
