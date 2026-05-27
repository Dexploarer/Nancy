import { describe, expect, it } from "bun:test";
import { safeGroupKeyboard } from "../src/bot/keyboards.js";

describe("safeGroupKeyboard", () => {
  it("shows deploy only when enough owners joined", () => {
    const keyboard = safeGroupKeyboard({
      id: "setup_123",
      chatId: "chat",
      creatorTelegramId: "admin",
      threshold: 1,
      owners: [
        {
          telegramUserId: "111",
          address: "0x1111111111111111111111111111111111111111",
          joinedAt: new Date("2026-05-27T00:00:00.000Z")
        }
      ],
      status: "collecting",
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });

    expect(JSON.stringify(keyboard.inline_keyboard)).toContain("safe_deploy:setup_123");
  });
});
