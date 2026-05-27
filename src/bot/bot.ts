import { Bot, type Context } from "grammy";
import type { AppConfig } from "../config.js";
import { AppError, UserInputError } from "../domain/errors.js";
import type { Repository } from "../storage/repository.js";
import { parseAddress, parseBasisPoints, parseBnbAmount } from "../utils/evm.js";
import { Logger } from "../logger.js";
import { createFlapSalt, parseVaultRecipients } from "../chain/flapService.js";
import { formatFlapLaunch, formatSafeStatus, formatSafeSubmission, formatTradeProposal, formatWallet } from "./formatters.js";
import { GroupWalletService } from "../services/groupWalletService.js";
import { TradeService } from "../services/tradeService.js";
import { FlapLaunchService } from "../services/flapLaunchService.js";
import { SafeSubmissionService } from "../services/safeSubmissionService.js";
import type { Hex } from "viem";

type BotDependencies = {
  repository: Repository;
  groupWalletService: GroupWalletService;
  tradeService: TradeService;
  flapLaunchService: FlapLaunchService;
  safeSubmissionService: SafeSubmissionService;
  config: AppConfig;
};

export function createBot(dependencies: BotDependencies): Bot {
  const bot = new Bot(dependencies.config.telegramBotToken);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "The Family trading bot MVP",
        "/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]",
        "/buy <tokenAddress> <bnbAmount> [slippageBps]",
        "/flap_launch <name>|<symbol>|<metadataCid>|<buyTaxBps>|<sellTaxBps>|<taxDays>|<recipient:bps,...>|<initialBuyBnb>",
        "/safe_prepare trade <proposalId>",
        "/safe_prepare flap <launchId>",
        "/safe_submit <safeSubmissionId> <ownerAddress> <signature>",
        "/safe_status <safeSubmissionId>",
        "/safe_execute <safeSubmissionId>"
      ].join("\n")
    );
  });

  bot.command("wallet_set", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const parts = splitCommand(ctx.message?.text, 4);
      const safeAddress = parseAddress(requiredPart(parts, 1));
      const threshold = parsePositiveInteger(requiredPart(parts, 2), "threshold");
      const owners = parts.slice(3).map(parseAddress);
      if (threshold > owners.length) {
        throw new UserInputError("Threshold cannot exceed owner count", { threshold, owners: owners.length });
      }
      const wallet = await dependencies.groupWalletService.setWallet(chatId, safeAddress, threshold, owners);
      await ctx.reply(formatWallet(wallet));
    });
  });

  bot.command("wallet", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const wallet = await dependencies.groupWalletService.getWallet(chatId);
      if (wallet === null) {
        throw new UserInputError("No group wallet set");
      }
      await ctx.reply(formatWallet(wallet));
    });
  });

  bot.command("buy", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const tokenAddress = parseAddress(requiredPart(parts, 1));
      const amountWei = parseBnbAmount(requiredPart(parts, 2));
      const slippageBps = parts[3] === undefined ? 150 : parseBasisPoints(parts[3], 5000);
      const proposal = await dependencies.tradeService.createNativeBuyProposal({
        chatId,
        proposerTelegramId: fromId,
        tokenAddress,
        inputAmountWei: amountWei,
        slippageBps,
        tradeFeeBps: dependencies.config.tradeFeeBps,
        feeRecipient: dependencies.config.platformFeeRecipient,
        dexDeadlineSeconds: dependencies.config.dexDeadlineSeconds
      });
      await ctx.reply(formatTradeProposal(proposal));
    });
  });

  bot.command("proposal", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const proposalId = requiredPart(parts, 1);
      const proposal = await dependencies.tradeService.getProposal(proposalId);
      if (proposal === null) {
        throw new UserInputError("Proposal not found", { id: proposalId });
      }
      await ctx.reply(formatTradeProposal(proposal));
    });
  });

  bot.command("flap_launch", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const commandText = ctx.message?.text;
      if (commandText === undefined) {
        throw new UserInputError("Missing command text");
      }
      const payload = commandText.replace(/^\/flap_launch(@\w+)?\s*/, "");
      const parts = payload.split("|");
      if (parts.length !== 8) {
        throw new UserInputError("Invalid flap_launch format");
      }
      const buyTaxBps = parseBasisPoints(requiredPart(parts, 3), 5000);
      const sellTaxBps = parseBasisPoints(requiredPart(parts, 4), 5000);
      const taxDays = parsePositiveInteger(requiredPart(parts, 5), "taxDays");
      const proposal = await dependencies.flapLaunchService.createLaunchProposal({
        chatId,
        proposerTelegramId: fromId,
        name: requiredPart(parts, 0),
        symbol: requiredPart(parts, 1),
        metadataUri: requiredPart(parts, 2),
        buyTaxBps,
        sellTaxBps,
        taxDurationSeconds: taxDays * 24 * 60 * 60,
        recipients: parseVaultRecipients(requiredPart(parts, 6)),
        initialBuyWei: parseBnbAmount(requiredPart(parts, 7)),
        salt: createFlapSalt(),
        commissionReceiver: dependencies.config.platformCommissionReceiver
      });
      await ctx.reply(formatFlapLaunch(proposal));
    });
  });

  bot.command("safe_prepare", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const sourceType = requiredPart(parts, 1);
      const sourceId = requiredPart(parts, 2);
      const submission =
        sourceType === "trade"
          ? await dependencies.safeSubmissionService.prepareTradeSubmission(chatId, sourceId)
          : sourceType === "flap"
            ? await dependencies.safeSubmissionService.prepareFlapLaunchSubmission(chatId, sourceId)
            : null;
      if (submission === null) {
        throw new UserInputError("safe_prepare source must be trade or flap");
      }
      await ctx.reply(formatSafeSubmission(submission));
    });
  });

  bot.command("safe_submit", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const parts = splitCommand(ctx.message?.text, 4);
      const submissionId = requiredPart(parts, 1);
      const ownerAddress = parseAddress(requiredPart(parts, 2));
      const signature = parseHex(requiredPart(parts, 3), "signature");
      const submission = await dependencies.safeSubmissionService.submitOwnerSignature(submissionId, ownerAddress, signature);
      await ctx.reply(formatSafeSubmission(submission));
    });
  });

  bot.command("safe_status", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const status = await dependencies.safeSubmissionService.getStatus(requiredPart(parts, 1));
      await ctx.reply(formatSafeStatus(status));
    });
  });

  bot.command("safe_execute", async (ctx) => {
    await handleUserCommand(ctx, async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const txHash = await dependencies.safeSubmissionService.execute(requiredPart(parts, 1));
      await ctx.reply(`Safe execution submitted: ${txHash}`);
    });
  });

  bot.catch((error) => {
    Logger.error("[TelegramBot] Unhandled bot error", { err: error.error instanceof Error ? error.error : undefined });
  });

  return bot;
}

async function handleUserCommand(ctx: Context, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      await ctx.reply(error.message);
      return;
    }
    Logger.error("[TelegramBot] Command failed", { err: error instanceof Error ? error : undefined });
    await ctx.reply("Command failed");
  }
}

function splitCommand(text: string | undefined, minParts: number): string[] {
  if (text === undefined) {
    throw new UserInputError("Missing command text");
  }
  const parts = text.trim().split(/\s+/);
  if (parts.length < minParts) {
    throw new UserInputError("Missing command arguments");
  }
  return parts;
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new UserInputError(`${label} must be a positive integer`, { value });
  }
  const parsed = Number(value);
  if (parsed <= 0) {
    throw new UserInputError(`${label} must be positive`, { value });
  }
  return parsed;
}

function requireChatId(chatId: number | undefined): string {
  if (chatId === undefined) {
    throw new UserInputError("Command must be used in a chat");
  }
  return chatId.toString();
}

function requireTelegramUserId(userId: number | undefined): string {
  if (userId === undefined) {
    throw new UserInputError("Command must be sent by a Telegram user");
  }
  return userId.toString();
}

function requiredPart(parts: string[], index: number): string {
  const part = parts[index];
  if (part === undefined || part.length === 0) {
    throw new UserInputError("Missing required field", { index });
  }
  return part;
}

function parseHex(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new UserInputError(`${label} must be a hex string`);
  }
  return value as Hex;
}
