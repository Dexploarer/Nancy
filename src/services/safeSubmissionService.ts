import type { Address, Hex } from "viem";
import { UserInputError } from "../domain/errors.js";
import type {
  ChainTransaction,
  ChatId,
  SafeSubmission,
  SafeSubmissionSourceType,
  SafeTransactionData
} from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import { createId } from "../utils/ids.js";
import { extractConfirmations, SafeService, type SafeTransactionServiceStatus } from "../chain/safeService.js";
import { WalletLinkService } from "./walletLinkService.js";
import { PoolService } from "./poolService.js";

type PreparedSafeTransaction = {
  safeTransaction: SafeTransactionData;
  safeTxHash: Hex;
  transactionServiceUrl: string;
};

export class SafeSubmissionService {
  constructor(
    private readonly repository: Repository,
    private readonly safeService: SafeService,
    private readonly walletLinkService: WalletLinkService,
    private readonly poolService: PoolService,
    private readonly platformFeeRecipient: Address
  ) {}

  // Trade/flap prepares spend group funds, so they require trader/owner access.
  // Withdrawal prepare requires only pool membership, so a member can prepare their
  // own queued withdrawal. All three block outsiders and cross-group callers; prepare
  // has no HTTP route, so these checks are the access boundary for the bot entry points.
  async prepareTradeSubmission(chatId: ChatId, proposalId: string, telegramUserId: string): Promise<SafeSubmission> {
    await this.poolService.requireTraderAccess(chatId, telegramUserId);
    const proposal = await this.repository.getTradeProposal(proposalId);
    if (proposal === null || proposal.chatId !== chatId) {
      throw new UserInputError("Trade proposal not found", { proposalId });
    }
    return this.prepareSubmission(chatId, "trade", proposal.id, proposal.transactions);
  }

  async prepareFlapLaunchSubmission(chatId: ChatId, proposalId: string, telegramUserId: string): Promise<SafeSubmission> {
    await this.poolService.requireTraderAccess(chatId, telegramUserId);
    const proposal = await this.repository.getFlapLaunch(proposalId);
    if (proposal === null || proposal.chatId !== chatId) {
      throw new UserInputError("Flap launch proposal not found", { proposalId });
    }
    return this.prepareSubmission(chatId, "flap-launch", proposal.id, proposal.transactions);
  }

  async prepareWithdrawalSubmission(chatId: ChatId, withdrawalId: string, telegramUserId: string): Promise<SafeSubmission> {
    await this.poolService.requirePoolMembership(chatId, telegramUserId);
    const transactions = await this.poolService.getWithdrawalTransactions(chatId, withdrawalId, this.platformFeeRecipient);
    const submission = await this.prepareSubmission(chatId, "withdrawal", withdrawalId, transactions);
    await this.poolService.markWithdrawalPrepared(chatId, withdrawalId, submission.id);
    return submission;
  }

  async submitOwnerSignature(
    submissionId: string,
    ownerAddress: Address,
    signature: Hex,
    telegramUserId: string
  ): Promise<SafeSubmission> {
    const submission = await this.getSubmissionOrThrow(submissionId);
    const wallet = await this.repository.getGroupWallet(submission.chatId);
    if (wallet === null) {
      throw new UserInputError("Group wallet not found for Safe submission");
    }
    const isOwner = wallet.owners.some((owner) => owner.toLowerCase() === ownerAddress.toLowerCase());
    if (!isOwner) {
      throw new UserInputError("Signer is not configured as a group Safe owner", { ownerAddress });
    }
    await this.walletLinkService.requireLinkedOwner(telegramUserId, ownerAddress);
    const senderSignature = await this.safeService.normalizeOwnerSignature(submission.safeTxHash, ownerAddress, signature);
    if (submission.status === "prepared") {
      await this.safeService.proposeTransaction({
        serviceUrl: submission.transactionServiceUrl,
        safeAddress: submission.safeAddress,
        safeTxHash: submission.safeTxHash,
        safeTransaction: submission.safeTransaction,
        senderAddress: ownerAddress,
        senderSignature
      });
      const updated: SafeSubmission = {
        ...submission,
        status: "submitted",
        senderAddress: ownerAddress,
        submittedAt: new Date()
      };
      await this.repository.saveSafeSubmission(updated);
      return updated;
    }

    await this.safeService.confirmTransaction({
      serviceUrl: submission.transactionServiceUrl,
      safeTxHash: submission.safeTxHash,
      senderSignature
    });
    return submission;
  }

  async getStatus(submissionId: string): Promise<SafeTransactionServiceStatus> {
    const submission = await this.getSubmissionOrThrow(submissionId);
    return this.safeService.getTransaction(submission.transactionServiceUrl, submission.safeTxHash);
  }

  async execute(submissionId: string): Promise<Hex> {
    const submission = await this.getSubmissionOrThrow(submissionId);
    const status = await this.safeService.getTransaction(submission.transactionServiceUrl, submission.safeTxHash);
    const transactionHash = await this.safeService.executeTransaction(
      submission.safeAddress,
      submission.safeTransaction,
      extractConfirmations(status)
    );
    if (submission.sourceType === "withdrawal") {
      await this.poolService.markWithdrawalExecuted(submission.sourceId, transactionHash);
    }
    return transactionHash;
  }

  // Execute-from-wallet: calldata for an owner to send execTransaction themselves.
  async buildExecution(submissionId: string): Promise<{ safeAddress: Address; data: Hex }> {
    const submission = await this.getSubmissionOrThrow(submissionId);
    const wallet = await this.repository.getGroupWallet(submission.chatId);
    if (wallet === null) {
      throw new UserInputError("Group wallet not found for Safe submission");
    }
    const status = await this.safeService.getTransaction(submission.transactionServiceUrl, submission.safeTxHash);
    const confirmations = extractConfirmations(status);
    if (confirmations.length < wallet.threshold) {
      throw new UserInputError(`Need ${wallet.threshold} owner signatures before executing (have ${confirmations.length}).`);
    }
    return {
      safeAddress: submission.safeAddress,
      data: this.safeService.buildExecTransactionCalldata(submission.safeTransaction, confirmations)
    };
  }

  // Verify an owner-submitted execution on-chain, then finalize pool accounting.
  async finalizeExecution(submissionId: string, transactionHash: Hex): Promise<Hex> {
    const submission = await this.getSubmissionOrThrow(submissionId);
    await this.safeService.verifyExecution(submission.safeAddress, submission.safeTransaction, transactionHash);
    if (submission.sourceType === "withdrawal") {
      await this.poolService.markWithdrawalExecuted(submission.sourceId, transactionHash);
    }
    return transactionHash;
  }

  async getSubmission(submissionId: string): Promise<SafeSubmission | null> {
    return this.repository.getSafeSubmission(submissionId);
  }

  private async prepareSubmission(
    chatId: ChatId,
    sourceType: SafeSubmissionSourceType,
    sourceId: string,
    transactions: ChainTransaction[]
  ): Promise<SafeSubmission> {
    const wallet = await this.repository.getGroupWallet(chatId);
    if (wallet === null) {
      throw new UserInputError("Set the group wallet before preparing a Safe submission");
    }
    const prepared: PreparedSafeTransaction = await this.safeService.prepareSafeTransaction(wallet.safeAddress, transactions);
    const submission: SafeSubmission = {
      id: createId("safe"),
      chatId,
      sourceType,
      sourceId,
      safeAddress: wallet.safeAddress,
      safeTxHash: prepared.safeTxHash,
      safeTransaction: prepared.safeTransaction,
      transactionServiceUrl: prepared.transactionServiceUrl,
      status: "prepared",
      createdAt: new Date()
    };
    await this.repository.saveSafeSubmission(submission);
    return submission;
  }

  private async getSubmissionOrThrow(submissionId: string): Promise<SafeSubmission> {
    const submission = await this.repository.getSafeSubmission(submissionId);
    if (submission === null) {
      throw new UserInputError("Safe submission not found", { submissionId });
    }
    return submission;
  }
}
