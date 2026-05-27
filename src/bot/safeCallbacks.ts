import type { Bot, Context } from "grammy";
import { AppError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { formatGeneratedManagedWallet, formatSafeCreationSession, formatSafeDeployment, formatSafeSubmission, formatWallet } from "./formatters.js";
import { safeGroupKeyboard, safeSubmissionKeyboard } from "./keyboards.js";
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

  bot.callbackQuery(/^managed_join:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const sessionId = ctx.callbackQuery.data.slice("managed_join:".length);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const existing = await dependencies.managedWalletService.get(fromId);
      const session =
        existing === null
          ? await generateManagedWalletForGroupJoin(ctx, dependencies, sessionId, fromId)
          : await dependencies.safeGroupSetupService.joinWithWallet(sessionId, fromId, existing.address);
      await ctx.answerCallbackQuery({ text: "Managed owner wallet joined" });
      await ctx.editMessageText(formatSafeCreationSession(session), {
        reply_markup: safeGroupKeyboard(session)
      });
    });
  });

  bot.callbackQuery(/^safe_approve:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const submissionId = ctx.callbackQuery.data.slice("safe_approve:".length);
      const submission = await dependencies.safeSubmissionService.getSubmission(submissionId);
      if (submission === null) {
        throw new UserInputError("Safe submission not found");
      }
      const signed = await dependencies.managedWalletService.signSafeHash(fromId, submission.safeTxHash);
      const updated = await dependencies.safeSubmissionService.submitOwnerSignature(
        submissionId,
        signed.wallet.address,
        signed.signature,
        fromId
      );
      await ctx.answerCallbackQuery({ text: "Safe approval submitted" });
      await ctx.reply(formatSafeSubmission(updated, dependencies.config.publicBaseUrl), {
        reply_markup: safeSubmissionKeyboard(updated.id)
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

async function generateManagedWalletForGroupJoin(
  ctx: Context,
  dependencies: BotDependencies,
  sessionId: string,
  telegramUserId: string
) {
  const result = await dependencies.safeGroupSetupService.generateManagedWalletAndJoin(sessionId, telegramUserId);
  await sendPrivateMessage(ctx, formatGeneratedManagedWallet(result.generated));
  return result.session;
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
