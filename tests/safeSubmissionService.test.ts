import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { SafeSubmissionService } from "../src/services/safeSubmissionService.js";
import type { SafeSubmission } from "../src/domain/types.js";

class FakeSafeService {
  async prepareSafeTransaction(): Promise<{
    safeTransaction: SafeSubmission["safeTransaction"];
    safeTxHash: Hex;
    transactionServiceUrl: string;
  }> {
    return {
      safeTxHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      transactionServiceUrl: "https://safe.example",
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
        nonce: 4n
      }
    };
  }

  normalizeOwnerSignature = vi.fn(async (_hash: Hex, _owner: Address, signature: Hex) => signature);
  proposeTransaction = vi.fn(async () => undefined);
  confirmTransaction = vi.fn(async () => undefined);
  getTransaction = vi.fn(async () => ({ confirmations: [] }));
}

describe("SafeSubmissionService", () => {
  it("prepares and submits a trade proposal to Safe Transaction Service", async () => {
    const repository = new MemoryRepository();
    const fakeSafeService = new FakeSafeService();
    const service = new SafeSubmissionService(repository, fakeSafeService as never);
    await repository.saveGroupWallet({
      chatId: "123",
      safeAddress: "0x1111111111111111111111111111111111111111",
      threshold: 1,
      owners: ["0x2222222222222222222222222222222222222222"],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });
    await repository.saveTradeProposal({
      id: "trade_1",
      chatId: "123",
      proposerTelegramId: "456",
      tokenAddress: "0x3333333333333333333333333333333333333333",
      inputAmountWei: 1n,
      minOutputAmount: 1n,
      feeAmountWei: 0n,
      route: "flap-portal",
      status: "created",
      transactions: [
        {
          to: "0x4444444444444444444444444444444444444444",
          value: 1n,
          data: "0x",
          label: "buy"
        }
      ],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });

    const submission = await service.prepareTradeSubmission("123", "trade_1");
    const submitted = await service.submitOwnerSignature(
      submission.id,
      "0x2222222222222222222222222222222222222222",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1b"
    );

    expect(submitted.status).toBe("submitted");
    expect(fakeSafeService.proposeTransaction).toHaveBeenCalledOnce();
  });
});
