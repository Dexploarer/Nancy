import { describe, expect, it } from "bun:test";
import { recoverMessageAddress } from "viem";
import { ManagedWalletService } from "../src/services/managedWalletService.js";
import { WalletEncryptionService } from "../src/services/walletEncryptionService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";

const ENCRYPTION_KEY = "0x1111111111111111111111111111111111111111111111111111111111111111";
const SAFE_HASH = "0x2222222222222222222222222222222222222222222222222222222222222222";

describe("ManagedWalletService", () => {
  it("generates an encrypted wallet, links it, and signs Safe hashes", async () => {
    const repository = new MemoryRepository();
    const service = new ManagedWalletService(repository, new WalletEncryptionService(ENCRYPTION_KEY));

    const generated = await service.generate("123");
    const link = await repository.getWalletLink("123", generated.wallet.address);
    const signed = await service.signSafeHash("123", SAFE_HASH);
    const recovered = await recoverMessageAddress({
      message: { raw: SAFE_HASH },
      signature: signed.signature
    });

    expect(generated.privateKey).toStartWith("0x");
    expect(generated.wallet.encryptedPrivateKey.ciphertext).not.toBe(generated.privateKey);
    expect(link?.status).toBe("linked");
    expect(recovered.toLowerCase()).toBe(generated.wallet.address.toLowerCase());
  });
});
