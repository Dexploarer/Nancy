import { describe, expect, it } from "bun:test";
import { parseEther } from "viem";
import { PoolService } from "../src/services/poolService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { MemoryPoolRepository } from "../src/storage/memoryPoolRepository.js";

const ownerAddress = "0x1111111111111111111111111111111111111111";
const memberAddress = "0x2222222222222222222222222222222222222222";

describe("PoolService", () => {
  it("tracks member shares, profit, queued withdrawals, and execution fees", async () => {
    const { service } = await setupPool();

    await service.creditDeposit({
      chatId: "chat",
      telegramUserId: "owner",
      amountWei: parseEther("100"),
      transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    await service.creditDeposit({
      chatId: "chat",
      telegramUserId: "member",
      amountWei: parseEther("100"),
      transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    await service.updateNav({
      chatId: "chat",
      operatorTelegramId: "owner",
      navWei: parseEther("300"),
      liquidWei: parseEther("300"),
      positionsWei: 0n
    });

    const request = await service.requestWithdrawal({
      chatId: "chat",
      telegramUserId: "member",
      recipientAddress: memberAddress,
      withdrawalBps: 5000
    });
    const queuedAnalytics = await service.getAnalytics("chat", "member");

    expect(request.grossAmountWei).toBe(parseEther("75"));
    expect(request.netAmountWei).toBe(parseEther("74.8125"));
    expect(queuedAnalytics.member.activeValueWei).toBe(parseEther("75"));
    expect(queuedAnalytics.member.queuedWithdrawalWei).toBe(parseEther("75"));
    expect(queuedAnalytics.member.unrealizedPnlWei).toBe(parseEther("50"));
    expect(queuedAnalytics.activeNavWei).toBe(parseEther("225"));

    const transactions = await service.getWithdrawalTransactions("chat", request.id, ownerAddress);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.value).toBe(parseEther("74.8125"));

    await service.markWithdrawalPrepared("chat", request.id, "safe_1");
    await service.markWithdrawalExecuted(request.id, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
    const executedAnalytics = await service.getAnalytics("chat", "member");

    expect(executedAnalytics.navWei).toBe(parseEther("225"));
    expect(executedAnalytics.reservedWithdrawalWei).toBe(0n);
    expect(executedAnalytics.member.withdrawnWei).toBe(parseEther("74.8125"));
    expect(executedAnalytics.member.unrealizedPnlWei).toBe(parseEther("49.8125"));
  });

  it("allows owners and traders to trade but blocks members", async () => {
    const { service } = await setupPool();
    await service.setRole({
      chatId: "chat",
      operatorTelegramId: "owner",
      targetTelegramId: "trader",
      role: "trader"
    });
    await service.setRole({
      chatId: "chat",
      operatorTelegramId: "owner",
      targetTelegramId: "member",
      role: "member"
    });

    await expect(service.requireTraderAccess("chat", "owner")).resolves.toBeUndefined();
    await expect(service.requireTraderAccess("chat", "trader")).resolves.toBeUndefined();
    await expect(service.requireTraderAccess("chat", "member")).rejects.toThrow("Only pool owners and traders");
  });

  it("rejects duplicate deposit hashes and invalid NAV snapshots", async () => {
    const { service } = await setupPool();
    const transactionHash = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

    await service.creditDeposit({
      chatId: "chat",
      telegramUserId: "owner",
      amountWei: parseEther("1"),
      transactionHash
    });

    await expect(
      service.creditDeposit({
        chatId: "chat",
        telegramUserId: "owner",
        amountWei: parseEther("1"),
        transactionHash
      })
    ).rejects.toThrow("already credited");

    await expect(
      service.updateNav({
        chatId: "chat",
        operatorTelegramId: "owner",
        navWei: parseEther("2"),
        liquidWei: parseEther("1"),
        positionsWei: parseEther("0.5")
      })
    ).rejects.toThrow("must equal liquid plus open-position value");
  });

  it("keeps open-position withdrawals queued until liquid BNB is available", async () => {
    const { service } = await setupPool();

    await service.creditDeposit({
      chatId: "chat",
      telegramUserId: "owner",
      amountWei: parseEther("10"),
      transactionHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    });
    await service.updateNav({
      chatId: "chat",
      operatorTelegramId: "owner",
      navWei: parseEther("10"),
      liquidWei: parseEther("1"),
      positionsWei: parseEther("9")
    });
    const request = await service.requestWithdrawal({
      chatId: "chat",
      telegramUserId: "owner",
      recipientAddress: ownerAddress,
      withdrawalBps: 5000
    });

    await expect(service.getWithdrawalTransactions("chat", request.id, ownerAddress)).rejects.toThrow("Not enough liquid BNB");
  });

  it("blocks non-owners from role and NAV mutation", async () => {
    const { service } = await setupPool();

    await expect(
      service.setRole({
        chatId: "chat",
        operatorTelegramId: "member",
        targetTelegramId: "member",
        role: "trader"
      })
    ).rejects.toThrow("Pool member not found");

    await service.setRole({
      chatId: "chat",
      operatorTelegramId: "owner",
      targetTelegramId: "member",
      role: "member"
    });

    await expect(
      service.updateNav({
        chatId: "chat",
        operatorTelegramId: "member",
        navWei: 0n,
        liquidWei: 0n,
        positionsWei: 0n
      })
    ).rejects.toThrow("Only pool owners");
  });
});

async function setupPool(): Promise<{ service: PoolService }> {
  const repository = new MemoryRepository();
  await repository.saveGroupWallet({
    chatId: "chat",
    safeAddress: "0x3333333333333333333333333333333333333333",
    threshold: 1,
    owners: [ownerAddress],
    createdAt: new Date("2026-05-27T00:00:00.000Z")
  });
  const service = new PoolService(repository, new MemoryPoolRepository(), 25);
  await service.initializePool("chat", "owner");
  return { service };
}
