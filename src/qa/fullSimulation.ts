import type { Address, Hex } from "viem";
import { parseEther } from "viem";
import type { PoolAnalytics } from "../domain/types.js";
import { Logger } from "../logger.js";
import { DepositVerificationService } from "../services/depositVerificationService.js";
import { PoolService } from "../services/poolService.js";
import { SafeGroupSetupService } from "../services/safeGroupSetupService.js";
import { SafeSubmissionService } from "../services/safeSubmissionService.js";
import { WalletLinkService } from "../services/walletLinkService.js";
import { MemoryPoolRepository } from "../storage/memoryPoolRepository.js";
import { MemoryRepository } from "../storage/memoryRepository.js";
import {
  createSimulationWallet,
  expectFailure,
  SimulatedDepositClient,
  SimulatedSafeDeploymentService,
  SimulatedSafeService,
  simulationHash,
  submitOwnerSignature,
  verifyAndCreditDeposit
} from "./fullSimulationFakes.js";

const chatId = "sim_group";
const platformFeeRecipient: Address = "0x8888888888888888888888888888888888888888";
const tokenAddress: Address = "0x7777777777777777777777777777777777777777";

type SimulationMember = {
  telegramUserId: string;
  role: "owner" | "trader" | "member";
  sharesWei: string;
  ownershipBps: number;
  activeValueWei: string;
  queuedWithdrawalWei: string;
  depositedWei: string;
  withdrawnWei: string;
  pnlWei: string;
};

type SimulationSnapshot = {
  navWei: string;
  liquidWei: string;
  positionsWei: string;
  activeNavWei: string;
  reservedWithdrawalWei: string;
  totalSharesWei: string;
  ownershipBpsTotal: number;
  members: SimulationMember[];
};

export type FullSimulationResult = {
  safe: {
    safeAddress: Address;
    threshold: number;
    owners: Address[];
    tradeConfirmationsAfterFirstSignature: number;
    tradeConfirmationsAfterSecondSignature: number;
    tradeConfirmationOwners: Address[];
    tradeExecutionRejectedBeforeThreshold: boolean;
    tradeExecutionHash: Hex;
    withdrawalConfirmationsAfterFirstSignature: number;
    withdrawalConfirmationsAfterSecondSignature: number;
    withdrawalConfirmationOwners: Address[];
    withdrawalExecutionHash: Hex;
  };
  pool: {
    afterDeposits: SimulationSnapshot;
    afterProfit: SimulationSnapshot;
    afterWithdrawalQueued: SimulationSnapshot;
    final: SimulationSnapshot;
    withdrawal: {
      sharesWei: string;
      grossAmountWei: string;
      feeAmountWei: string;
      netAmountWei: string;
    };
  };
};

export async function runFullSimulation(): Promise<FullSimulationResult> {
  const repository = new MemoryRepository();
  const poolRepository = new MemoryPoolRepository();
  const walletLinkService = new WalletLinkService(repository);
  const safeDeploymentService = new SimulatedSafeDeploymentService();
  const safeGroupSetupService = new SafeGroupSetupService(repository, safeDeploymentService, walletLinkService);
  const poolService = new PoolService(repository, poolRepository, 25);
  const safeService = new SimulatedSafeService(2);
  const safeSubmissionService = new SafeSubmissionService(
    repository,
    safeService,
    walletLinkService,
    poolService,
    platformFeeRecipient
  );
  const depositClient = new SimulatedDepositClient();
  const depositVerificationService = new DepositVerificationService("https://sim.invalid", 56, depositClient);

  const ownerOne = await createSimulationWallet(walletLinkService, "owner-1", 1);
  const ownerTwo = await createSimulationWallet(walletLinkService, "owner-2", 2);
  await createSimulationWallet(walletLinkService, "trader", 3);
  const memberA = await createSimulationWallet(walletLinkService, "member-a", 4);
  const memberB = await createSimulationWallet(walletLinkService, "member-b", 5);

  const session = await safeGroupSetupService.createSession(chatId, "owner-1", 2);
  await safeGroupSetupService.joinWithWallet(session.id, "owner-1", ownerOne.address);
  await safeGroupSetupService.joinWithWallet(session.id, "owner-2", ownerTwo.address);
  const deployment = await safeGroupSetupService.deploy(session.id);

  await poolService.initializePool(chatId, "owner-1");
  await poolService.setRole({ chatId, operatorTelegramId: "owner-1", targetTelegramId: "owner-2", role: "owner" });
  await poolService.setRole({ chatId, operatorTelegramId: "owner-1", targetTelegramId: "trader", role: "trader" });

  await verifyAndCreditDeposit({
    chatId,
    depositClient,
    depositVerificationService,
    poolService,
    telegramUserId: "owner-1",
    sender: ownerOne.address,
    amountWei: parseEther("10"),
    transactionHash: simulationHash(11)
  });
  await verifyAndCreditDeposit({
    chatId,
    depositClient,
    depositVerificationService,
    poolService,
    telegramUserId: "member-a",
    sender: memberA.address,
    amountWei: parseEther("30"),
    transactionHash: simulationHash(12)
  });
  await verifyAndCreditDeposit({
    chatId,
    depositClient,
    depositVerificationService,
    poolService,
    telegramUserId: "member-b",
    sender: memberB.address,
    amountWei: parseEther("60"),
    transactionHash: simulationHash(13)
  });
  const afterDeposits = await poolService.getAnalytics(chatId, "member-a");

  await poolService.requireTraderAccess(chatId, "trader");
  await expectFailure(poolService.requireTraderAccess(chatId, "member-a"));
  await repository.saveTradeProposal({
    id: "trade_sim",
    chatId,
    proposerTelegramId: "trader",
    tokenAddress,
    inputAmountWei: parseEther("5"),
    minOutputAmount: 2500n,
    feeAmountWei: parseEther("0.005"),
    route: "pancakeswap-v2",
    status: "created",
    riskReport: {
      tokenAddress,
      level: "low",
      blocked: false,
      reasons: [],
      checkedAt: new Date("2026-05-27T00:00:00.000Z")
    },
    transactions: [
      {
        to: tokenAddress,
        value: parseEther("5"),
        data: "0x",
        label: "Simulated pool token buy"
      }
    ],
    createdAt: new Date("2026-05-27T00:00:00.000Z")
  });
  const tradeSubmission = await safeSubmissionService.prepareTradeSubmission(chatId, "trade_sim");
  await submitOwnerSignature(safeSubmissionService, tradeSubmission, ownerOne);
  const tradeConfirmationsAfterFirstSignature = safeService.confirmationCount(tradeSubmission.safeTxHash);
  const tradeExecutionRejectedBeforeThreshold = await expectFailure(safeSubmissionService.execute(tradeSubmission.id));
  await submitOwnerSignature(safeSubmissionService, tradeSubmission, ownerTwo);
  const tradeConfirmationsAfterSecondSignature = safeService.confirmationCount(tradeSubmission.safeTxHash);
  const tradeConfirmationOwners = safeService.confirmationOwners(tradeSubmission.safeTxHash);
  const tradeExecutionHash = await safeSubmissionService.execute(tradeSubmission.id);

  await poolService.updateNav({
    chatId,
    operatorTelegramId: "owner-1",
    navWei: parseEther("150"),
    liquidWei: parseEther("90"),
    positionsWei: parseEther("60")
  });
  const afterProfit = await poolService.getAnalytics(chatId, "member-a");

  const withdrawal = await poolService.requestWithdrawal({
    chatId,
    telegramUserId: "member-a",
    recipientAddress: memberA.address,
    withdrawalBps: 5000
  });
  const afterWithdrawalQueued = await poolService.getAnalytics(chatId, "member-a");
  const withdrawalSubmission = await safeSubmissionService.prepareWithdrawalSubmission(chatId, withdrawal.id);
  await submitOwnerSignature(safeSubmissionService, withdrawalSubmission, ownerOne);
  const withdrawalConfirmationsAfterFirstSignature = safeService.confirmationCount(withdrawalSubmission.safeTxHash);
  await submitOwnerSignature(safeSubmissionService, withdrawalSubmission, ownerTwo);
  const withdrawalConfirmationsAfterSecondSignature = safeService.confirmationCount(withdrawalSubmission.safeTxHash);
  const withdrawalConfirmationOwners = safeService.confirmationOwners(withdrawalSubmission.safeTxHash);
  const withdrawalExecutionHash = await safeSubmissionService.execute(withdrawalSubmission.id);
  const finalAnalytics = await poolService.getAnalytics(chatId, "member-a");

  return {
    safe: {
      safeAddress: deployment.wallet.safeAddress,
      threshold: deployment.wallet.threshold,
      owners: deployment.wallet.owners,
      tradeConfirmationsAfterFirstSignature,
      tradeConfirmationsAfterSecondSignature,
      tradeConfirmationOwners,
      tradeExecutionRejectedBeforeThreshold,
      tradeExecutionHash,
      withdrawalConfirmationsAfterFirstSignature,
      withdrawalConfirmationsAfterSecondSignature,
      withdrawalConfirmationOwners,
      withdrawalExecutionHash
    },
    pool: {
      afterDeposits: snapshot(afterDeposits),
      afterProfit: snapshot(afterProfit),
      afterWithdrawalQueued: snapshot(afterWithdrawalQueued),
      final: snapshot(finalAnalytics),
      withdrawal: {
        sharesWei: withdrawal.shares.toString(),
        grossAmountWei: withdrawal.grossAmountWei.toString(),
        feeAmountWei: withdrawal.feeAmountWei.toString(),
        netAmountWei: withdrawal.netAmountWei.toString()
      }
    }
  };
}

function snapshot(analytics: PoolAnalytics): SimulationSnapshot {
  return {
    navWei: analytics.navWei.toString(),
    liquidWei: analytics.liquidWei.toString(),
    positionsWei: analytics.positionsWei.toString(),
    activeNavWei: analytics.activeNavWei.toString(),
    reservedWithdrawalWei: analytics.reservedWithdrawalWei.toString(),
    totalSharesWei: analytics.totalShares.toString(),
    ownershipBpsTotal: analytics.members.reduce((sum, member) => sum + member.ownershipBps, 0),
    members: analytics.members.map((member) => ({
      telegramUserId: member.telegramUserId,
      role: member.role,
      sharesWei: member.shares.toString(),
      ownershipBps: member.ownershipBps,
      activeValueWei: member.activeValueWei.toString(),
      queuedWithdrawalWei: member.queuedWithdrawalWei.toString(),
      depositedWei: member.depositedWei.toString(),
      withdrawnWei: member.withdrawnWei.toString(),
      pnlWei: member.unrealizedPnlWei.toString()
    }))
  };
}

if (import.meta.main) {
  const result = await runFullSimulation();
  Logger.info("[FullSimulation] Simulation completed", { result: JSON.stringify(result) });
}
