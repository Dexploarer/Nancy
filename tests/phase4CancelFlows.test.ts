import { describe, expect, it, mock } from "bun:test";
import { parseEther, type Address, type Hex } from "viem";
import { GroupWalletService } from "../src/services/groupWalletService.js";
import { PoolService } from "../src/services/poolService.js";
import { SafeGroupSetupService } from "../src/services/safeGroupSetupService.js";
import { WalletLinkService } from "../src/services/walletLinkService.js";
import { MemoryPoolRepository } from "../src/storage/memoryPoolRepository.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";

const safeAddress: Address = "0x1111111111111111111111111111111111111111";
const recipient: Address = "0x2222222222222222222222222222222222222222";

async function setupPool() {
  const repository = new MemoryRepository();
  const poolRepository = new MemoryPoolRepository();
  const poolService = new PoolService(repository, poolRepository, 25);
  await repository.saveGroupWallet({
    chatId: "c",
    safeAddress,
    threshold: 1,
    owners: ["0x3333333333333333333333333333333333333333"],
    createdAt: new Date("2026-05-27T00:00:00.000Z")
  });
  await poolService.initializePool("c", "111");
  return { repository, poolRepository, poolService };
}

function hash(index: number): Hex {
  return `0x${index.toString(16).padStart(64, "0")}` as Hex;
}

describe("PoolService.cancelWithdrawal", () => {
  it("restores locked shares and clears the reserved amount", async () => {
    const { poolRepository, poolService } = await setupPool();
    await poolService.creditDeposit({ chatId: "c", telegramUserId: "111", amountWei: parseEther("100"), transactionHash: hash(1) });
    const before = await poolRepository.getPoolMember("c", "111");

    const request = await poolService.requestWithdrawal({ chatId: "c", telegramUserId: "111", recipientAddress: recipient, withdrawalBps: 5000 });
    const afterRequest = await poolRepository.getPoolMember("c", "111");
    expect(afterRequest!.shares).toBeLessThan(before!.shares);

    const cancelled = await poolService.cancelWithdrawal("c", request.id, "111");
    expect(cancelled.status).toBe("cancelled");
    const afterCancel = await poolRepository.getPoolMember("c", "111");
    expect(afterCancel!.shares).toBe(before!.shares);

    const analytics = await poolService.getAnalytics("c", "111");
    expect(analytics.reservedWithdrawalWei).toBe(0n);
  });

  it("only lets the requester or a pool owner cancel", async () => {
    const { poolService } = await setupPool();
    await poolService.creditDeposit({ chatId: "c", telegramUserId: "111", amountWei: parseEther("100"), transactionHash: hash(2) });
    // member 222 deposits and requests their own withdrawal
    await poolService.creditDeposit({ chatId: "c", telegramUserId: "222", amountWei: parseEther("50"), transactionHash: hash(3) });
    const request = await poolService.requestWithdrawal({ chatId: "c", telegramUserId: "222", recipientAddress: recipient, withdrawalBps: 5000 });

    // a different non-owner member cannot cancel it
    await poolService.creditDeposit({ chatId: "c", telegramUserId: "333", amountWei: parseEther("10"), transactionHash: hash(4) });
    await expect(poolService.cancelWithdrawal("c", request.id, "333")).rejects.toThrow();

    // the pool owner (111) can
    const cancelled = await poolService.cancelWithdrawal("c", request.id, "111");
    expect(cancelled.status).toBe("cancelled");
  });

  it("refuses to cancel a non-queued withdrawal", async () => {
    const { poolService } = await setupPool();
    await poolService.creditDeposit({ chatId: "c", telegramUserId: "111", amountWei: parseEther("100"), transactionHash: hash(5) });
    const request = await poolService.requestWithdrawal({ chatId: "c", telegramUserId: "111", recipientAddress: recipient, withdrawalBps: 5000 });
    await poolService.markWithdrawalPrepared("c", request.id, "safe_x");
    await expect(poolService.cancelWithdrawal("c", request.id, "111")).rejects.toThrow();
  });
});

describe("PoolService.hasActiveStakes", () => {
  it("is false for an empty pool and true once shares or queued withdrawals exist", async () => {
    const { poolService } = await setupPool();
    expect(await poolService.hasActiveStakes("c")).toBe(false);

    await poolService.creditDeposit({ chatId: "c", telegramUserId: "111", amountWei: parseEther("10"), transactionHash: hash(6) });
    expect(await poolService.hasActiveStakes("c")).toBe(true);

    // withdraw everything -> member shares 0 but the queued request keeps it active
    await poolService.requestWithdrawal({ chatId: "c", telegramUserId: "111", recipientAddress: recipient, withdrawalBps: 10000 });
    expect(await poolService.hasActiveStakes("c")).toBe(true);
  });
});

describe("SafeGroupSetupService.cancelSession", () => {
  it("marks a collecting session cancelled and blocks further joins/deploys", async () => {
    const repository = new MemoryRepository();
    const fakeDeployment = { createSafe: mock(async () => ({ safeAddress, transactionHash: hash(9), threshold: 1, owners: [safeAddress] })) };
    const service = new SafeGroupSetupService(repository, fakeDeployment as never, new WalletLinkService(repository));
    const session = await service.createSession("c", "admin", 1);

    const cancelled = await service.cancelSession(session.id);
    expect(cancelled.status).toBe("cancelled");
    await expect(service.joinWithWallet(session.id, "111", safeAddress)).rejects.toThrow();
    await expect(service.deploy(session.id)).rejects.toThrow();
    await expect(service.cancelSession(session.id)).rejects.toThrow();
  });
});

describe("GroupWalletService.unlinkWallet", () => {
  it("removes the linked Safe and errors if there is none", async () => {
    const repository = new MemoryRepository();
    const service = new GroupWalletService(repository);
    await service.setWallet("c", safeAddress, 1, [safeAddress]);

    const removed = await service.unlinkWallet("c");
    expect(removed.safeAddress).toBe(safeAddress);
    expect(await service.getWallet("c")).toBeNull();
    await expect(service.unlinkWallet("c")).rejects.toThrow();
  });
});
