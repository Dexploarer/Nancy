import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { AppError, UserInputError } from "../domain/errors.js";
import type { EncryptedPrivateKey } from "../domain/types.js";

export class WalletEncryptionService {
  constructor(private readonly key?: Hex) {}

  encrypt(privateKey: Hex): EncryptedPrivateKey {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(privateKey.slice(2), "hex")), cipher.final()]);
    return {
      ciphertext: toHex(ciphertext),
      iv: toHex(iv),
      authTag: toHex(cipher.getAuthTag())
    };
  }

  decrypt(encrypted: EncryptedPrivateKey): Hex {
    const key = this.requireKey();
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, fromHex(encrypted.iv));
      decipher.setAuthTag(fromHex(encrypted.authTag));
      const plaintext = Buffer.concat([decipher.update(fromHex(encrypted.ciphertext)), decipher.final()]);
      return toHex(plaintext);
    } catch (error) {
      throw new AppError("Managed wallet decryption failed", { message: error instanceof Error ? error.message : "decrypt failed" });
    }
  }

  private requireKey(): Buffer {
    if (this.key === undefined) {
      throw new UserInputError("WALLET_ENCRYPTION_KEY is required for bot-managed wallets");
    }
    return fromHex(this.key);
  }
}

function fromHex(value: Hex): Buffer {
  return Buffer.from(value.slice(2), "hex");
}

function toHex(value: Buffer): Hex {
  return `0x${value.toString("hex")}`;
}
