import { describe, expect, it } from "bun:test";
import type { Address } from "viem";
import { PoolService } from "../src/services/poolService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { MemoryPoolRepository } from "../src/storage/memoryPoolRepository.js";

const now = new Date();
const SAFE = "0x1111111111111111111111111111111111111111" as Address;

function setup() {
  const repository = new MemoryRepository();
  const poolRepository = new MemoryPoolRepository();
  return { repository, poolRepository, service: new PoolService(repository, poolRepository, 25) };
}

async function seedGroup(
  repository: MemoryRepository,
  poolRepository: MemoryPoolRepository,
  chatId: string,
  userId: string,
  shares: bigint
) {
  await repository.saveGroupWallet({ chatId, safeAddress: SAFE, threshold: 1, owners: [], createdAt: now });
  await poolRepository.savePoolMember({
    chatId,
    telegramUserId: userId,
    role: "member",
    shares,
    depositedWei: shares,
    withdrawnWei: 0n,
    createdAt: now,
    updatedAt: now
  });
  await poolRepository.savePoolNavSnapshot({
    id: `nav-${chatId}`,
    chatId,
    navWei: shares,
    liquidWei: shares,
    positionsWei: 0n,
    totalShares: shares,
    capturedAt: now
  });
}

describe("PoolService reporting", () => {
  it("buildPortfolio returns only the groups the caller belongs to, with totals", async () => {
    const { repository, poolRepository, service } = setup();
    await seedGroup(repository, poolRepository, "chat-1", "u1", 100n);
    await seedGroup(repository, poolRepository, "chat-2", "u2", 50n);

    const portfolio = await service.buildPortfolio("u1");
    expect(portfolio.entries).toHaveLength(1);
    expect(portfolio.entries[0]?.chatId).toBe("chat-1");
    expect(portfolio.totalActiveValueWei).toBe(100n);
  });

  it("buildPlatformStats aggregates groups, members, TVL, and 24h volume", async () => {
    const { repository, poolRepository, service } = setup();
    await seedGroup(repository, poolRepository, "chat-1", "u1", 100n);
    await seedGroup(repository, poolRepository, "chat-2", "u2", 50n);
    await poolRepository.savePoolLedgerEntry({
      id: "l1",
      chatId: "chat-1",
      telegramUserId: "u1",
      type: "deposit",
      amountWei: 30n,
      sharesDelta: 30n,
      navWei: 100n,
      totalSharesAfter: 100n,
      createdAt: now
    });

    const stats = await service.buildPlatformStats();
    expect(stats.groups).toBe(2);
    expect(stats.totalMembers).toBe(2);
    expect(stats.totalTvlWei).toBe(150n);
    expect(stats.depositVolume24hWei).toBe(30n);
  });
});
