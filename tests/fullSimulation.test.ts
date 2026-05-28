import { describe, expect, it } from "bun:test";
import { parseEther } from "viem";
import { runFullSimulation } from "../src/qa/fullSimulation.js";

describe("runFullSimulation", () => {
  it("simulates group Safe threshold, pool percentages, withdrawal fees, and final PnL", async () => {
    const result = await runFullSimulation();

    expect(result.safe.threshold).toBe(2);
    expect(result.safe.owners).toHaveLength(2);
    expect(result.safe.tradeConfirmationsAfterFirstSignature).toBe(1);
    expect(result.safe.tradeExecutionRejectedBeforeThreshold).toBe(true);
    expect(result.safe.tradeConfirmationsAfterSecondSignature).toBe(2);
    expect(result.safe.tradeConfirmationOwners).toEqual(result.safe.owners);
    expect(result.safe.withdrawalConfirmationsAfterFirstSignature).toBe(1);
    expect(result.safe.withdrawalConfirmationsAfterSecondSignature).toBe(2);
    expect(result.safe.withdrawalConfirmationOwners).toEqual(result.safe.owners);

    expect(member(result.pool.afterDeposits, "owner-1").ownershipBps).toBe(1000);
    expect(member(result.pool.afterDeposits, "member-a").ownershipBps).toBe(3000);
    expect(member(result.pool.afterDeposits, "member-b").ownershipBps).toBe(6000);
    expect(result.pool.afterDeposits.ownershipBpsTotal).toBe(10000);

    expect(result.pool.afterProfit.navWei).toBe(parseEther("150").toString());
    expect(member(result.pool.afterProfit, "member-a").activeValueWei).toBe(parseEther("45").toString());
    expect(member(result.pool.afterProfit, "member-a").pnlWei).toBe(parseEther("15").toString());

    expect(result.pool.withdrawal.sharesWei).toBe(parseEther("15").toString());
    expect(result.pool.withdrawal.grossAmountWei).toBe(parseEther("22.5").toString());
    expect(result.pool.withdrawal.feeAmountWei).toBe(parseEther("0.05625").toString());
    expect(result.pool.withdrawal.netAmountWei).toBe(parseEther("22.44375").toString());

    expect(result.pool.afterWithdrawalQueued.reservedWithdrawalWei).toBe(parseEther("22.5").toString());
    expect(member(result.pool.afterWithdrawalQueued, "member-a").queuedWithdrawalWei).toBe(parseEther("22.5").toString());
    expect(member(result.pool.afterWithdrawalQueued, "member-a").ownershipBps).toBe(1764);

    expect(result.pool.final.navWei).toBe(parseEther("127.5").toString());
    expect(result.pool.final.reservedWithdrawalWei).toBe("0");
    expect(result.pool.final.totalSharesWei).toBe(parseEther("85").toString());
    expect(member(result.pool.final, "member-a").withdrawnWei).toBe(parseEther("22.44375").toString());
    expect(member(result.pool.final, "member-a").pnlWei).toBe(parseEther("14.94375").toString());
    expect(member(result.pool.final, "member-b").activeValueWei).toBe(parseEther("90").toString());
  });
});

type Snapshot = Awaited<ReturnType<typeof runFullSimulation>>["pool"]["final"];

function member(snapshot: Snapshot, telegramUserId: string): Snapshot["members"][number] {
  const found = snapshot.members.find((item) => item.telegramUserId === telegramUserId);
  if (found === undefined) {
    throw new Error(`Missing simulated member ${telegramUserId}`);
  }
  return found;
}
