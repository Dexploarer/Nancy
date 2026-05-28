import { describe, expect, it } from "bun:test";
import { linkPageKeyboard, poolAppKeyboard, safeGroupKeyboard, safeSubmissionKeyboard } from "../src/bot/keyboards.js";

type Btn = { text: string; url?: string; web_app?: { url: string } };
function buttons(kb: { inline_keyboard: Btn[][] }): Btn[] {
  return kb.inline_keyboard.flat();
}

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

describe("page-open keyboards", () => {
  it("uses a WebApp button in private chats", () => {
    const b = buttons(linkPageKeyboard("abc", "https://x.test", true))[0]!;
    expect(b.web_app?.url).toBe("https://x.test/link/abc");
    expect(b.url).toBeUndefined();
  });

  it("uses a URL button in group chats", () => {
    const b = buttons(linkPageKeyboard("abc", "https://x.test", false))[0]!;
    expect(b.url).toBe("https://x.test/link/abc");
    expect(b.web_app).toBeUndefined();
  });

  it("builds a signing button from the submission id", () => {
    const b = buttons(safeSubmissionKeyboard("safe_1", "https://x.test", true))[0]!;
    expect(b.web_app?.url).toBe("https://x.test/sign/safe_1");
  });
});
