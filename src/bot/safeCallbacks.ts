import type { Bot, Context } from "grammy";
import { AppError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { formatGeneratedWallet, formatSafeCreationSession, formatSafeDeployment, formatWallet } from "./formatters.js";
import { safeGroupKeyboard } from "./keyboards.js";
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
      const result = await dependencies.safeGroupSetupService.deploy(ctx.callbackQuery.data.slice("safe_deploy:".length));
      await ctx.answerCallbackQuery({ text: "Safe deployed" });
      await ctx.editMessageText(
        [formatSafeCreationSession(result.session), "", formatSafeDeployment(result.deployment), "", formatWallet(result.wallet)].join("\n")
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
