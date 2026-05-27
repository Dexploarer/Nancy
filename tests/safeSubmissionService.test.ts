import { describe, expect, it, mock } from "bun:test";
import type { Address, Hex } from "viem";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { SafeSubmissionService } from "../src/services/safeSubmissionService.js";
import type { SafeSubmission } from "../src/domain/types.js";
import { WalletLinkService } from "../src/services/walletLinkService.js";

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

  normalizeOwnerSignature = mock(async (_hash: Hex, _owner: Address, signature: Hex) => signature);
  proposeTransaction = mock(async () => undefined);
  confirmTransaction = mock(async () => undefined);
  getTransaction = mock(async () => ({ confirmations: [] }));
}

describe("SafeSubmissionService", () => {
  it("prepares and submits a trade proposal to Safe Transaction Service", async () => {
    const repository = new MemoryRepository();
    const fakeSafeService = new FakeSafeService();
    const walletLinkService = new WalletLinkService(repository);
    const service = new SafeSubmissionService(repository, fakeSafeService as never, walletLinkService);
    const linkedAt = new Date("2026-05-27T00:01:00.000Z");
    await repository.saveWalletLink({
      telegramUserId: "456",
      address: "0x2222222222222222222222222222222222222222",
      nonce: "nonce",
      status: "linked",
      createdAt: linkedAt,
      linkedAt
    });
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
      riskReport: {
        tokenAddress: "0x3333333333333333333333333333333333333333",
        level: "low",
        blocked: false,
        reasons: [],
        checkedAt: new Date("2026-05-27T00:00:00.000Z")
      },
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
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1b",
      "456"
    );

    expect(submitted.status).toBe("submitted");
    expect(fakeSafeService.proposeTransaction).toHaveBeenCalledTimes(1);
  });
});
