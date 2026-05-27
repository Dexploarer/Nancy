import { describe, expect, it } from "bun:test";
import type { Address } from "viem";
import { TradeService } from "../src/services/tradeService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import type { ChainTransaction } from "../src/domain/types.js";

class FakeFlapService {
  async inspectToken(): Promise<{ status: "tradable" }> {
    return { status: "tradable" };
  }

  async quoteNativeBuy(): Promise<bigint> {
    return 10_000n;
  }

  buildNativeBuyTransaction(tokenAddress: Address, inputAmountWei: bigint, minOutputAmount: bigint): ChainTransaction {
    return {
      to: tokenAddress,
      value: inputAmountWei,
      data: "0x1234",
      label: `buy:${minOutputAmount.toString()}`
    };
  }
}

class FakeDexFlapService {
  async inspectToken(): Promise<{ status: "dex" }> {
    return { status: "dex" };
  }
}

class FakePancakeSwapService {
  async quoteNativeBuy(): Promise<bigint> {
    return 20_000n;
  }

  buildNativeBuyTransaction(
    tokenAddress: Address,
    inputAmountWei: bigint,
    minOutputAmount: bigint,
    recipient: Address
  ): ChainTransaction {
    return {
      to: tokenAddress,
      value: inputAmountWei,
      data: "0xabcd",
      label: `dex:${recipient}:${minOutputAmount.toString()}`
    };
  }
}

class FakeTokenRiskService {
  async checkBscToken(tokenAddress: Address) {
    return {
      tokenAddress,
      level: "low" as const,
      blocked: false,
      reasons: [],
      checkedAt: new Date("2026-05-27T00:00:00.000Z")
    };
  }
}

describe("TradeService", () => {
  it("creates a Safe transaction batch with platform fee and Flap buy", async () => {
    const repository = new MemoryRepository();
    const service = new TradeService(
      repository,
      new FakeFlapService() as never,
      new FakePancakeSwapService() as never,
      new FakeTokenRiskService() as never
    );
    await repository.saveGroupWallet({
      chatId: "123",
      safeAddress: "0x1111111111111111111111111111111111111111",
      threshold: 1,
      owners: ["0x2222222222222222222222222222222222222222"],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });

    const proposal = await service.createNativeBuyProposal({
      chatId: "123",
      proposerTelegramId: "456",
      tokenAddress: "0x3333333333333333333333333333333333333333",
      inputAmountWei: 1_000_000n,
      slippageBps: 100,
      tradeFeeBps: 10,
      feeRecipient: "0x4444444444444444444444444444444444444444",
      dexDeadlineSeconds: 86400
    });

    expect(proposal.route).toBe("flap-portal");
    expect(proposal.riskReport.level).toBe("low");
    expect(proposal.feeAmountWei).toBe(1_000n);
    expect(proposal.minOutputAmount).toBe(9_900n);
    expect(proposal.transactions).toHaveLength(2);
    expect(proposal.transactions[0]?.label).toBe("Platform trading fee");
    expect(proposal.transactions[1]?.value).toBe(999_000n);
  });

  it("routes migrated Flap tokens through PancakeSwap V2", async () => {
    const repository = new MemoryRepository();
    const service = new TradeService(
      repository,
      new FakeDexFlapService() as never,
      new FakePancakeSwapService() as never,
      new FakeTokenRiskService() as never
    );
    await repository.saveGroupWallet({
      chatId: "123",
      safeAddress: "0x1111111111111111111111111111111111111111",
      threshold: 1,
      owners: ["0x2222222222222222222222222222222222222222"],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });

    const proposal = await service.createNativeBuyProposal({
      chatId: "123",
      proposerTelegramId: "456",
      tokenAddress: "0x3333333333333333333333333333333333333333",
      inputAmountWei: 1_000_000n,
      slippageBps: 100,
      tradeFeeBps: 10,
      feeRecipient: "0x4444444444444444444444444444444444444444",
      dexDeadlineSeconds: 86400
    });

    expect(proposal.route).toBe("pancakeswap-v2");
    expect(proposal.feeAmountWei).toBe(1_000n);
    expect(proposal.minOutputAmount).toBe(19_800n);
    expect(proposal.transactions[1]?.label).toBe("dex:0x1111111111111111111111111111111111111111:19800");
  });
});
