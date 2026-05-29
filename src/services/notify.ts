import type { Bot } from "grammy";
import { Logger } from "../logger.js";

// Best-effort group ping for events that happen off-chat (web signing, deploy
// completing, auto-detected deposits). Never throws — a notification failure must
// not break the action that triggered it.
export async function notifyGroup(bot: Pick<Bot, "api"> | undefined, chatId: string, text: string): Promise<void> {
  if (bot?.api === undefined) {
    return;
  }
  try {
    await bot.api.sendMessage(chatId, text);
  } catch (error) {
    Logger.warn("[Notify] group message failed", { chatId, err: error instanceof Error ? error : undefined });
  }
}
