import type { Hex } from "viem";
import type { PoolAnalytics, PoolLedgerEntry, PoolMemberBreakdown, PoolWithdrawalRequest } from "../domain/types.js";

export type PoolAnalyticsResponse = {
  chatId: string;
  telegramUserId: string;
  safeAddress?: string;
  navWei: string;
  liquidWei: string;
  positionsWei: string;
  activeNavWei: string;
  reservedWithdrawalWei: string;
  totalShares: string;
  withdrawalFeeBps: number;
  member: SerializedPoolMemberBreakdown;
  members: SerializedPoolMemberBreakdown[];
  withdrawals: SerializedPoolWithdrawalRequest[];
  ledger: SerializedPoolLedgerEntry[];
  capturedAt: string;
};

type SerializedPoolMemberBreakdown = Omit<
  PoolMemberBreakdown,
  "shares" | "activeValueWei" | "depositedWei" | "withdrawnWei" | "queuedWithdrawalWei" | "unrealizedPnlWei"
> & {
  shares: string;
  activeValueWei: string;
  depositedWei: string;
  withdrawnWei: string;
  queuedWithdrawalWei: string;
  unrealizedPnlWei: string;
};

type SerializedPoolWithdrawalRequest = Omit<
  PoolWithdrawalRequest,
  | "shares"
  | "grossAmountWei"
  | "feeAmountWei"
  | "netAmountWei"
  | "navWei"
  | "totalSharesAtRequest"
  | "requestedAt"
  | "preparedAt"
  | "executedAt"
  | "cancelledAt"
> & {
  shares: string;
  grossAmountWei: string;
  feeAmountWei: string;
  netAmountWei: string;
  navWei: string;
  totalSharesAtRequest: string;
  requestedAt: string;
  preparedAt?: string;
  executedAt?: string;
  cancelledAt?: string;
};

type SerializedPoolLedgerEntry = Omit<
  PoolLedgerEntry,
  "amountWei" | "sharesDelta" | "navWei" | "totalSharesAfter" | "createdAt" | "transactionHash"
> & {
  amountWei: string;
  sharesDelta: string;
  navWei: string;
  totalSharesAfter: string;
  createdAt: string;
  transactionHash?: Hex;
};

export function serializePoolAnalytics(analytics: PoolAnalytics): PoolAnalyticsResponse {
  return {
    chatId: analytics.chatId,
    telegramUserId: analytics.telegramUserId,
    ...(analytics.safeAddress === undefined ? {} : { safeAddress: analytics.safeAddress }),
    navWei: analytics.navWei.toString(),
    liquidWei: analytics.liquidWei.toString(),
    positionsWei: analytics.positionsWei.toString(),
    activeNavWei: analytics.activeNavWei.toString(),
    reservedWithdrawalWei: analytics.reservedWithdrawalWei.toString(),
    totalShares: analytics.totalShares.toString(),
    withdrawalFeeBps: analytics.withdrawalFeeBps,
    member: serializeMemberBreakdown(analytics.member),
    members: analytics.members.map(serializeMemberBreakdown),
    withdrawals: analytics.withdrawals.map(serializeWithdrawal),
    ledger: analytics.ledger.map(serializeLedgerEntry),
    capturedAt: analytics.capturedAt.toISOString()
  };
}

function serializeMemberBreakdown(member: PoolMemberBreakdown): SerializedPoolMemberBreakdown {
  return {
    telegramUserId: member.telegramUserId,
    role: member.role,
    shares: member.shares.toString(),
    ownershipBps: member.ownershipBps,
    activeValueWei: member.activeValueWei.toString(),
    depositedWei: member.depositedWei.toString(),
    withdrawnWei: member.withdrawnWei.toString(),
    queuedWithdrawalWei: member.queuedWithdrawalWei.toString(),
    unrealizedPnlWei: member.unrealizedPnlWei.toString()
  };
}

function serializeWithdrawal(request: PoolWithdrawalRequest): SerializedPoolWithdrawalRequest {
  return {
    id: request.id,
    chatId: request.chatId,
    telegramUserId: request.telegramUserId,
    recipientAddress: request.recipientAddress,
    shares: request.shares.toString(),
    grossAmountWei: request.grossAmountWei.toString(),
    feeAmountWei: request.feeAmountWei.toString(),
    netAmountWei: request.netAmountWei.toString(),
    navWei: request.navWei.toString(),
    totalSharesAtRequest: request.totalSharesAtRequest.toString(),
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    ...(request.preparedAt === undefined ? {} : { preparedAt: request.preparedAt.toISOString() }),
    ...(request.executedAt === undefined ? {} : { executedAt: request.executedAt.toISOString() }),
    ...(request.cancelledAt === undefined ? {} : { cancelledAt: request.cancelledAt.toISOString() }),
    ...(request.safeSubmissionId === undefined ? {} : { safeSubmissionId: request.safeSubmissionId }),
    ...(request.executionTransactionHash === undefined ? {} : { executionTransactionHash: request.executionTransactionHash })
  };
}

function serializeLedgerEntry(entry: PoolLedgerEntry): SerializedPoolLedgerEntry {
  return {
    id: entry.id,
    chatId: entry.chatId,
    telegramUserId: entry.telegramUserId,
    type: entry.type,
    amountWei: entry.amountWei.toString(),
    sharesDelta: entry.sharesDelta.toString(),
    navWei: entry.navWei.toString(),
    totalSharesAfter: entry.totalSharesAfter.toString(),
    createdAt: entry.createdAt.toISOString(),
    ...(entry.transactionHash === undefined ? {} : { transactionHash: entry.transactionHash })
  };
}
