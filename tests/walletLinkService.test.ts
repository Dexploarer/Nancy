import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "bun:test";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { buildWalletLinkMessage, WalletLinkService } from "../src/services/walletLinkService.js";

describe("WalletLinkService", () => {
  it("links a Telegram user to a wallet with a signed nonce", async () => {
    const repository = new MemoryRepository();
    const service = new WalletLinkService(repository);
    const account = privateKeyToAccount("0x59c6995e998f97a5a004497e5da5cf9e7ae6b36f10a0edbb1d5828dce3f2b0b5");
    const { link } = await service.beginLink("123", account.address);
    const signature = await account.signMessage({ message: buildWalletLinkMessage(link) });

    const completed = await service.completeLink("123", account.address, signature);

    expect(completed.status).toBe("linked");
    await expect(service.requireLinkedOwner("123", account.address)).resolves.toBeUndefined();
  });
});
