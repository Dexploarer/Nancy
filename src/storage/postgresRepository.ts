import { Pool } from "pg";
import type { Address, Hex } from "viem";
import type {
  ChainTransaction,
  ChatId,
  FlapLaunchProposal,
  GroupWallet,
  SafeSubmission,
  SafeSubmissionSourceType,
  SafeSubmissionStatus,
  SafeTransactionData,
  TradeProposal,
  TradeProposalStatus,
  TradeRoute,
  VaultRecipient
} from "../domain/types.js";
import type { Repository } from "./repository.js";

type GroupWalletRow = {
  chat_id: string;
  safe_address: Address;
  threshold: number;
  owners: Address[];
  created_at: Date;
};

type TradeProposalRow = {
  id: string;
  chat_id: string;
  proposer_telegram_id: string;
  token_address: Address;
  input_amount_wei: string;
  min_output_amount: string;
  fee_amount_wei: string;
  route: TradeRoute;
  status: TradeProposalStatus;
  transactions: ChainTransaction[];
  created_at: Date;
};

type FlapLaunchRow = {
  id: string;
  chat_id: string;
  proposer_telegram_id: string;
  name: string;
  symbol: string;
  metadata_uri: string;
  buy_tax_bps: number;
  sell_tax_bps: number;
  tax_duration_seconds: number;
  initial_buy_wei: string;
  recipients: VaultRecipient[];
  salt: Hex;
  transactions: ChainTransaction[];
  created_at: Date;
};

type SafeSubmissionRow = {
  id: string;
  chat_id: string;
  source_type: SafeSubmissionSourceType;
  source_id: string;
  safe_address: Address;
  safe_tx_hash: Hex;
  safe_transaction: StoredSafeTransactionData;
  transaction_service_url: string;
  status: SafeSubmissionStatus;
  sender_address: Address | null;
  submitted_at: Date | null;
  created_at: Date;
};

type StoredChainTransaction = Omit<ChainTransaction, "value"> & {
  value: string;
};

type StoredSafeTransactionData = Omit<
  SafeTransactionData,
  "value" | "safeTxGas" | "baseGas" | "gasPrice" | "nonce"
> & {
  value: string;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  nonce: string;
};

export class PostgresRepository implements Repository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async getGroupWallet(chatId: ChatId): Promise<GroupWallet | null> {
    const result = await this.pool.query<GroupWalletRow>(
      "select chat_id, safe_address, threshold, owners, created_at from group_wallets where chat_id = $1",
      [chatId]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      chatId: row.chat_id,
      safeAddress: row.safe_address,
      threshold: row.threshold,
      owners: row.owners,
      createdAt: row.created_at
    };
  }

  async saveGroupWallet(wallet: GroupWallet): Promise<void> {
    await this.pool.query(
      `insert into group_wallets(chat_id, safe_address, threshold, owners, created_at)
       values ($1, $2, $3, $4, $5)
       on conflict (chat_id)
       do update set safe_address = excluded.safe_address, threshold = excluded.threshold, owners = excluded.owners`,
      [wallet.chatId, wallet.safeAddress, wallet.threshold, JSON.stringify(wallet.owners), wallet.createdAt]
    );
  }

  async getTradeProposal(id: string): Promise<TradeProposal | null> {
    const result = await this.pool.query<TradeProposalRow>(
      `select id, chat_id, proposer_telegram_id, token_address, input_amount_wei, min_output_amount,
       fee_amount_wei, route, status, transactions, created_at
       from trade_proposals where id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      proposerTelegramId: row.proposer_telegram_id,
      tokenAddress: row.token_address,
      inputAmountWei: BigInt(row.input_amount_wei),
      minOutputAmount: BigInt(row.min_output_amount),
      feeAmountWei: BigInt(row.fee_amount_wei),
      route: row.route,
      status: row.status,
      transactions: deserializeTransactions(row.transactions as unknown as StoredChainTransaction[]),
      createdAt: row.created_at
    };
  }

  async saveTradeProposal(proposal: TradeProposal): Promise<void> {
    await this.pool.query(
      `insert into trade_proposals(
        id, chat_id, proposer_telegram_id, token_address, input_amount_wei, min_output_amount,
        fee_amount_wei, route, status, transactions, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        proposal.id,
        proposal.chatId,
        proposal.proposerTelegramId,
        proposal.tokenAddress,
        proposal.inputAmountWei.toString(),
        proposal.minOutputAmount.toString(),
        proposal.feeAmountWei.toString(),
        proposal.route,
        proposal.status,
        JSON.stringify(serializeTransactions(proposal.transactions)),
        proposal.createdAt
      ]
    );
  }

  async getFlapLaunch(id: string): Promise<FlapLaunchProposal | null> {
    const result = await this.pool.query<FlapLaunchRow>(
      `select id, chat_id, proposer_telegram_id, name, symbol, metadata_uri, buy_tax_bps,
       sell_tax_bps, tax_duration_seconds, initial_buy_wei, recipients, salt, transactions, created_at
       from flap_launches where id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      proposerTelegramId: row.proposer_telegram_id,
      name: row.name,
      symbol: row.symbol,
      metadataUri: row.metadata_uri,
      buyTaxBps: row.buy_tax_bps,
      sellTaxBps: row.sell_tax_bps,
      taxDurationSeconds: row.tax_duration_seconds,
      initialBuyWei: BigInt(row.initial_buy_wei),
      recipients: row.recipients,
      salt: row.salt,
      transactions: deserializeTransactions(row.transactions as unknown as StoredChainTransaction[]),
      createdAt: row.created_at
    };
  }

  async saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void> {
    await this.pool.query(
      `insert into flap_launches(
        id, chat_id, proposer_telegram_id, name, symbol, metadata_uri, buy_tax_bps,
        sell_tax_bps, tax_duration_seconds, initial_buy_wei, recipients, salt, transactions, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        proposal.id,
        proposal.chatId,
        proposal.proposerTelegramId,
        proposal.name,
        proposal.symbol,
        proposal.metadataUri,
        proposal.buyTaxBps,
        proposal.sellTaxBps,
        proposal.taxDurationSeconds,
        proposal.initialBuyWei.toString(),
        JSON.stringify(proposal.recipients),
        proposal.salt,
        JSON.stringify(serializeTransactions(proposal.transactions)),
        proposal.createdAt
      ]
    );
  }

  async getSafeSubmission(id: string): Promise<SafeSubmission | null> {
    const result = await this.pool.query<SafeSubmissionRow>(
      `select id, chat_id, source_type, source_id, safe_address, safe_tx_hash, safe_transaction,
       transaction_service_url, status, sender_address, submitted_at, created_at
       from safe_submissions where id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      safeAddress: row.safe_address,
      safeTxHash: row.safe_tx_hash,
      safeTransaction: deserializeSafeTransaction(row.safe_transaction),
      transactionServiceUrl: row.transaction_service_url,
      status: row.status,
      ...(row.sender_address === null ? {} : { senderAddress: row.sender_address }),
      ...(row.submitted_at === null ? {} : { submittedAt: row.submitted_at }),
      createdAt: row.created_at
    };
  }

  async saveSafeSubmission(submission: SafeSubmission): Promise<void> {
    await this.pool.query(
      `insert into safe_submissions(
        id, chat_id, source_type, source_id, safe_address, safe_tx_hash, safe_transaction,
        transaction_service_url, status, sender_address, submitted_at, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (id) do update set
        safe_tx_hash = excluded.safe_tx_hash,
        safe_transaction = excluded.safe_transaction,
        transaction_service_url = excluded.transaction_service_url,
        status = excluded.status,
        sender_address = excluded.sender_address,
        submitted_at = excluded.submitted_at`,
      [
        submission.id,
        submission.chatId,
        submission.sourceType,
        submission.sourceId,
        submission.safeAddress,
        submission.safeTxHash,
        JSON.stringify(serializeSafeTransaction(submission.safeTransaction)),
        submission.transactionServiceUrl,
        submission.status,
        submission.senderAddress ?? null,
        submission.submittedAt ?? null,
        submission.createdAt
      ]
    );
  }
}

function serializeTransactions(transactions: ChainTransaction[]): StoredChainTransaction[] {
  return transactions.map((transaction) => ({
    ...transaction,
    value: transaction.value.toString()
  }));
}

function deserializeTransactions(transactions: StoredChainTransaction[]): ChainTransaction[] {
  return transactions.map((transaction) => ({
    ...transaction,
    value: BigInt(transaction.value)
  }));
}

function serializeSafeTransaction(transaction: SafeTransactionData): StoredSafeTransactionData {
  return {
    ...transaction,
    value: transaction.value.toString(),
    safeTxGas: transaction.safeTxGas.toString(),
    baseGas: transaction.baseGas.toString(),
    gasPrice: transaction.gasPrice.toString(),
    nonce: transaction.nonce.toString()
  };
}

function deserializeSafeTransaction(transaction: StoredSafeTransactionData): SafeTransactionData {
  return {
    ...transaction,
    value: BigInt(transaction.value),
    safeTxGas: BigInt(transaction.safeTxGas),
    baseGas: BigInt(transaction.baseGas),
    gasPrice: BigInt(transaction.gasPrice),
    nonce: BigInt(transaction.nonce)
  };
}
