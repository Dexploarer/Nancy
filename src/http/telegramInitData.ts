import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { UserInputError } from "../domain/errors.js";

const TelegramUserSchema = z.object({
  id: z.number().int().positive()
});

export function verifyTelegramInitData(initData: string, botToken: string): string {
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
