import type { Context } from "grammy";
import { AppError, UserInputError } from "../domain/errors.js";
import type { PendingPrompt } from "../domain/types.js";
import { Logger } from "../logger.js";
import { renderUsage } from "./commandUsage.js";
import { requireChatId, requireGroupAdmin, requireTelegramUserId } from "./commandUtils.js";
import { formatGeneratedWallet, formatWallet } from "./formatters.js";
import { confirmUnlinkKeyboard, connectWalletKeyboard, promptStepKeyboard } from "./keyboards.js";
import { formatMyStatus, formatPoolAnalytics, formatPortfolio } from "./poolCommands.js";
import {
  getFlow,
  isComplete,
  newPrompt,
  nextField,
  withInput,
  withoutLast,
  type PromptContext,
  type PromptFlow
} from "./prompts.js";
import type { BotDependencies } from "./bot.js";

function buildContext(deps: BotDependencies, ctx: Context, chatId: string, telegramUserId: string): PromptContext {
  return {
    deps,
    chatId,
    telegramUserId,
    reply: async (text, keyboard) => {
      await ctx.reply(text, keyboard === undefined ? undefined : { reply_markup: keyboard });
    },
    requireAdmin: () => requireGroupAdmin(ctx, chatId),
    usernameFor: async (userId: string) => {
      try {
        const member = await ctx.api.getChatMember(Number(chatId), Number(userId));
        return member.user.username ?? null;
      } catch {
        return null;
      }
    }
  };
}

async function askField(deps: BotDependencies, ctx: Context, flow: PromptFlow, prompt: PendingPrompt): Promise<void> {
  const field = nextField(flow, prompt);
  if (field === undefined) {
    return;
  }
  const chatId = ctx.chat?.id?.toString() ?? "";
  const telegramUserId = ctx.from?.id?.toString() ?? "";
  const choices =
    field.choices === undefined
      ? []
      : typeof field.choices === "function"
        ? await field.choices(buildContext(deps, ctx, chatId, telegramUserId))
        : field.choices;
  const step = prompt.collected.length + 1;
  const hint = choices.length > 0 ? "Tap an option below, or send the value as a message." : "Send the value as a message.";
  await ctx.reply(
    [`${flow.title} — step ${step} of ${flow.fields.length}`, "", field.label, `Example: ${field.example}`, "", hint].join("\n"),
    { reply_markup: promptStepKeyboard(prompt.collected.length > 0, choices) }
  );
}

export async function startPromptFlow(deps: BotDependencies, ctx: Context, command: string): Promise<void> {
  const flow = getFlow(command);
  if (flow === undefined) {
    return;
  }
  const chatId = requireChatId(ctx.chat?.id);
  const telegramUserId = requireTelegramUserId(ctx.from?.id);
  if (flow.adminOnly) {
    await requireGroupAdmin(ctx, chatId);
  }
  const prompt = newPrompt(chatId, telegramUserId, command);
  await deps.repository.savePendingPrompt(prompt);
  await askField(deps, ctx, flow, prompt);
}

export async function routePromptInput(deps: BotDependencies, ctx: Context): Promise<boolean> {
  const text = ctx.message?.text;
  if (text === undefined || text.startsWith("/")) {
    return false;
  }
  const chatId = ctx.chat?.id?.toString();
  const fromId = ctx.from?.id?.toString();
  if (chatId === undefined || fromId === undefined) {
    return false;
  }
  if ((await deps.repository.getPendingPrompt(chatId, fromId)) === null) {
    return false;
  }
  await applyPromptValue(deps, ctx, chatId, fromId, text.trim());
  return true;
}

// A tapped choice button feeds the same value path as typed input.
export async function handlePromptChoice(deps: BotDependencies, ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id?.toString();
  const fromId = ctx.from?.id?.toString();
  if (chatId === undefined || fromId === undefined) {
    return;
  }
  const data = ctx.callbackQuery?.data ?? "";
  await applyPromptValue(deps, ctx, chatId, fromId, data.slice("choice:".length));
}

async function applyPromptValue(deps: BotDependencies, ctx: Context, chatId: string, fromId: string, value: string): Promise<void> {
  const prompt = await deps.repository.getPendingPrompt(chatId, fromId);
  if (prompt === null) {
    return;
  }
  const flow = getFlow(prompt.command);
  const field = flow === undefined ? undefined : nextField(flow, prompt);
  if (flow === undefined || field === undefined) {
    await deps.repository.deletePendingPrompt(chatId, fromId);
    return;
  }
  try {
    field.validate(value);
  } catch (error) {
    if (error instanceof UserInputError) {
      await ctx.reply(`${error.message}\n\nSend the value again, or tap Cancel.`, {
        reply_markup: promptStepKeyboard(prompt.collected.length > 0)
      });
      return;
    }
    throw error;
  }
  const updated = withInput(prompt, value);
  if (isComplete(flow, updated)) {
    await deps.repository.deletePendingPrompt(chatId, fromId);
    await runExecute(deps, ctx, flow, chatId, fromId, updated.collected);
    return;
  }
  await deps.repository.savePendingPrompt(updated);
  await askField(deps, ctx, flow, updated);
}

async function runExecute(
  deps: BotDependencies,
  ctx: Context,
  flow: PromptFlow,
  chatId: string,
  telegramUserId: string,
  values: string[]
): Promise<void> {
  try {
    await flow.execute(buildContext(deps, ctx, chatId, telegramUserId), values);
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      await ctx.reply(error.message);
      return;
    }
    Logger.error("[Prompts] flow execute failed", { command: flow.command, err: error instanceof Error ? error : undefined });
    await ctx.reply("Something went wrong completing that. Please try again.");
  }
}

export async function handlePromptBack(deps: BotDependencies, ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id?.toString();
  const fromId = ctx.from?.id?.toString();
  if (chatId === undefined || fromId === undefined) {
    return;
  }
  const prompt = await deps.repository.getPendingPrompt(chatId, fromId);
  const flow = prompt === null ? undefined : getFlow(prompt.command);
  if (prompt === null || flow === undefined) {
    return;
  }
  if (prompt.collected.length === 0) {
    await deps.repository.deletePendingPrompt(chatId, fromId);
    await ctx.reply("Cancelled.");
    return;
  }
  const reverted = withoutLast(prompt);
  await deps.repository.savePendingPrompt(reverted);
  await askField(deps, ctx, flow, reverted);
}

export async function handlePromptCancel(deps: BotDependencies, ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat?.id?.toString();
  const fromId = ctx.from?.id?.toString();
  if (chatId !== undefined && fromId !== undefined) {
    await deps.repository.deletePendingPrompt(chatId, fromId);
  }
  await ctx.reply("Cancelled.");
}

export async function beginUnlink(deps: BotDependencies, ctx: Context): Promise<void> {
  const chatId = requireChatId(ctx.chat?.id);
  await requireGroupAdmin(ctx, chatId);
  const wallet = await deps.groupWalletService.getWallet(chatId);
  if (wallet === null) {
    throw new UserInputError("This group has no Safe linked.");
  }
  if (await deps.poolService.hasActiveStakes(chatId)) {
    throw new UserInputError(
      "The pool still has member shares or pending withdrawals. Settle those first, or use /wallet_set to replace the Safe address while keeping the pool."
    );
  }
  await ctx.reply(
    `Unlink the group Safe ${wallet.safeAddress}? The on-chain Safe is NOT deleted — this only removes the link so the group can set a new one.`,
    { reply_markup: confirmUnlinkKeyboard() }
  );
}

// Delivers personal data to the user's DM instead of posting it in the group.
async function sendPrivately(ctx: Context, telegramUserId: string, text: string, label: string): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(telegramUserId), text);
    await ctx.reply(`📩 Sent your ${label} to our DM.`);
  } catch {
    await ctx.reply(`Start a DM with me first (open a chat with me and tap Start), then try ${label} again.`);
  }
}

async function beginLinkWallet(deps: BotDependencies, ctx: Context): Promise<void> {
  // In a DM we can identify the user from initData, so offer the zero-typing
  // connect-first flow. In a group there is no initData, so fall back to the
  // type-the-address prompt.
  if (ctx.chat?.type === "private") {
    await ctx.reply("Tap to connect your wallet — no address to type.", {
      reply_markup: connectWalletKeyboard(deps.config.publicBaseUrl)
    });
    return;
  }
  await startPromptFlow(deps, ctx, "link_start");
}

export async function handleMenuSelection(deps: BotDependencies, ctx: Context, command: string): Promise<void> {
  if (command === "link_start") {
    await beginLinkWallet(deps, ctx);
    return;
  }
  if (getFlow(command) !== undefined) {
    await startPromptFlow(deps, ctx, command);
    return;
  }
  switch (command) {
    case "wallet_generate": {
      const fromId = requireTelegramUserId(ctx.from?.id);
      if (ctx.chat?.type !== "private") {
        await ctx.reply("DM me to generate a wallet so your private key stays private. Open a private chat with me and tap Generate wallet there.");
        return;
      }
      await ctx.reply(formatGeneratedWallet(await deps.walletLinkService.generateLinkedWallet(fromId)));
      return;
    }
    case "wallet": {
      const wallet = await deps.groupWalletService.getWallet(requireChatId(ctx.chat?.id));
      if (wallet === null) {
        throw new UserInputError("No group wallet set. Create one with the Create group Safe button.");
      }
      await ctx.reply(formatWallet(wallet));
      return;
    }
    case "pool_init": {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      await ctx.reply(formatPoolAnalytics(await deps.poolService.initializePool(chatId, requireTelegramUserId(ctx.from?.id))));
      return;
    }
    case "pool": {
      const chatId = requireChatId(ctx.chat?.id);
      await ctx.reply(formatPoolAnalytics(await deps.poolService.getAnalytics(chatId, requireTelegramUserId(ctx.from?.id))));
      return;
    }
    case "my_status": {
      const fromId = requireTelegramUserId(ctx.from?.id);
      if (ctx.chat?.type === "private") {
        await ctx.reply("My status is per-group — tap it inside a group, or use My portfolio for your overall position.");
        return;
      }
      const chatId = requireChatId(ctx.chat?.id);
      const text = formatMyStatus(await deps.poolService.getAnalytics(chatId, fromId));
      await sendPrivately(ctx, fromId, text, "status");
      return;
    }
    case "portfolio": {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const text = formatPortfolio(await deps.poolService.buildPortfolio(fromId));
      if (ctx.chat?.type === "private") {
        await ctx.reply(text);
        return;
      }
      await sendPrivately(ctx, fromId, text, "portfolio");
      return;
    }
    case "safe_unlink": {
      await beginUnlink(deps, ctx);
      return;
    }
    default:
      await ctx.reply(renderUsage(command));
  }
}
