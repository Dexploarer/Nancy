import type { ChainTransaction, SafeTransactionData, TokenRiskReport } from "../domain/types.js";

export type StoredChainTransaction = Omit<ChainTransaction, "value"> & {
  value: string;
};

export type StoredSafeTransactionData = Omit<
  SafeTransactionData,
  "value" | "safeTxGas" | "baseGas" | "gasPrice" | "nonce"
> & {
  value: string;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  nonce: string;
};

export type StoredTokenRiskReport = Omit<TokenRiskReport, "checkedAt"> & {
  checkedAt: string;
};

export function serializeTransactions(transactions: ChainTransaction[]): StoredChainTransaction[] {
  return transactions.map((transaction) => ({
    ...transaction,
    value: transaction.value.toString()
  }));
}

export function deserializeTransactions(transactions: StoredChainTransaction[]): ChainTransaction[] {
  return transactions.map((transaction) => ({
    ...transaction,
    value: BigInt(transaction.value)
  }));
}

export function serializeSafeTransaction(transaction: SafeTransactionData): StoredSafeTransactionData {
  return {
    ...transaction,
    value: transaction.value.toString(),
    safeTxGas: transaction.safeTxGas.toString(),
    baseGas: transaction.baseGas.toString(),
    gasPrice: transaction.gasPrice.toString(),
    nonce: transaction.nonce.toString()
  };
}

export function deserializeSafeTransaction(transaction: StoredSafeTransactionData): SafeTransactionData {
  return {
    ...transaction,
    value: BigInt(transaction.value),
    safeTxGas: BigInt(transaction.safeTxGas),
    baseGas: BigInt(transaction.baseGas),
    gasPrice: BigInt(transaction.gasPrice),
    nonce: BigInt(transaction.nonce)
  };
}

export function serializeRiskReport(report: TokenRiskReport): StoredTokenRiskReport {
  return {
    ...report,
    checkedAt: report.checkedAt.toISOString()
  };
}

export function deserializeRiskReport(report: StoredTokenRiskReport): TokenRiskReport {
  return {
    ...report,
    checkedAt: new Date(report.checkedAt)
  };
}
