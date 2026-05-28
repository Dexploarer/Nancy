import type { Context } from "grammy";
import { AppError, InvalidInputError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { renderUsage } from "./commandUsage.js";

export function splitCommand(text: string | undefined, minParts: number): string[] {
  if (text === undefined) {
    throw new InvalidInputError();
  }
  const parts = text.trim().split(/\s+/);
  if (parts.length < minParts) {
    throw new InvalidInputError();
  }
  return parts;
}

export function parsePositiveInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidInputError(`${label} must be a whole number greater than zero.`, { value });
  }
  const parsed = Number(value);
  if (parsed <= 0) {
    throw new InvalidInputError(`${label} must be greater than zero.`, { value });
  }
  return parsed;
}

export function requireChatId(chatId: number | undefined): string {
  if (chatId === undefined) {
    throw new UserInputError("Command must be used in a chat");
  }
  return chatId.toString();
}

export function requireTelegramUserId(userId: number | undefined): string {
  if (userId === undefined) {
    throw new UserInputError("Command must be sent by a Telegram user");
  }
  return userId.toString();
}

export async function requireGroupAdmin(ctx: Context, chatId: string): Promise<void> {
  if (ctx.from === undefined) {
    throw new UserInputError("Command must be sent by a Telegram user");
  }
  const member = await ctx.api.getChatMember(chatId, ctx.from.id);
  if (member.status !== "creator" && member.status !== "administrator") {
    throw new UserInputError("Only Telegram group admins can run this command");
  }
}

export function requiredPart(parts: string[], index: number): string {
  const part = parts[index];
  if (part === undefined || part.length === 0) {
    throw new InvalidInputError("", { index });
  }
  return part;
}

export function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

/**
 * Runs a command handler and turns thrown errors into friendly replies:
 * an InvalidInputError shows the command's usage (with the specific reason
 * when present), other domain errors show their own message, and anything
 * unexpected is logged and replaced with the command's usage as a fallback.
 */
export async function handleUserCommand(ctx: Context, command: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof InvalidInputError) {
      await ctx.reply(renderUsage(command, error.message));
      return;
    }
    if (error instanceof UserInputError || error instanceof AppError) {
      await ctx.reply(error.message);
      return;
    }
    Logger.error("[TelegramBot] Command failed", { command, err: error instanceof Error ? error : undefined });
    await ctx.reply("Something went wrong running that command. Please try again in a moment.");
  }
}
