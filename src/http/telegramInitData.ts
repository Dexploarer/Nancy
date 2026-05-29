import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { UserInputError } from "../domain/errors.js";

const TelegramUserSchema = z.object({
  id: z.number().int().positive()
});

// Telegram init data stays valid forever unless the server enforces freshness via
// auth_date, which would let a captured initData string be replayed indefinitely to
// impersonate a user. Default to a 24h window; callers may tighten it.
const DEFAULT_MAX_AGE_SECONDS = 86_400;

export type VerifyInitDataOptions = {
  maxAgeSeconds?: number;
  // Injectable clock (seconds since epoch) for deterministic tests.
  nowSeconds?: number;
};

export function verifyTelegramInitData(initData: string, botToken: string, options: VerifyInitDataOptions = {}): string {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (hash === null || !/^[0-9a-f]{64}$/i.test(hash)) {
    throw new UserInputError("Invalid Telegram Web App data");
  }
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"))) {
    throw new UserInputError("Telegram Web App data signature is invalid");
  }
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new UserInputError("Telegram Web App data is missing a valid auth_date");
  }
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new UserInputError("Telegram Web App data has expired — reopen the app");
  }
  const userValue = params.get("user");
  if (userValue === null) {
    throw new UserInputError("Telegram Web App user is missing");
  }
  try {
    const parsed = TelegramUserSchema.parse(JSON.parse(userValue));
    return parsed.id.toString();
  } catch {
    throw new UserInputError("Telegram Web App user is invalid");
  }
}
