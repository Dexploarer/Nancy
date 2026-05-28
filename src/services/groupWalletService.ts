import type { Address } from "viem";
import { UserInputError } from "../domain/errors.js";
import type { ChatId, GroupWallet } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";

export class GroupWalletService {
  constructor(private readonly repository: Repository) {}

  async unlinkWallet(chatId: ChatId): Promise<GroupWallet> {
    const wallet = await this.repository.getGroupWallet(chatId);
    if (wallet === null) {
      throw new UserInputError("This group has no Safe linked.");
    }
    await this.repository.deleteGroupWallet(chatId);
    return wallet;
  }

  async setWallet(chatId: ChatId, safeAddress: Address, threshold: number, owners: Address[]): Promise<GroupWallet> {
    const wallet: GroupWallet = {
      chatId,
      safeAddress,
      threshold,
      owners,
      createdAt: new Date()
    };
    await this.repository.saveGroupWallet(wallet);
    return wallet;
  }

  async getWallet(chatId: ChatId): Promise<GroupWallet | null> {
    return this.repository.getGroupWallet(chatId);
  }
}
