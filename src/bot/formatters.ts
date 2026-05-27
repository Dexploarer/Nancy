import type { ChainTransaction, FlapLaunchProposal, GroupWallet, SafeSubmission, TradeProposal } from "../domain/types.js";
import { formatBnb } from "../utils/evm.js";
import type { SafeDeployment } from "../services/safeDeploymentService.js";
import type { SafeTransactionServiceStatus } from "../chain/safeService.js";

export function formatWallet(wallet: GroupWallet): string {
  return [
    "Group wallet",
    `Safe: ${wallet.safeAddress}`,
    `Threshold: ${wallet.threshold}/${wallet.owners.length}`,
    `Owners: ${wallet.owners.join(", ")}`
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
    `1. Open ${signingUrl}.`,
    `2. Sign with a linked Safe owner wallet and submit from the page.`
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
