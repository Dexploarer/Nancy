import type {
  ChatId,
  PoolAnalytics,
  PoolMember,
  PoolMemberBreakdown,
  PoolWithdrawalRequest,
  PoolWithdrawalStatus
} from "../domain/types.js";
import { UserInputError } from "../domain/errors.js";
import type { Repository } from "../storage/repository.js";
import type { PoolRepository } from "../storage/poolRepository.js";
import { calculateOwnershipBps, calculateShareValue } from "./poolAccounting.js";

const RESERVED_WITHDRAWAL_STATUSES: PoolWithdrawalStatus[] = ["queued", "prepared"];

export async function buildPoolAnalytics(input: {
  repository: Repository;
  poolRepository: PoolRepository;
  withdrawalFeeBps: number;
  chatId: ChatId;
  telegramUserId: string;
}): Promise<PoolAnalytics> {
  const wallet = await input.repository.getGroupWallet(input.chatId);
  const snapshot = await input.poolRepository.getLatestPoolNavSnapshot(input.chatId);
  if (snapshot === null) {
    throw new UserInputError("Initialize the pool with /pool_init first");
  }
  const members = await input.poolRepository.listPoolMembers(input.chatId);
  const totalShares = sumShares(members);
  const withdrawals = await input.poolRepository.listPoolWithdrawalRequests(input.chatId);
  const reservedWithdrawalWei = sumReservedWithdrawals(withdrawals);
  const activeNavWei = subtractReserved(snapshot.navWei, reservedWithdrawalWei);
  const ledger = await input.poolRepository.listPoolLedgerEntries(input.chatId, 25);
  const breakdowns = members.map((member) => buildBreakdown(member, withdrawals, totalShares, activeNavWei));
  const member = breakdowns.find((breakdown) => breakdown.telegramUserId === input.telegramUserId) ?? {
    telegramUserId: input.telegramUserId,
    role: "member",
    shares: 0n,
    ownershipBps: 0,
    activeValueWei: 0n,
    depositedWei: 0n,
    withdrawnWei: 0n,
    queuedWithdrawalWei: 0n,
    unrealizedPnlWei: 0n
  };
  return {
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    ...(wallet === null ? {} : { safeAddress: wallet.safeAddress }),
    navWei: snapshot.navWei,
    liquidWei: snapshot.liquidWei,
    positionsWei: snapshot.positionsWei,
    activeNavWei,
    reservedWithdrawalWei,
    totalShares,
    withdrawalFeeBps: input.withdrawalFeeBps,
    member,
    members: breakdowns,
    withdrawals,
    ledger,
    capturedAt: snapshot.capturedAt
  };
}

export function sumShares(members: PoolMember[]): bigint {
  return members.reduce((sum, member) => sum + member.shares, 0n);
}

export function sumReservedWithdrawals(withdrawals: PoolWithdrawalRequest[]): bigint {
  return withdrawals
    .filter((request) => RESERVED_WITHDRAWAL_STATUSES.includes(request.status))
    .reduce((sum, request) => sum + request.grossAmountWei, 0n);
}

export function subtractReserved(navWei: bigint, reservedWithdrawalWei: bigint): bigint {
  if (navWei < reservedWithdrawalWei) {
    throw new UserInputError("Pool NAV is below queued withdrawal claims");
  }
  return navWei - reservedWithdrawalWei;
}

function buildBreakdown(
  member: PoolMember,
  withdrawals: PoolWithdrawalRequest[],
  totalShares: bigint,
  activeNavWei: bigint
): PoolMemberBreakdown {
  const queuedWithdrawalWei = withdrawals
    .filter(
      (request) =>
        request.telegramUserId === member.telegramUserId && RESERVED_WITHDRAWAL_STATUSES.includes(request.status)
    )
    .reduce((sum, request) => sum + request.grossAmountWei, 0n);
  const activeValueWei = calculateShareValue(member.shares, totalShares, activeNavWei);
  return {
    telegramUserId: member.telegramUserId,
    role: member.role,
    shares: member.shares,
    ownershipBps: calculateOwnershipBps(member.shares, totalShares),
    activeValueWei,
    depositedWei: member.depositedWei,
    withdrawnWei: member.withdrawnWei,
    queuedWithdrawalWei,
    unrealizedPnlWei: activeValueWei + queuedWithdrawalWei + member.withdrawnWei - member.depositedWei
  };
}
