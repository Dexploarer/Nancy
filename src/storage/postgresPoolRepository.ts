import { Pool as PgPool } from "pg";
import type { Address, Hex } from "viem";
import type {
  ChatId,
  PoolLedgerEntry,
  PoolLedgerEntryType,
  PoolMember,
  PoolNavSnapshot,
  PoolRole,
  PoolWithdrawalRequest,
  PoolWithdrawalStatus
} from "../domain/types.js";
import type { PoolRepository } from "./poolRepository.js";

type PoolMemberRow = {
  chat_id: string;
  telegram_user_id: string;
  role: PoolRole;
  shares: string;
  deposited_wei: string;
  withdrawn_wei: string;
  created_at: Date;
  updated_at: Date;
};

type PoolNavSnapshotRow = {
  id: string;
  chat_id: string;
  nav_wei: string;
  liquid_wei: string;
  positions_wei: string;
  total_shares: string;
  captured_at: Date;
};

type PoolLedgerEntryRow = {
  id: string;
  chat_id: string;
  telegram_user_id: string;
  type: PoolLedgerEntryType;
  amount_wei: string;
  shares_delta: string;
  nav_wei: string;
  total_shares_after: string;
  transaction_hash: Hex | null;
  created_at: Date;
};

type PoolWithdrawalRequestRow = {
  id: string;
  chat_id: string;
  telegram_user_id: string;
  recipient_address: Address;
  shares: string;
  gross_amount_wei: string;
  fee_amount_wei: string;
  net_amount_wei: string;
  nav_wei: string;
  total_shares_at_request: string;
  status: PoolWithdrawalStatus;
  requested_at: Date;
  prepared_at: Date | null;
  executed_at: Date | null;
  cancelled_at: Date | null;
  safe_submission_id: string | null;
  execution_transaction_hash: Hex | null;
};

export class PostgresPoolRepository implements PoolRepository {
  private readonly pool: PgPool;

  constructor(databaseUrl: string) {
    this.pool = new PgPool({ connectionString: databaseUrl });
  }

  async getPoolMember(chatId: ChatId, telegramUserId: string): Promise<PoolMember | null> {
    const result = await this.pool.query<PoolMemberRow>(
      `select chat_id, telegram_user_id, role, shares, deposited_wei, withdrawn_wei, created_at, updated_at
       from pool_members where chat_id = $1 and telegram_user_id = $2`,
      [chatId, telegramUserId]
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMember(row);
  }

  async listPoolMembers(chatId: ChatId): Promise<PoolMember[]> {
    const result = await this.pool.query<PoolMemberRow>(
      `select chat_id, telegram_user_id, role, shares, deposited_wei, withdrawn_wei, created_at, updated_at
       from pool_members where chat_id = $1 order by shares desc, telegram_user_id asc`,
      [chatId]
    );
    return result.rows.map(mapMember);
  }

  async savePoolMember(member: PoolMember): Promise<void> {
    await this.pool.query(
      `insert into pool_members(
        chat_id, telegram_user_id, role, shares, deposited_wei, withdrawn_wei, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (chat_id, telegram_user_id) do update set
        role = excluded.role,
        shares = excluded.shares,
        deposited_wei = excluded.deposited_wei,
        withdrawn_wei = excluded.withdrawn_wei,
        updated_at = excluded.updated_at`,
      [
        member.chatId,
        member.telegramUserId,
        member.role,
        member.shares.toString(),
        member.depositedWei.toString(),
        member.withdrawnWei.toString(),
        member.createdAt,
        member.updatedAt
      ]
    );
  }

  async getLatestPoolNavSnapshot(chatId: ChatId): Promise<PoolNavSnapshot | null> {
    const result = await this.pool.query<PoolNavSnapshotRow>(
      `select id, chat_id, nav_wei, liquid_wei, positions_wei, total_shares, captured_at
       from pool_nav_snapshots where chat_id = $1 order by captured_at desc limit 1`,
      [chatId]
    );
    const row = result.rows[0];
    return row === undefined ? null : mapSnapshot(row);
  }

  async savePoolNavSnapshot(snapshot: PoolNavSnapshot): Promise<void> {
    await this.pool.query(
      `insert into pool_nav_snapshots(id, chat_id, nav_wei, liquid_wei, positions_wei, total_shares, captured_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        snapshot.id,
        snapshot.chatId,
        snapshot.navWei.toString(),
        snapshot.liquidWei.toString(),
        snapshot.positionsWei.toString(),
        snapshot.totalShares.toString(),
        snapshot.capturedAt
      ]
    );
  }

  async savePoolLedgerEntry(entry: PoolLedgerEntry): Promise<void> {
    await this.pool.query(
      `insert into pool_ledger_entries(
        id, chat_id, telegram_user_id, type, amount_wei, shares_delta,
        nav_wei, total_shares_after, transaction_hash, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.id,
        entry.chatId,
        entry.telegramUserId,
        entry.type,
        entry.amountWei.toString(),
        entry.sharesDelta.toString(),
        entry.navWei.toString(),
        entry.totalSharesAfter.toString(),
        entry.transactionHash ?? null,
        entry.createdAt
      ]
    );
  }

  async listPoolLedgerEntries(chatId: ChatId, limit: number): Promise<PoolLedgerEntry[]> {
    const result = await this.pool.query<PoolLedgerEntryRow>(
      `select id, chat_id, telegram_user_id, type, amount_wei, shares_delta,
        nav_wei, total_shares_after, transaction_hash, created_at
       from pool_ledger_entries where chat_id = $1 order by created_at desc limit $2`,
      [chatId, limit]
    );
    return result.rows.map(mapLedgerEntry);
  }

  async getPoolLedgerEntryByTransactionHash(transactionHash: Hex): Promise<PoolLedgerEntry | null> {
    const result = await this.pool.query<PoolLedgerEntryRow>(
      `select id, chat_id, telegram_user_id, type, amount_wei, shares_delta,
        nav_wei, total_shares_after, transaction_hash, created_at
       from pool_ledger_entries where lower(transaction_hash) = lower($1)`,
      [transactionHash]
    );
    const row = result.rows[0];
    return row === undefined ? null : mapLedgerEntry(row);
  }

  async getPoolWithdrawalRequest(id: string): Promise<PoolWithdrawalRequest | null> {
    const result = await this.pool.query<PoolWithdrawalRequestRow>(
      `select id, chat_id, telegram_user_id, recipient_address, shares, gross_amount_wei,
        fee_amount_wei, net_amount_wei, nav_wei, total_shares_at_request, status,
        requested_at, prepared_at, executed_at, cancelled_at, safe_submission_id,
        execution_transaction_hash
       from pool_withdrawal_requests where id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row === undefined ? null : mapWithdrawal(row);
  }

  async savePoolWithdrawalRequest(request: PoolWithdrawalRequest): Promise<void> {
    await this.pool.query(
      `insert into pool_withdrawal_requests(
        id, chat_id, telegram_user_id, recipient_address, shares, gross_amount_wei,
        fee_amount_wei, net_amount_wei, nav_wei, total_shares_at_request, status,
        requested_at, prepared_at, executed_at, cancelled_at, safe_submission_id,
        execution_transaction_hash
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      on conflict (id) do update set
        status = excluded.status,
        prepared_at = excluded.prepared_at,
        executed_at = excluded.executed_at,
        cancelled_at = excluded.cancelled_at,
        safe_submission_id = excluded.safe_submission_id,
        execution_transaction_hash = excluded.execution_transaction_hash`,
      [
        request.id,
        request.chatId,
        request.telegramUserId,
        request.recipientAddress,
        request.shares.toString(),
        request.grossAmountWei.toString(),
        request.feeAmountWei.toString(),
        request.netAmountWei.toString(),
        request.navWei.toString(),
        request.totalSharesAtRequest.toString(),
        request.status,
        request.requestedAt,
        request.preparedAt ?? null,
        request.executedAt ?? null,
        request.cancelledAt ?? null,
        request.safeSubmissionId ?? null,
        request.executionTransactionHash ?? null
      ]
    );
  }

  async listPoolWithdrawalRequests(chatId: ChatId, status?: PoolWithdrawalStatus): Promise<PoolWithdrawalRequest[]> {
    const result =
      status === undefined
        ? await this.pool.query<PoolWithdrawalRequestRow>(withdrawalSelect("chat_id = $1"), [chatId])
        : await this.pool.query<PoolWithdrawalRequestRow>(withdrawalSelect("chat_id = $1 and status = $2"), [chatId, status]);
    return result.rows.map(mapWithdrawal);
  }

  async listPoolWithdrawalRequestsByTelegramUserId(chatId: ChatId, telegramUserId: string): Promise<PoolWithdrawalRequest[]> {
    const result = await this.pool.query<PoolWithdrawalRequestRow>(
      withdrawalSelect("chat_id = $1 and telegram_user_id = $2"),
      [chatId, telegramUserId]
    );
    return result.rows.map(mapWithdrawal);
  }
}

function withdrawalSelect(whereClause: string): string {
  return `select id, chat_id, telegram_user_id, recipient_address, shares, gross_amount_wei,
    fee_amount_wei, net_amount_wei, nav_wei, total_shares_at_request, status,
    requested_at, prepared_at, executed_at, cancelled_at, safe_submission_id,
    execution_transaction_hash
   from pool_withdrawal_requests where ${whereClause} order by requested_at desc`;
}

function mapMember(row: PoolMemberRow): PoolMember {
  return {
    chatId: row.chat_id,
    telegramUserId: row.telegram_user_id,
    role: row.role,
    shares: BigInt(row.shares),
    depositedWei: BigInt(row.deposited_wei),
    withdrawnWei: BigInt(row.withdrawn_wei),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSnapshot(row: PoolNavSnapshotRow): PoolNavSnapshot {
  return {
    id: row.id,
    chatId: row.chat_id,
    navWei: BigInt(row.nav_wei),
    liquidWei: BigInt(row.liquid_wei),
    positionsWei: BigInt(row.positions_wei),
    totalShares: BigInt(row.total_shares),
    capturedAt: row.captured_at
  };
}

function mapLedgerEntry(row: PoolLedgerEntryRow): PoolLedgerEntry {
  return {
    id: row.id,
    chatId: row.chat_id,
    telegramUserId: row.telegram_user_id,
    type: row.type,
    amountWei: BigInt(row.amount_wei),
    sharesDelta: BigInt(row.shares_delta),
    navWei: BigInt(row.nav_wei),
    totalSharesAfter: BigInt(row.total_shares_after),
    createdAt: row.created_at,
    ...(row.transaction_hash === null ? {} : { transactionHash: row.transaction_hash })
  };
}

function mapWithdrawal(row: PoolWithdrawalRequestRow): PoolWithdrawalRequest {
  return {
    id: row.id,
    chatId: row.chat_id,
    telegramUserId: row.telegram_user_id,
    recipientAddress: row.recipient_address,
    shares: BigInt(row.shares),
    grossAmountWei: BigInt(row.gross_amount_wei),
    feeAmountWei: BigInt(row.fee_amount_wei),
    netAmountWei: BigInt(row.net_amount_wei),
    navWei: BigInt(row.nav_wei),
    totalSharesAtRequest: BigInt(row.total_shares_at_request),
    status: row.status,
    requestedAt: row.requested_at,
    ...(row.prepared_at === null ? {} : { preparedAt: row.prepared_at }),
    ...(row.executed_at === null ? {} : { executedAt: row.executed_at }),
    ...(row.cancelled_at === null ? {} : { cancelledAt: row.cancelled_at }),
    ...(row.safe_submission_id === null ? {} : { safeSubmissionId: row.safe_submission_id }),
    ...(row.execution_transaction_hash === null ? {} : { executionTransactionHash: row.execution_transaction_hash })
  };
}
