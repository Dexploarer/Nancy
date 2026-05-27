import type { Hex } from "viem";
import type {
  ChatId,
  PoolLedgerEntry,
  PoolMember,
  PoolNavSnapshot,
  PoolWithdrawalRequest,
  PoolWithdrawalStatus
} from "../domain/types.js";
import type { PoolRepository } from "./poolRepository.js";

export class MemoryPoolRepository implements PoolRepository {
  private readonly members = new Map<string, PoolMember>();
  private readonly snapshots = new Map<ChatId, PoolNavSnapshot[]>();
  private readonly ledger = new Map<ChatId, PoolLedgerEntry[]>();
  private readonly withdrawals = new Map<string, PoolWithdrawalRequest>();

  async getPoolMember(chatId: ChatId, telegramUserId: string): Promise<PoolMember | null> {
    const member = this.members.get(poolMemberKey(chatId, telegramUserId));
    return member === undefined ? null : member;
  }

  async listPoolMembers(chatId: ChatId): Promise<PoolMember[]> {
    return [...this.members.values()].filter((member) => member.chatId === chatId);
  }

  async savePoolMember(member: PoolMember): Promise<void> {
    this.members.set(poolMemberKey(member.chatId, member.telegramUserId), member);
  }

  async getLatestPoolNavSnapshot(chatId: ChatId): Promise<PoolNavSnapshot | null> {
    const snapshots = this.snapshots.get(chatId);
    if (snapshots === undefined || snapshots.length === 0) {
      return null;
    }
    const latest = snapshots[snapshots.length - 1];
    return latest === undefined ? null : latest;
  }

  async savePoolNavSnapshot(snapshot: PoolNavSnapshot): Promise<void> {
    const snapshots = this.snapshots.get(snapshot.chatId);
    if (snapshots === undefined) {
      this.snapshots.set(snapshot.chatId, [snapshot]);
      return;
    }
    snapshots.push(snapshot);
  }

  async savePoolLedgerEntry(entry: PoolLedgerEntry): Promise<void> {
    const entries = this.ledger.get(entry.chatId);
    if (entries === undefined) {
      this.ledger.set(entry.chatId, [entry]);
      return;
    }
    entries.push(entry);
  }

  async listPoolLedgerEntries(chatId: ChatId, limit: number): Promise<PoolLedgerEntry[]> {
    const entries = this.ledger.get(chatId);
    if (entries === undefined) {
      return [];
    }
    return [...entries].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, limit);
  }

  async getPoolLedgerEntryByTransactionHash(transactionHash: Hex): Promise<PoolLedgerEntry | null> {
    for (const entries of this.ledger.values()) {
      const match = entries.find((entry) => entry.transactionHash?.toLowerCase() === transactionHash.toLowerCase());
      if (match !== undefined) {
        return match;
      }
    }
    return null;
  }

  async getPoolWithdrawalRequest(id: string): Promise<PoolWithdrawalRequest | null> {
    const request = this.withdrawals.get(id);
    return request === undefined ? null : request;
  }

  async savePoolWithdrawalRequest(request: PoolWithdrawalRequest): Promise<void> {
    this.withdrawals.set(request.id, request);
  }

  async listPoolWithdrawalRequests(chatId: ChatId, status?: PoolWithdrawalStatus): Promise<PoolWithdrawalRequest[]> {
    return [...this.withdrawals.values()]
      .filter((request) => request.chatId === chatId && (status === undefined || request.status === status))
      .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime());
  }

  async listPoolWithdrawalRequestsByTelegramUserId(chatId: ChatId, telegramUserId: string): Promise<PoolWithdrawalRequest[]> {
    return [...this.withdrawals.values()]
      .filter((request) => request.chatId === chatId && request.telegramUserId === telegramUserId)
      .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime());
  }
}

function poolMemberKey(chatId: ChatId, telegramUserId: string): string {
  return `${chatId}:${telegramUserId}`;
}
