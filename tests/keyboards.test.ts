import { describe, expect, it } from "bun:test";
import { poolAppKeyboard, safeGroupKeyboard } from "../src/bot/keyboards.js";

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

describe("poolAppKeyboard", () => {
  it("opens the Telegram mini app analytics route", () => {
    const keyboard = poolAppKeyboard("-100123", "http://localhost:3000");

    expect(JSON.stringify(keyboard.inline_keyboard)).toContain("http://localhost:3000/pool/-100123");
  });
});
