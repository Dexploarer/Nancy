import type {
  ChainTransaction,
  FlapLaunchProposal,
  GroupWallet,
  ManagedWallet,
  SafeCreationSession,
  SafeSubmission,
  TradeProposal
} from "../domain/types.js";
import { formatBnb } from "../utils/evm.js";
import type { SafeDeployment } from "../services/safeDeploymentService.js";
import type { SafeTransactionServiceStatus } from "../chain/safeService.js";
import type { GeneratedManagedWallet } from "../services/managedWalletService.js";

export function formatWallet(wallet: GroupWallet): string {
  return [
    "Group wallet",
    `Safe: ${wallet.safeAddress}`,
    `Threshold: ${wallet.threshold}/${wallet.owners.length}`,
    `Owners: ${wallet.owners.join(", ")}`
  ].join("\n");
}

export function formatManagedWallet(wallet: ManagedWallet): string {
  return ["Bot-managed owner wallet", `Address: ${wallet.address}`, `Created: ${wallet.createdAt.toISOString()}`].join("\n");
}

export function formatGeneratedManagedWallet(generated: GeneratedManagedWallet): string {
  return [
    "Bot-managed owner wallet created",
    `Address: ${generated.wallet.address}`,
    "Save this private key now. It will not be shown again.",
    generated.privateKey
  ].join("\n");
}

export function formatTradeProposal(proposal: TradeProposal): string {
  return [
    `Trade proposal ${proposal.id}`,
    `Route: ${proposal.route}`,
    `Status: ${proposal.status}`,
    `Token: ${proposal.tokenAddress}`,
    `Input: ${formatBnb(proposal.inputAmountWei)}`,
    `Platform fee: ${formatBnb(proposal.feeAmountWei)}`,
    `Minimum output: ${proposal.minOutputAmount.toString()}`,
    `Risk: ${proposal.riskReport.level}${proposal.riskReport.reasons.length === 0 ? "" : ` (${proposal.riskReport.reasons.join("; ")})`}`,
    formatTransactions(proposal.transactions)
  ].join("\n");
}

export function formatFlapLaunch(proposal: FlapLaunchProposal): string {
  return [
    `Flap launch ${proposal.id}`,
    `${proposal.name} (${proposal.symbol})`,
    `Metadata: ${proposal.metadataUri}`,
    `Buy tax: ${proposal.buyTaxBps} bps`,
    `Sell tax: ${proposal.sellTaxBps} bps`,
    `Tax duration: ${proposal.taxDurationSeconds} seconds`,
    `Initial buy: ${formatBnb(proposal.initialBuyWei)}`,
    `Recipients: ${proposal.recipients.map((recipient) => `${recipient.address}:${recipient.bps}`).join(", ")}`,
    `Salt: ${proposal.salt}`,
    formatTransactions(proposal.transactions)
  ].join("\n");
}

export function formatSafeDeployment(deployment: SafeDeployment): string {
  return [
    "Safe created",
    `Safe: ${deployment.safeAddress}`,
    `Threshold: ${deployment.threshold}/${deployment.owners.length}`,
    `Owners: ${deployment.owners.join(", ")}`,
    `Deployment tx: ${deployment.transactionHash}`
  ].join("\n");
}

export function formatSafeCreationSession(session: SafeCreationSession): string {
  return [
    `Group Safe setup ${session.id}`,
    `Status: ${session.status}`,
    `Threshold: ${session.threshold}/${session.owners.length}`,
    session.owners.length === 0
      ? "Owners: none joined yet"
      : `Owners:\n${session.owners.map((owner, index) => `${index + 1}. ${owner.address}`).join("\n")}`,
    session.deployedSafeAddress === undefined ? "" : `Safe: ${session.deployedSafeAddress}`,
    session.deploymentTxHash === undefined ? "" : `Deployment tx: ${session.deploymentTxHash}`
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function formatSafeSubmission(submission: SafeSubmission, publicBaseUrl?: string): string {
  const signingUrl =
    publicBaseUrl === undefined ? `/sign/${submission.id}` : `${publicBaseUrl.replace(/\/$/, "")}/sign/${submission.id}`;
  return [
    `Safe submission ${submission.id}`,
    `Source: ${submission.sourceType} ${submission.sourceId}`,
    `Status: ${submission.status}`,
    `Safe: ${submission.safeAddress}`,
    `Safe tx hash: ${submission.safeTxHash}`,
    `Nonce: ${submission.safeTransaction.nonce.toString()}`,
    `Service: ${submission.transactionServiceUrl}`,
    "Owner flow:",
    `1. Tap Approve with managed wallet, or open ${signingUrl}.`,
    `2. External owners sign with a linked Safe owner wallet and submit from the page.`
  ].join("\n");
}

export function formatSafeStatus(status: SafeTransactionServiceStatus): string {
  return `Safe status:\n${JSON.stringify(status, null, 2)}`;
}

function formatTransactions(transactions: ChainTransaction[]): string {
  if (transactions.length === 0) {
    return "Transactions: none";
  }
  return [
    "Transactions:",
    ...transactions.map(
      (transaction, index) =>
        `${index + 1}. ${transaction.label} to ${transaction.to} value=${transaction.value.toString()} data=${transaction.data}`
    )
  ].join("\n");
}
