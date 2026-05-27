import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { verifyTelegramInitData } from "../src/http/telegramInitData.js";

describe("verifyTelegramInitData", () => {
  it("returns the Telegram user ID when the init data hash is valid", () => {
    const initData = buildInitData("bot-token", {
      auth_date: "1779900000",
      user: JSON.stringify({ id: 123456789 })
    });

    expect(verifyTelegramInitData(initData, "bot-token")).toBe("123456789");
  });

  it("rejects tampered Telegram init data", () => {
    const initData = buildInitData("bot-token", {
      auth_date: "1779900000",
      user: JSON.stringify({ id: 123456789 })
    }).replace("123456789", "987654321");

    expect(() => verifyTelegramInitData(initData, "bot-token")).toThrow("signature is invalid");
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
