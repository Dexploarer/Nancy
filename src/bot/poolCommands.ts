import type { Bot } from "grammy";
import type { Address, Hex } from "viem";
import type { AppConfig } from "../config.js";
import { InvalidInputError, UserInputError } from "../domain/errors.js";
import type { PoolAnalytics, PoolRole, PoolWithdrawalRequest } from "../domain/types.js";
import { DepositVerificationService } from "../services/depositVerificationService.js";
import { GroupWalletService } from "../services/groupWalletService.js";
import { PoolService, type PlatformStats, type Portfolio } from "../services/poolService.js";
import { WalletLinkService } from "../services/walletLinkService.js";
import { formatBnb, parseAddress, parseBasisPoints, parseBnbAmount, parseNonNegativeBnbAmount, parseTransactionHash } from "../utils/evm.js";
import { handleUserCommand, parsePositiveInteger, requireChatId, requireGroupAdmin, requiredPart, requireTelegramUserId, splitCommand } from "./commandUtils.js";
import { poolAppKeyboard, withdrawalKeyboard } from "./keyboards.js";

export type PoolCommandDependencies = {
  groupWalletService: GroupWalletService;
  walletLinkService: WalletLinkService;
  poolService: PoolService;
  depositVerificationService: DepositVerificationService;
  config: AppConfig;
};

export function registerPoolCommands(bot: Bot, dependencies: PoolCommandDependencies): void {
  bot.command("pool_init", async (ctx) => {
    await handleUserCommand(ctx, "pool_init", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const analytics = await dependencies.poolService.initializePool(chatId, requireTelegramUserId(ctx.from?.id));
      await ctx.reply(formatPoolAnalytics(analytics), {
        reply_markup: poolAppKeyboard(chatId, dependencies.config.publicBaseUrl)
      });
    });
  });

  bot.command("pool", async (ctx) => {
    await handleUserCommand(ctx, "pool", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const analytics = await dependencies.poolService.getAnalytics(chatId, requireTelegramUserId(ctx.from?.id));
      await ctx.reply(formatPoolAnalytics(analytics), {
        reply_markup: poolAppKeyboard(chatId, dependencies.config.publicBaseUrl)
      });
    });
  });

  bot.command("pool_nav", async (ctx) => {
    await handleUserCommand(ctx, "pool_nav", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 4);
      const analytics = await dependencies.poolService.updateNav({
        chatId,
        operatorTelegramId: fromId,
        navWei: parseNonNegativeBnbAmount(requiredPart(parts, 1)),
        liquidWei: parseNonNegativeBnbAmount(requiredPart(parts, 2)),
        positionsWei: parseNonNegativeBnbAmount(requiredPart(parts, 3))
      });
      await ctx.reply(formatPoolAnalytics(analytics), {
        reply_markup: poolAppKeyboard(chatId, dependencies.config.publicBaseUrl)
      });
    });
  });

  bot.command("pool_role", async (ctx) => {
    await handleUserCommand(ctx, "pool_role", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const member = await dependencies.poolService.setRole({
        chatId,
        operatorTelegramId: requireTelegramUserId(ctx.from?.id),
        targetTelegramId: parsePositiveTelegramUserId(requiredPart(parts, 1)),
        role: parsePoolRole(requiredPart(parts, 2))
      });
      await ctx.reply(`Pool role set: ${member.telegramUserId} is ${member.role}`);
    });
  });

  bot.command("pool_deposit", async (ctx) => {
    await handleUserCommand(ctx, "pool_deposit", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const amountWei = parseBnbAmount(requiredPart(parts, 1));
      const transactionHash = parseTransactionHash(requiredPart(parts, 2));
      const wallet = await dependencies.groupWalletService.getWallet(chatId);
      if (wallet === null) {
        throw new UserInputError(
          "This group has no Safe yet, so deposits cannot be credited. An admin should create one with /safe_group <threshold> or link an existing Safe with /wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]."
        );
      }
      await dependencies.depositVerificationService.verifyNativeDeposit({
        transactionHash,
        safeAddress: wallet.safeAddress,
        amountWei,
        allowedSenders: await getAllowedDepositSenders(dependencies, fromId)
      });
      const analytics = await dependencies.poolService.creditDeposit({
        chatId,
        telegramUserId: fromId,
        amountWei,
        transactionHash
      });
      await ctx.reply(formatPoolAnalytics(analytics), {
        reply_markup: poolAppKeyboard(chatId, dependencies.config.publicBaseUrl)
      });
    });
  });

  bot.command("pool_withdraw", async (ctx) => {
    await handleUserCommand(ctx, "pool_withdraw", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const withdrawalBps = parseBasisPoints(requiredPart(parts, 1), 10000);
      const recipientAddress = parseAddress(requiredPart(parts, 2));
      await requireLinkedRecipient(dependencies, fromId, recipientAddress);
      const request = await dependencies.poolService.requestWithdrawal({
        chatId,
        telegramUserId: fromId,
        recipientAddress,
        withdrawalBps
      });
      await ctx.reply(formatWithdrawalRequest(request), { reply_markup: withdrawalKeyboard(request.id) });
    });
  });

  bot.command("pool_cancel", async (ctx) => {
    await handleUserCommand(ctx, "pool_cancel", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 2);
      const request = await dependencies.poolService.cancelWithdrawal(chatId, requiredPart(parts, 1), fromId);
      await ctx.reply(`Withdrawal ${request.id} cancelled. ${request.shares.toString()} shares were restored.`);
    });
  });

  bot.command("portfolio", async (ctx) => {
    await handleUserCommand(ctx, "portfolio", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      await ctx.reply(formatPortfolio(await dependencies.poolService.buildPortfolio(fromId)));
    });
  });

  bot.command("platform", async (ctx) => {
    await handleUserCommand(ctx, "platform", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      if (!dependencies.config.platformAdminIds.includes(fromId)) {
        throw new UserInputError("This command is for platform admins only.");
      }
      await ctx.reply(formatPlatformStats(await dependencies.poolService.buildPlatformStats()));
    });
  });
}

async function getAllowedDepositSenders(dependencies: PoolCommandDependencies, telegramUserId: string): Promise<Address[]> {
  const linkedWallets = await dependencies.walletLinkService.getLinkedWallets(telegramUserId);
  return linkedWallets.map((wallet) => wallet.address);
}

async function requireLinkedRecipient(
  dependencies: PoolCommandDependencies,
  telegramUserId: string,
  recipientAddress: Address
): Promise<void> {
  const allowed = await getAllowedDepositSenders(dependencies, telegramUserId);
  const linked = allowed.some((address) => address.toLowerCase() === recipientAddress.toLowerCase());
  if (!linked) {
    throw new UserInputError("Withdrawal recipient must be a wallet linked to your Telegram account");
  }
}

function parsePoolRole(value: string): PoolRole {
  if (value === "owner" || value === "trader" || value === "member") {
    return value;
  }
  throw new InvalidInputError("Role must be one of owner, trader, or member.", { value });
}

function parsePositiveTelegramUserId(value: string): string {
  parsePositiveInteger(value, "telegramUserId");
  return value;
}

export function formatPoolAnalytics(analytics: PoolAnalytics): string {
  return [
    "Pool analytics",
    analytics.safeAddress === undefined ? "Safe: not set" : `Safe: ${analytics.safeAddress}`,
    `NAV: ${formatBnb(analytics.navWei)}`,
    `Liquid: ${formatBnb(analytics.liquidWei)}`,
    `Open positions: ${formatBnb(analytics.positionsWei)}`,
    `Reserved withdrawals: ${formatBnb(analytics.reservedWithdrawalWei)}`,
    `Your role: ${analytics.member.role}`,
    `Your ownership: ${formatBps(analytics.member.ownershipBps)}`,
    `Your active value: ${formatBnb(analytics.member.activeValueWei)}`,
    `Your queued withdrawals: ${formatBnb(analytics.member.queuedWithdrawalWei)}`,
    `Your PnL after fees: ${formatBnb(analytics.member.unrealizedPnlWei)}`
  ].join("\n");
}

export function formatMyStatus(analytics: PoolAnalytics): string {
  return [
    "Your pool status",
    `Role: ${analytics.member.role}`,
    `Ownership: ${formatBps(analytics.member.ownershipBps)}`,
    `Active value: ${formatBnb(analytics.member.activeValueWei)}`,
    `Queued withdrawals: ${formatBnb(analytics.member.queuedWithdrawalWei)}`,
    `PnL after fees: ${formatBnb(analytics.member.unrealizedPnlWei)}`
  ].join("\n");
}

export function formatPortfolio(portfolio: Portfolio): string {
  if (portfolio.entries.length === 0) {
    return "You're not in any pools yet. Join a group Safe and deposit to start.";
  }
  return [
    "💼 Your portfolio across all groups",
    ...portfolio.entries.map(
      (entry) => `• Group ${entry.chatId} — ${entry.role}: ${formatBnb(entry.activeValueWei)} (PnL ${formatBnb(entry.unrealizedPnlWei)})`
    ),
    "",
    `Total value: ${formatBnb(portfolio.totalActiveValueWei)}`,
    `Total deposited: ${formatBnb(portfolio.totalDepositedWei)}`,
    `Total PnL: ${formatBnb(portfolio.totalPnlWei)}`
  ].join("\n");
}

export function formatPlatformStats(stats: PlatformStats): string {
  return [
    "📊 Platform stats",
    `Groups: ${stats.groups}`,
    `Members: ${stats.totalMembers}`,
    `Total TVL: ${formatBnb(stats.totalTvlWei)}`,
    `24h deposits: ${formatBnb(stats.depositVolume24hWei)}`,
    `24h withdrawals: ${formatBnb(stats.withdrawalVolume24hWei)}`
  ].join("\n");
}

export function formatWithdrawalRequest(request: PoolWithdrawalRequest): string {
  return [
    `Withdrawal request ${request.id}`,
    `Status: ${request.status}`,
    `Recipient: ${request.recipientAddress}`,
    `Gross: ${formatBnb(request.grossAmountWei)}`,
    `Fee: ${formatBnb(request.feeAmountWei)}`,
    `Net: ${formatBnb(request.netAmountWei)}`,
    "Owners prepare it with /safe_prepare withdrawal " + request.id
  ].join("\n");
}

function formatBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}
