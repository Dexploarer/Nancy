import type { Address, Hex } from "viem";

export type ChatId = string;

export type ChainTransaction = {
  to: Address;
  value: bigint;
  data: Hex;
  label: string;
};

export type SafeOperation = 0 | 1;

export type SafeTransactionData = {
  to: Address;
  value: bigint;
  data: Hex;
  operation: SafeOperation;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Address;
  refundReceiver: Address;
  nonce: bigint;
};

export type GroupWallet = {
  chatId: ChatId;
  safeAddress: Address;
  threshold: number;
  owners: Address[];
  createdAt: Date;
};

export type WalletLink = {
  telegramUserId: string;
  address: Address;
  nonce: string;
  status: "pending" | "linked";
  createdAt: Date;
  linkedAt?: Date;
};

export type FlapTokenStatus = "invalid" | "staged" | "tradable" | "dex" | "unknown";

export type TradeRoute = "flap-portal" | "pancakeswap-v2";

export type TradeProposalStatus = "created";

export type TradeProposal = {
  id: string;
  chatId: ChatId;
  proposerTelegramId: string;
  tokenAddress: Address;
  inputAmountWei: bigint;
  minOutputAmount: bigint;
  feeAmountWei: bigint;
  route: TradeRoute;
  status: TradeProposalStatus;
  riskReport: TokenRiskReport;
  transactions: ChainTransaction[];
  createdAt: Date;
};

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type TokenRiskReport = {
  tokenAddress: Address;
  level: RiskLevel;
  blocked: boolean;
  reasons: string[];
  liquidityUsd?: number;
  pairUrl?: string;
  buyTaxBps?: number;
  sellTaxBps?: number;
  checkedAt: Date;
};

export type VaultRecipient = {
  address: Address;
  bps: number;
};

export type FlapLaunchProposal = {
  id: string;
  chatId: ChatId;
  proposerTelegramId: string;
  name: string;
  symbol: string;
  metadataUri: string;
  buyTaxBps: number;
  sellTaxBps: number;
  taxDurationSeconds: number;
  initialBuyWei: bigint;
  recipients: VaultRecipient[];
  salt: Hex;
  transactions: ChainTransaction[];
  createdAt: Date;
};

export type SafeSubmissionSourceType = "trade" | "flap-launch";

export type SafeSubmissionStatus = "prepared" | "submitted";

export type SafeSubmission = {
  id: string;
  chatId: ChatId;
  sourceType: SafeSubmissionSourceType;
  sourceId: string;
  safeAddress: Address;
  safeTxHash: Hex;
  safeTransaction: SafeTransactionData;
  transactionServiceUrl: string;
  status: SafeSubmissionStatus;
  senderAddress?: Address;
  submittedAt?: Date;
  createdAt: Date;
};
