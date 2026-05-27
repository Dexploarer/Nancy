import { describe, expect, it } from "vitest";
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

describe("TradeService", () => {
  it("creates a Safe transaction batch with platform fee and Flap buy", async () => {
    const repository = new MemoryRepository();
    const service = new TradeService(repository, new FakeFlapService() as never);
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
      feeRecipient: "0x4444444444444444444444444444444444444444"
    });

    expect(proposal.route).toBe("flap-portal");
    expect(proposal.feeAmountWei).toBe(1_000n);
    expect(proposal.minOutputAmount).toBe(9_900n);
    expect(proposal.transactions).toHaveLength(2);
    expect(proposal.transactions[0]?.label).toBe("Platform trading fee");
    expect(proposal.transactions[1]?.value).toBe(999_000n);
  });
});
