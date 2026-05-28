import type { Bot, Context } from "grammy";
import { AppError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { formatGeneratedWallet, formatSafeCreationSession, formatSafeStatus, formatSafeSubmission } from "./formatters.js";
import { deployPageKeyboard, safeGroupKeyboard, safeSubmissionKeyboard } from "./keyboards.js";
import { requireChatId, requireGroupAdmin, requireTelegramUserId } from "./commandUtils.js";
import type { BotDependencies } from "./bot.js";

export function registerSafeCallbacks(bot: Bot, dependencies: BotDependencies): void {
  bot.callbackQuery(/^safe_join:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const sessionId = ctx.callbackQuery.data.slice("safe_join:".length);
      const session = await dependencies.safeGroupSetupService.joinWithDefaultWallet(sessionId, requireTelegramUserId(ctx.from?.id));
      await ctx.answerCallbackQuery({ text: "Owner wallet joined" });
      await ctx.editMessageText(formatSafeCreationSession(session), {
        reply_markup: safeGroupKeyboard(session)
      });
    });
  });

  bot.callbackQuery(/^generate_join:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const sessionId = ctx.callbackQuery.data.slice("generate_join:".length);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const result = await dependencies.safeGroupSetupService.generateWalletAndJoin(sessionId, fromId);
      await sendPrivateMessage(ctx, formatGeneratedWallet(result.generated));
      await ctx.answerCallbackQuery({ text: "Wallet generated (key sent by DM) and joined" });
      await ctx.editMessageText(formatSafeCreationSession(result.session), {
        reply_markup: safeGroupKeyboard(result.session)
      });
    });
  });

  bot.callbackQuery(/^safe_refresh:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const session = await dependencies.safeGroupSetupService.getSession(ctx.callbackQuery.data.slice("safe_refresh:".length));
      await ctx.answerCallbackQuery({ text: "Refreshed" });
      await ctx.editMessageText(formatSafeCreationSession(session), {
        reply_markup: safeGroupKeyboard(session)
      });
    });
  });

  bot.callbackQuery(/^safe_deploy:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const sessionId = ctx.callbackQuery.data.slice("safe_deploy:".length);
      await ctx.answerCallbackQuery();
      await ctx.reply(
        "Deploy the Safe from your own wallet — you pay the gas, the bot holds no key. Tap below.",
        { reply_markup: deployPageKeyboard(sessionId, dependencies.config.publicBaseUrl, ctx.chat?.type === "private") }
      );
    });
  });

  bot.callbackQuery(/^safe_cancel:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const session = await dependencies.safeGroupSetupService.cancelSession(ctx.callbackQuery.data.slice("safe_cancel:".length));
      await ctx.answerCallbackQuery({ text: "Safe setup cancelled" });
      await ctx.editMessageText(formatSafeCreationSession(session));
    });
  });

  bot.callbackQuery("safe_unlink_confirm", async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      if (await dependencies.poolService.hasActiveStakes(chatId)) {
        throw new UserInputError("The pool now has active shares or pending withdrawals. Settle those before unlinking.");
      }
      const wallet = await dependencies.groupWalletService.unlinkWallet(chatId);
      await ctx.answerCallbackQuery({ text: "Group Safe unlinked" });
      await ctx.editMessageText(
        `Group Safe ${wallet.safeAddress} unlinked. Set a new one with /safe_group <threshold> or /wallet_set.`
      );
    });
  });

  // P2: act on a proposal / withdrawal / submission straight from its message — no IDs to copy.
  bot.callbackQuery(/^prepare:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const rest = ctx.callbackQuery.data.slice("prepare:".length);
      const separator = rest.indexOf(":");
      const source = rest.slice(0, separator);
      const sourceId = rest.slice(separator + 1);
      const submission =
        source === "trade"
          ? await dependencies.safeSubmissionService.prepareTradeSubmission(chatId, sourceId)
          : source === "flap"
            ? await dependencies.safeSubmissionService.prepareFlapLaunchSubmission(chatId, sourceId)
            : await dependencies.safeSubmissionService.prepareWithdrawalSubmission(chatId, sourceId);
      await ctx.answerCallbackQuery();
      await ctx.reply(formatSafeSubmission(submission), {
        reply_markup: safeSubmissionKeyboard(submission.id, dependencies.config.publicBaseUrl, ctx.chat?.type === "private")
      });
    });
  });

  bot.callbackQuery(/^safe_status:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const status = await dependencies.safeSubmissionService.getStatus(ctx.callbackQuery.data.slice("safe_status:".length));
      await ctx.answerCallbackQuery();
      await ctx.reply(formatSafeStatus(status));
    });
  });

  bot.callbackQuery(/^safe_execute:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const txHash = await dependencies.safeSubmissionService.execute(ctx.callbackQuery.data.slice("safe_execute:".length));
      await ctx.answerCallbackQuery({ text: "Execution submitted" });
      await ctx.reply(`Safe execution submitted: ${txHash}`);
    });
  });

  bot.callbackQuery(/^wd_cancel:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const request = await dependencies.poolService.cancelWithdrawal(chatId, ctx.callbackQuery.data.slice("wd_cancel:".length), fromId);
      await ctx.answerCallbackQuery({ text: "Withdrawal cancelled" });
      await ctx.reply(`Withdrawal ${request.id} cancelled. Your ${request.shares.toString()} shares were restored.`);
    });
  });
}

async function handleCallback(ctx: Context, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
      return;
    }
    Logger.error("[TelegramBot] Callback failed", { err: error instanceof Error ? error : undefined });
    await ctx.answerCallbackQuery({ text: "Action failed", show_alert: true });
  }
}

async function sendPrivateMessage(ctx: Context, message: string): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined) {
    throw new UserInputError("Command must be sent by a Telegram user");
  }
  try {
    await ctx.api.sendMessage(userId, message);
  } catch {
    throw new UserInputError("Open a private chat with this bot first so it can send your wallet key");
  }
}
