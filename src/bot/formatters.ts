import type { ChainTransaction, FlapLaunchProposal, GroupWallet, SafeSubmission, TradeProposal } from "../domain/types.js";
import { formatBnb } from "../utils/evm.js";

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

export function formatSafeSubmission(submission: SafeSubmission): string {
  return [
    `Safe submission ${submission.id}`,
    `Source: ${submission.sourceType} ${submission.sourceId}`,
    `Status: ${submission.status}`,
    `Safe: ${submission.safeAddress}`,
    `Safe tx hash: ${submission.safeTxHash}`,
    `Nonce: ${submission.safeTransaction.nonce.toString()}`,
    `Service: ${submission.transactionServiceUrl}`,
    "Owner flow:",
    `1. Sign the Safe tx hash with personal_sign / eth_sign.`,
    `2. Submit it here: /safe_submit ${submission.id} <ownerAddress> <signature>`
  ].join("\n");
}

export function formatSafeStatus(status: unknown): string {
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
