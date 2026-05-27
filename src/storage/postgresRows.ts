import type { Address, Hex } from "viem";
import type {
  SafeCreationOwner,
  SafeCreationSessionStatus,
  SafeSubmissionSourceType,
  SafeSubmissionStatus,
  TradeProposalStatus,
  TradeRoute,
  VaultRecipient
} from "../domain/types.js";
import type { StoredChainTransaction, StoredSafeTransactionData, StoredTokenRiskReport } from "./postgresSerialization.js";

export type GroupWalletRow = {
  chat_id: string;
  safe_address: Address;
  threshold: number;
  owners: Address[];
  created_at: Date;
};

export type TradeProposalRow = {
  id: string;
  chat_id: string;
  proposer_telegram_id: string;
  token_address: Address;
  input_amount_wei: string;
  min_output_amount: string;
  fee_amount_wei: string;
  route: TradeRoute;
  status: TradeProposalStatus;
  risk_report: StoredTokenRiskReport;
  transactions: StoredChainTransaction[];
  created_at: Date;
};

export type WalletLinkRow = {
  telegram_user_id: string;
  address: Address;
  nonce: string;
  status: "pending" | "linked";
  created_at: Date;
  linked_at: Date | null;
};

export type SafeCreationSessionRow = {
  id: string;
  chat_id: string;
  creator_telegram_id: string;
  threshold: number;
  owners: SafeCreationOwner[];
  status: SafeCreationSessionStatus;
  deployed_safe_address: Address | null;
  deployment_tx_hash: Hex | null;
  created_at: Date;
};

export type FlapLaunchRow = {
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
  transactions: StoredChainTransaction[];
  created_at: Date;
};

export type SafeSubmissionRow = {
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
