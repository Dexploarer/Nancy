import type {
  ChatId,
  PoolLedgerEntry,
  PoolMember,
  PoolNavSnapshot,
  PoolWithdrawalRequest,
  PoolWithdrawalStatus
} from "../domain/types.js";
import type { Hex } from "viem";

export interface PoolRepository {
  getPoolMember(chatId: ChatId, telegramUserId: string): Promise<PoolMember | null>;
  listPoolMembers(chatId: ChatId): Promise<PoolMember[]>;
  savePoolMember(member: PoolMember): Promise<void>;
  getLatestPoolNavSnapshot(chatId: ChatId): Promise<PoolNavSnapshot | null>;
  savePoolNavSnapshot(snapshot: PoolNavSnapshot): Promise<void>;
  savePoolLedgerEntry(entry: PoolLedgerEntry): Promise<void>;
  listPoolLedgerEntries(chatId: ChatId, limit: number): Promise<PoolLedgerEntry[]>;
  getPoolLedgerEntryByTransactionHash(transactionHash: Hex): Promise<PoolLedgerEntry | null>;
  getPoolWithdrawalRequest(id: string): Promise<PoolWithdrawalRequest | null>;
  savePoolWithdrawalRequest(request: PoolWithdrawalRequest): Promise<void>;
  listPoolWithdrawalRequests(chatId: ChatId, status?: PoolWithdrawalStatus): Promise<PoolWithdrawalRequest[]>;
  listPoolWithdrawalRequestsByTelegramUserId(chatId: ChatId, telegramUserId: string): Promise<PoolWithdrawalRequest[]>;
}
