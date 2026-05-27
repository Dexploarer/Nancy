import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { UserInputError } from "../domain/errors.js";
import type { ManagedWallet, WalletLink } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import { WalletEncryptionService } from "./walletEncryptionService.js";

export type GeneratedManagedWallet = {
  wallet: ManagedWallet;
  privateKey: Hex;
};

export class ManagedWalletService {
  constructor(
    private readonly repository: Repository,
    private readonly walletEncryptionService: WalletEncryptionService
  ) {}

  async generate(telegramUserId: string): Promise<GeneratedManagedWallet> {
    const existing = await this.repository.getManagedWallet(telegramUserId);
    if (existing !== null) {
      throw new UserInputError("Managed wallet already exists for this Telegram user", { address: existing.address });
    }
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const now = new Date();
    const wallet: ManagedWallet = {
      telegramUserId,
      address: account.address,
      encryptedPrivateKey: this.walletEncryptionService.encrypt(privateKey),
      createdAt: now
    };
    await this.repository.saveManagedWallet(wallet);
    await this.repository.saveWalletLink(managedWalletLink(wallet, now));
    return { wallet, privateKey };
  }

  async get(telegramUserId: string): Promise<ManagedWallet | null> {
    return this.repository.getManagedWallet(telegramUserId);
  }

  async requireWallet(telegramUserId: string): Promise<ManagedWallet> {
    const wallet = await this.repository.getManagedWallet(telegramUserId);
    if (wallet === null) {
      throw new UserInputError("Generate a bot-managed wallet first with /wallet_generate");
    }
    return wallet;
  }

  async signSafeHash(telegramUserId: string, safeTxHash: Hex): Promise<{ wallet: ManagedWallet; signature: Hex }> {
    const wallet = await this.requireWallet(telegramUserId);
    const account = privateKeyToAccount(this.walletEncryptionService.decrypt(wallet.encryptedPrivateKey));
    const signature = await account.signMessage({
      message: { raw: safeTxHash }
    });
    const updated: ManagedWallet = {
      ...wallet,
      lastUsedAt: new Date()
    };
    await this.repository.saveManagedWallet(updated);
    return { wallet: updated, signature };
  }
}

function managedWalletLink(wallet: ManagedWallet, linkedAt: Date): WalletLink {
  return {
    telegramUserId: wallet.telegramUserId,
    address: wallet.address,
    nonce: `managed:${wallet.telegramUserId}`,
    status: "linked",
    createdAt: wallet.createdAt,
    linkedAt
  };
}
