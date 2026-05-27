import type { Context } from "grammy";
import { UserInputError } from "../domain/errors.js";

export function splitCommand(text: string | undefined, minParts: number): string[] {
  if (text === undefined) {
    throw new UserInputError("Missing command text");
  }
  const parts = text.trim().split(/\s+/);
  if (parts.length < minParts) {
    throw new UserInputError("Missing command arguments");
  }
  return parts;
}

export function parsePositiveInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new UserInputError(`${label} must be a positive integer`, { value });
  }
  const parsed = Number(value);
  if (parsed <= 0) {
    throw new UserInputError(`${label} must be positive`, { value });
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
    throw new UserInputError("Missing required field", { index });
  }
  return part;
}

export function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}
