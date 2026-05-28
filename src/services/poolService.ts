import type { Address, Hex } from "viem";
import { NATIVE_TOKEN_ADDRESS } from "../chain/addresses.js";
import { buildFeeTransaction } from "../chain/feeService.js";
import type {
  ChainTransaction,
  ChatId,
  PoolAnalytics,
  PoolLedgerEntry,
  PoolMember,
  PoolNavSnapshot,
  PoolRole,
  PoolWithdrawalRequest
} from "../domain/types.js";
import { UserInputError } from "../domain/errors.js";
import type { Repository } from "../storage/repository.js";
import type { PoolRepository } from "../storage/poolRepository.js";
import { createId } from "../utils/ids.js";
import { calculateDepositShares, calculateWithdrawalQuote } from "./poolAccounting.js";
import { buildPoolAnalytics, subtractReserved, sumReservedWithdrawals, sumShares } from "./poolAnalyticsBuilder.js";

export type PortfolioEntry = {
  chatId: ChatId;
  role: PoolRole;
  activeValueWei: bigint;
  depositedWei: bigint;
  unrealizedPnlWei: bigint;
};

export type Portfolio = {
  entries: PortfolioEntry[];
  totalActiveValueWei: bigint;
  totalDepositedWei: bigint;
  totalPnlWei: bigint;
};

export type PlatformStats = {
  groups: number;
  totalMembers: number;
  totalTvlWei: bigint;
  depositVolume24hWei: bigint;
  withdrawalVolume24hWei: bigint;
};

export class PoolService {
  constructor(private readonly repository: Repository, private readonly poolRepository: PoolRepository, private readonly withdrawalFeeBps: number) {}

  async initializePool(chatId: ChatId, ownerTelegramId: string): Promise<PoolAnalytics> {
    await this.requireGroupWallet(chatId);
    const existing = await this.poolRepository.getPoolMember(chatId, ownerTelegramId);
    const now = new Date();
    await this.poolRepository.savePoolMember({
      chatId,
      telegramUserId: ownerTelegramId,
      role: "owner",
      shares: existing?.shares ?? 0n,
      depositedWei: existing?.depositedWei ?? 0n,
      withdrawnWei: existing?.withdrawnWei ?? 0n,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    const latest = await this.poolRepository.getLatestPoolNavSnapshot(chatId);
    if (latest === null) {
      await this.saveSnapshot(chatId, 0n, 0n, 0n, 0n, now);
    }
    await this.saveLedgerEntry({
      chatId,
      telegramUserId: ownerTelegramId,
      type: "role-update",
      amountWei: 0n,
      sharesDelta: 0n,
      navWei: latest?.navWei ?? 0n,
      totalSharesAfter: await this.getTotalShares(chatId),
      createdAt: now
    });
    return this.getAnalytics(chatId, ownerTelegramId);
  }

  async updateNav(input: {
    chatId: ChatId;
    operatorTelegramId: string;
    navWei: bigint;
    liquidWei: bigint;
    positionsWei: bigint;
  }): Promise<PoolAnalytics> {
    await this.requireOwner(input.chatId, input.operatorTelegramId);
    if (input.navWei !== input.liquidWei + input.positionsWei) {
      throw new UserInputError("Pool NAV must equal liquid plus open-position value");
    }
    const reservedWithdrawalWei = await this.getReservedWithdrawalWei(input.chatId);
    if (input.navWei < reservedWithdrawalWei) {
      throw new UserInputError("Pool NAV cannot be below queued withdrawal claims");
    }
    const totalShares = await this.getTotalShares(input.chatId);
    const now = new Date();
    await this.saveSnapshot(input.chatId, input.navWei, input.liquidWei, input.positionsWei, totalShares, now);
    await this.saveLedgerEntry({
      chatId: input.chatId,
      telegramUserId: input.operatorTelegramId,
      type: "nav-update",
      amountWei: input.navWei,
      sharesDelta: 0n,
      navWei: input.navWei,
      totalSharesAfter: totalShares,
      createdAt: now
    });
    return this.getAnalytics(input.chatId, input.operatorTelegramId);
  }

  async setRole(input: {
    chatId: ChatId;
    operatorTelegramId: string;
    targetTelegramId: string;
    role: PoolRole;
  }): Promise<PoolMember> {
    await this.requireOwner(input.chatId, input.operatorTelegramId);
    const existing = await this.poolRepository.getPoolMember(input.chatId, input.targetTelegramId);
    const now = new Date();
    const member: PoolMember = {
      chatId: input.chatId,
      telegramUserId: input.targetTelegramId,
      role: input.role,
      shares: existing?.shares ?? 0n,
      depositedWei: existing?.depositedWei ?? 0n,
      withdrawnWei: existing?.withdrawnWei ?? 0n,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await this.poolRepository.savePoolMember(member);
    const snapshot = await this.requireSnapshot(input.chatId);
    await this.saveLedgerEntry({
      chatId: input.chatId,
      telegramUserId: input.targetTelegramId,
      type: "role-update",
      amountWei: 0n,
      sharesDelta: 0n,
      navWei: snapshot.navWei,
      totalSharesAfter: await this.getTotalShares(input.chatId),
      createdAt: now
    });
    return member;
  }

  async requireTraderAccess(chatId: ChatId, telegramUserId: string): Promise<void> {
    const member = await this.requireMember(chatId, telegramUserId);
    if (member.role !== "owner" && member.role !== "trader") {
      throw new UserInputError("Only pool owners and traders can trade with group funds");
    }
  }

  async creditDeposit(input: {
    chatId: ChatId;
    telegramUserId: string;
    amountWei: bigint;
    transactionHash: Hex;
  }): Promise<PoolAnalytics> {
    await this.requireGroupWallet(input.chatId);
    const duplicate = await this.poolRepository.getPoolLedgerEntryByTransactionHash(input.transactionHash);
    if (duplicate !== null) {
      throw new UserInputError("Deposit transaction was already credited");
    }
    const snapshot = await this.requireSnapshot(input.chatId);
    const members = await this.poolRepository.listPoolMembers(input.chatId);
    const totalShares = sumShares(members);
    const reservedWithdrawalWei = await this.getReservedWithdrawalWei(input.chatId);
    const activeNavWei = subtractReserved(snapshot.navWei, reservedWithdrawalWei);
    const mintedShares = calculateDepositShares({
      amountWei: input.amountWei,
      totalShares,
      activeNavWei
    });
    const existing = await this.poolRepository.getPoolMember(input.chatId, input.telegramUserId);
    const now = new Date();
    const member: PoolMember = {
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      role: existing?.role ?? "member",
      shares: (existing?.shares ?? 0n) + mintedShares,
      depositedWei: (existing?.depositedWei ?? 0n) + input.amountWei,
      withdrawnWei: existing?.withdrawnWei ?? 0n,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const totalSharesAfter = totalShares + mintedShares;
    await this.poolRepository.savePoolMember(member);
    await this.saveSnapshot(
      input.chatId,
      snapshot.navWei + input.amountWei,
      snapshot.liquidWei + input.amountWei,
      snapshot.positionsWei,
      totalSharesAfter,
      now
    );
    await this.saveLedgerEntry({
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      type: "deposit",
      amountWei: input.amountWei,
      sharesDelta: mintedShares,
      navWei: snapshot.navWei + input.amountWei,
      totalSharesAfter,
      transactionHash: input.transactionHash,
      createdAt: now
    });
    return this.getAnalytics(input.chatId, input.telegramUserId);
  }

  async requestWithdrawal(input: {
    chatId: ChatId;
    telegramUserId: string;
    recipientAddress: Address;
    withdrawalBps: number;
  }): Promise<PoolWithdrawalRequest> {
    const member = await this.requireMember(input.chatId, input.telegramUserId);
    const snapshot = await this.requireSnapshot(input.chatId);
    const totalShares = await this.getTotalShares(input.chatId);
    const reservedWithdrawalWei = await this.getReservedWithdrawalWei(input.chatId);
    const activeNavWei = subtractReserved(snapshot.navWei, reservedWithdrawalWei);
    const quote = calculateWithdrawalQuote({
      memberShares: member.shares,
      totalShares,
      activeNavWei,
      withdrawalBps: input.withdrawalBps,
      withdrawalFeeBps: this.withdrawalFeeBps
    });
    const now = new Date();
    const updatedMember: PoolMember = {
      ...member,
      shares: member.shares - quote.shares,
      updatedAt: now
    };
    const request: PoolWithdrawalRequest = {
      id: createId("wd"),
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      recipientAddress: input.recipientAddress,
      shares: quote.shares,
      grossAmountWei: quote.grossAmountWei,
      feeAmountWei: quote.feeAmountWei,
      netAmountWei: quote.netAmountWei,
      navWei: activeNavWei,
      totalSharesAtRequest: totalShares,
      status: "queued",
      requestedAt: now
    };
    const totalSharesAfter = totalShares - quote.shares;
    await this.poolRepository.savePoolMember(updatedMember);
    await this.poolRepository.savePoolWithdrawalRequest(request);
    await this.saveSnapshot(input.chatId, snapshot.navWei, snapshot.liquidWei, snapshot.positionsWei, totalSharesAfter, now);
    await this.saveLedgerEntry({
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      type: "withdrawal-request",
      amountWei: quote.grossAmountWei,
      sharesDelta: -quote.shares,
      navWei: snapshot.navWei,
      totalSharesAfter,
      createdAt: now
    });
    return request;
  }

  async cancelWithdrawal(chatId: ChatId, requestId: string, telegramUserId: string): Promise<PoolWithdrawalRequest> {
    const request = await this.requireWithdrawal(chatId, requestId);
    if (request.status !== "queued") {
      throw new UserInputError("Only a queued withdrawal can be cancelled", { requestId, status: request.status });
    }
    const actor = await this.requireMember(chatId, telegramUserId);
    if (request.telegramUserId !== telegramUserId && actor.role !== "owner") {
      throw new UserInputError("Only the requester or a pool owner can cancel this withdrawal");
    }
    const member = await this.requireMember(chatId, request.telegramUserId);
    const now = new Date();
    await this.poolRepository.savePoolMember({
      ...member,
      shares: member.shares + request.shares,
      updatedAt: now
    });
    const cancelled: PoolWithdrawalRequest = { ...request, status: "cancelled", cancelledAt: now };
    await this.poolRepository.savePoolWithdrawalRequest(cancelled);
    const snapshot = await this.requireSnapshot(chatId);
    const totalSharesAfter = await this.getTotalShares(chatId);
    await this.saveSnapshot(chatId, snapshot.navWei, snapshot.liquidWei, snapshot.positionsWei, totalSharesAfter, now);
    await this.saveLedgerEntry({
      chatId,
      telegramUserId: request.telegramUserId,
      type: "withdrawal-cancel",
      amountWei: request.grossAmountWei,
      sharesDelta: request.shares,
      navWei: snapshot.navWei,
      totalSharesAfter,
      createdAt: now
    });
    return cancelled;
  }

  async hasActiveStakes(chatId: ChatId): Promise<boolean> {
    const members = await this.poolRepository.listPoolMembers(chatId);
    if (members.some((member) => member.shares > 0n)) {
      return true;
    }
    const withdrawals = await this.poolRepository.listPoolWithdrawalRequests(chatId);
    return withdrawals.some((request) => request.status === "queued" || request.status === "prepared");
  }

  // Pickers for the lazy prompts: tap a member / queued withdrawal instead of typing an id.
  async listMembers(chatId: ChatId): Promise<PoolMember[]> {
    return this.poolRepository.listPoolMembers(chatId);
  }

  async listQueuedWithdrawals(chatId: ChatId): Promise<PoolWithdrawalRequest[]> {
    const requests = await this.poolRepository.listPoolWithdrawalRequests(chatId);
    return requests.filter((request) => request.status === "queued");
  }

  // Cross-group portfolio: the caller's position in every pool they belong to.
  async buildPortfolio(telegramUserId: string): Promise<Portfolio> {
    const wallets = await this.repository.listGroupWallets();
    const entries: PortfolioEntry[] = [];
    for (const wallet of wallets) {
      const member = await this.poolRepository.getPoolMember(wallet.chatId, telegramUserId);
      if (member === null) {
        continue;
      }
      const analytics = await this.getAnalytics(wallet.chatId, telegramUserId);
      entries.push({
        chatId: wallet.chatId,
        role: analytics.member.role,
        activeValueWei: analytics.member.activeValueWei,
        depositedWei: analytics.member.depositedWei,
        unrealizedPnlWei: analytics.member.unrealizedPnlWei
      });
    }
    return {
      entries,
      totalActiveValueWei: entries.reduce((sum, entry) => sum + entry.activeValueWei, 0n),
      totalDepositedWei: entries.reduce((sum, entry) => sum + entry.depositedWei, 0n),
      totalPnlWei: entries.reduce((sum, entry) => sum + entry.unrealizedPnlWei, 0n)
    };
  }

  // Platform-wide rollup for the bot operator.
  async buildPlatformStats(): Promise<PlatformStats> {
    const wallets = await this.repository.listGroupWallets();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let totalMembers = 0;
    let totalTvlWei = 0n;
    let depositVolume24hWei = 0n;
    let withdrawalVolume24hWei = 0n;
    for (const wallet of wallets) {
      const members = await this.poolRepository.listPoolMembers(wallet.chatId);
      totalMembers += members.length;
      const snapshot = await this.poolRepository.getLatestPoolNavSnapshot(wallet.chatId);
      if (snapshot !== null) {
        totalTvlWei += snapshot.navWei;
      }
      const ledger = await this.poolRepository.listPoolLedgerEntries(wallet.chatId, 500);
      for (const entry of ledger) {
        if (entry.createdAt.getTime() < cutoff) {
          continue;
        }
        if (entry.type === "deposit") {
          depositVolume24hWei += entry.amountWei;
        } else if (entry.type === "withdrawal-execution") {
          withdrawalVolume24hWei += entry.amountWei;
        }
      }
    }
    return { groups: wallets.length, totalMembers, totalTvlWei, depositVolume24hWei, withdrawalVolume24hWei };
  }

  async getWithdrawalTransactions(chatId: ChatId, requestId: string, feeRecipient: Address): Promise<ChainTransaction[]> {
    const request = await this.requireWithdrawal(chatId, requestId);
    if (request.status !== "queued") {
      throw new UserInputError("Withdrawal request is not queued", { requestId, status: request.status });
    }
    const snapshot = await this.requireSnapshot(chatId);
    if (snapshot.liquidWei < request.grossAmountWei) {
      throw new UserInputError("Not enough liquid BNB for this withdrawal; update NAV or unwind positions first");
    }
    const feeTransaction = buildFeeTransaction(NATIVE_TOKEN_ADDRESS, feeRecipient, request.feeAmountWei);
    return [
      {
        to: request.recipientAddress,
        value: request.netAmountWei,
        data: "0x",
        label: "Pool member withdrawal"
      },
      ...(feeTransaction === null ? [] : [{ ...feeTransaction, label: "Pool withdrawal fee" }])
    ];
  }

  async markWithdrawalPrepared(chatId: ChatId, requestId: string, safeSubmissionId: string): Promise<void> {
    const request = await this.requireWithdrawal(chatId, requestId);
    if (request.status !== "queued") {
      throw new UserInputError("Withdrawal request is not queued", { requestId, status: request.status });
    }
    await this.poolRepository.savePoolWithdrawalRequest({
      ...request,
      status: "prepared",
      safeSubmissionId,
      preparedAt: new Date()
    });
  }

  async markWithdrawalExecuted(requestId: string, transactionHash: Hex): Promise<void> {
    const request = await this.poolRepository.getPoolWithdrawalRequest(requestId);
    if (request === null) {
      throw new UserInputError("Withdrawal request not found", { requestId });
    }
    if (request.status !== "prepared") {
      throw new UserInputError("Withdrawal request is not prepared", { requestId, status: request.status });
    }
    const member = await this.requireMember(request.chatId, request.telegramUserId);
    const snapshot = await this.requireSnapshot(request.chatId);
    if (snapshot.liquidWei < request.grossAmountWei || snapshot.navWei < request.grossAmountWei) {
      throw new UserInputError("Pool snapshot does not have enough liquid NAV to mark withdrawal executed");
    }
    const now = new Date();
    await this.poolRepository.savePoolMember({
      ...member,
      withdrawnWei: member.withdrawnWei + request.netAmountWei,
      updatedAt: now
    });
    await this.poolRepository.savePoolWithdrawalRequest({
      ...request,
      status: "executed",
      executionTransactionHash: transactionHash,
      executedAt: now
    });
    await this.saveSnapshot(
      request.chatId,
      snapshot.navWei - request.grossAmountWei,
      snapshot.liquidWei - request.grossAmountWei,
      snapshot.positionsWei,
      await this.getTotalShares(request.chatId),
      now
    );
    await this.saveLedgerEntry({
      chatId: request.chatId,
      telegramUserId: request.telegramUserId,
      type: "withdrawal-execution",
      amountWei: request.netAmountWei,
      sharesDelta: 0n,
      navWei: snapshot.navWei - request.grossAmountWei,
      totalSharesAfter: await this.getTotalShares(request.chatId),
      transactionHash,
      createdAt: now
    });
  }

  async getAnalytics(chatId: ChatId, telegramUserId: string): Promise<PoolAnalytics> {
    return buildPoolAnalytics({
      repository: this.repository,
      poolRepository: this.poolRepository,
      withdrawalFeeBps: this.withdrawalFeeBps,
      chatId,
      telegramUserId
    });
  }

  private async requireGroupWallet(chatId: ChatId): Promise<void> {
    const wallet = await this.repository.getGroupWallet(chatId);
    if (wallet === null) {
      throw new UserInputError(
        "This group has no Safe yet. An admin should create one with /safe_group <threshold> (members then join with the buttons), or link an existing Safe with /wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]."
      );
    }
  }

  private async requireOwner(chatId: ChatId, telegramUserId: string): Promise<PoolMember> {
    const member = await this.requireMember(chatId, telegramUserId);
    if (member.role !== "owner") {
      throw new UserInputError("Only pool owners can run this command");
    }
    return member;
  }

  private async requireMember(chatId: ChatId, telegramUserId: string): Promise<PoolMember> {
    const member = await this.poolRepository.getPoolMember(chatId, telegramUserId);
    if (member === null) {
      throw new UserInputError("Pool member not found; initialize the pool or deposit first");
    }
    return member;
  }

  private async requireSnapshot(chatId: ChatId): Promise<PoolNavSnapshot> {
    const snapshot = await this.poolRepository.getLatestPoolNavSnapshot(chatId);
    if (snapshot === null) {
      throw new UserInputError("Initialize the pool with /pool_init first");
    }
    return snapshot;
  }

  private async requireWithdrawal(chatId: ChatId, requestId: string): Promise<PoolWithdrawalRequest> {
    const request = await this.poolRepository.getPoolWithdrawalRequest(requestId);
    if (request === null || request.chatId !== chatId) {
      throw new UserInputError("Withdrawal request not found", { requestId });
    }
    return request;
  }

  private async getTotalShares(chatId: ChatId): Promise<bigint> {
    return sumShares(await this.poolRepository.listPoolMembers(chatId));
  }

  private async getReservedWithdrawalWei(chatId: ChatId): Promise<bigint> {
    return sumReservedWithdrawals(await this.poolRepository.listPoolWithdrawalRequests(chatId));
  }

  private async saveSnapshot(chatId: ChatId, navWei: bigint, liquidWei: bigint, positionsWei: bigint, totalShares: bigint, capturedAt: Date): Promise<void> {
    await this.poolRepository.savePoolNavSnapshot({
      id: createId("nav"),
      chatId,
      navWei,
      liquidWei,
      positionsWei,
      totalShares,
      capturedAt
    });
  }

  private async saveLedgerEntry(input: Omit<PoolLedgerEntry, "id">): Promise<void> {
    await this.poolRepository.savePoolLedgerEntry({
      id: createId("ledger"),
      ...input
    });
  }
}
