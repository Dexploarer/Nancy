import { describe, expect, it, mock } from "bun:test";
import type { Address, Hex } from "viem";
import { parseEther } from "viem";
import { getBscContractAddresses } from "../src/chain/addresses.js";
import { SafeService } from "../src/chain/safeService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { MemoryPoolRepository } from "../src/storage/memoryPoolRepository.js";
import { SafeSubmissionService } from "../src/services/safeSubmissionService.js";
import type { ChainTransaction, SafeSubmission } from "../src/domain/types.js";
import { PoolService } from "../src/services/poolService.js";
import { WalletLinkService } from "../src/services/walletLinkService.js";

const executionHash: Hex = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

class FakeSafeService extends SafeService {
  preparedTransactions: ChainTransaction[] = [];

  constructor() {
    super(getBscContractAddresses(56), "https://bsc-dataseed.bnbchain.org", 56, "https://safe.example");
  }

  override async prepareSafeTransaction(_safeAddress: Address, transactions: ChainTransaction[]): Promise<{
    safeTransaction: SafeSubmission["safeTransaction"];
    safeTxHash: Hex;
    transactionServiceUrl: string;
  }> {
    this.preparedTransactions = transactions;
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

  override normalizeOwnerSignature = mock(async (_hash: Hex, _owner: Address, signature: Hex) => signature);
  override proposeTransaction = mock(async () => undefined);
  override confirmTransaction = mock(async () => undefined);
  override getTransaction = mock(async () => ({ confirmations: [] }));
  override executeTransaction = mock(async () => executionHash);
}

describe("SafeSubmissionService", () => {
  it("prepares and submits a trade proposal to Safe Transaction Service", async () => {
    const repository = new MemoryRepository();
    const fakeSafeService = new FakeSafeService();
    const walletLinkService = new WalletLinkService(repository);
    const poolService = new PoolService(repository, new MemoryPoolRepository(), 25);
    const service = new SafeSubmissionService(
      repository,
      fakeSafeService,
      walletLinkService,
      poolService,
      "0x0000000000000000000000000000000000000000"
    );
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

    await poolService.initializePool("123", "456");
    const submission = await service.prepareTradeSubmission("123", "trade_1", "456");
    const submitted = await service.submitOwnerSignature(
      submission.id,
      "0x2222222222222222222222222222222222222222",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1b",
      "456"
    );

    expect(submitted.status).toBe("submitted");
    expect(fakeSafeService.proposeTransaction).toHaveBeenCalledTimes(1);
  });

  it("prepares and executes a withdrawal Safe submission through pool accounting", async () => {
    const repository = new MemoryRepository();
    const fakeSafeService = new FakeSafeService();
    const walletLinkService = new WalletLinkService(repository);
    const poolService = new PoolService(repository, new MemoryPoolRepository(), 25);
    const service = new SafeSubmissionService(
      repository,
      fakeSafeService,
      walletLinkService,
      poolService,
      "0x5555555555555555555555555555555555555555"
    );
    await repository.saveGroupWallet({
      chatId: "123",
      safeAddress: "0x1111111111111111111111111111111111111111",
      threshold: 1,
      owners: ["0x2222222222222222222222222222222222222222"],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });
    await repository.saveWalletLink({
      telegramUserId: "456",
      address: "0x2222222222222222222222222222222222222222",
      nonce: "nonce",
      status: "linked",
      createdAt: new Date("2026-05-27T00:00:00.000Z"),
      linkedAt: new Date("2026-05-27T00:01:00.000Z")
    });
    await poolService.initializePool("123", "456");
    await poolService.creditDeposit({
      chatId: "123",
      telegramUserId: "456",
      amountWei: parseEther("10"),
      transactionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    });
    const withdrawal = await poolService.requestWithdrawal({
      chatId: "123",
      telegramUserId: "456",
      recipientAddress: "0x2222222222222222222222222222222222222222",
      withdrawalBps: 5000
    });

    const submission = await service.prepareWithdrawalSubmission("123", withdrawal.id, "456");
    const preparedAnalytics = await poolService.getAnalytics("123", "456");
    const transactionHash = await service.execute(submission.id);
    const executedAnalytics = await poolService.getAnalytics("123", "456");

    expect(submission.sourceType).toBe("withdrawal");
    expect(fakeSafeService.preparedTransactions.map((transaction) => transaction.label)).toEqual([
      "Pool member withdrawal",
      "Pool withdrawal fee"
    ]);
    expect(preparedAnalytics.reservedWithdrawalWei).toBe(parseEther("5"));
    expect(transactionHash).toBe(executionHash);
    expect(executedAnalytics.reservedWithdrawalWei).toBe(0n);
    expect(executedAnalytics.withdrawals[0]?.status).toBe("executed");
  });
});
