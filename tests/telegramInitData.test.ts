import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { verifyTelegramInitData } from "../src/http/telegramInitData.js";

const AUTH_DATE = 1779900000;
const FRESH = { nowSeconds: AUTH_DATE + 100 };

describe("verifyTelegramInitData", () => {
  it("returns the Telegram user ID when the init data hash is valid and fresh", () => {
    const initData = buildInitData("bot-token", {
      auth_date: String(AUTH_DATE),
      user: JSON.stringify({ id: 123456789 })
    });

    expect(verifyTelegramInitData(initData, "bot-token", FRESH)).toBe("123456789");
  });

  it("rejects tampered Telegram init data", () => {
    const initData = buildInitData("bot-token", {
      auth_date: String(AUTH_DATE),
      user: JSON.stringify({ id: 123456789 })
    }).replace("123456789", "987654321");

    expect(() => verifyTelegramInitData(initData, "bot-token", FRESH)).toThrow("signature is invalid");
  });

  it("rejects init data older than the freshness window (replay protection)", () => {
    const initData = buildInitData("bot-token", {
      auth_date: String(AUTH_DATE),
      user: JSON.stringify({ id: 123456789 })
    });

    expect(() => verifyTelegramInitData(initData, "bot-token", { nowSeconds: AUTH_DATE + 86_400 + 1 })).toThrow(
      "expired"
    );
  });

  it("rejects init data with no auth_date", () => {
    const initData = buildInitData("bot-token", {
      user: JSON.stringify({ id: 123456789 })
    });

    expect(() => verifyTelegramInitData(initData, "bot-token", FRESH)).toThrow("auth_date");
  });
});

function buildInitData(botToken: string, values: Record<string, string>): string {
  const params = new URLSearchParams(values);
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
