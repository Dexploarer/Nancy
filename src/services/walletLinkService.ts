import { randomBytes } from "node:crypto";
import { verifyMessage, type Address, type Hex } from "viem";
import { UserInputError } from "../domain/errors.js";
import type { WalletLink } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";

export class WalletLinkService {
  constructor(private readonly repository: Repository) {}

  async beginLink(telegramUserId: string, address: Address): Promise<{ link: WalletLink; message: string }> {
    const link: WalletLink = {
      telegramUserId,
      address,
      nonce: randomBytes(16).toString("hex"),
      status: "pending",
      createdAt: new Date()
    };
    await this.repository.saveWalletLink(link);
    return {
      link,
      message: buildWalletLinkMessage(link)
    };
  }

  async completeLink(telegramUserId: string, address: Address, signature: Hex): Promise<WalletLink> {
    const link = await this.repository.getWalletLink(telegramUserId, address);
    if (link === null) {
      throw new UserInputError("Start wallet linking before submitting a signature");
    }
    const valid = await verifyMessage({
      address,
      message: buildWalletLinkMessage(link),
      signature
    });
    if (!valid) {
      throw new UserInputError("Wallet-link signature is invalid");
    }
    const linked: WalletLink = {
      ...link,
      status: "linked",
      linkedAt: new Date()
    };
    await this.repository.saveWalletLink(linked);
    return linked;
  }

  async requireLinkedOwner(telegramUserId: string, address: Address): Promise<void> {
    const link = await this.repository.getWalletLink(telegramUserId, address);
    if (link === null || link.status !== "linked") {
      throw new UserInputError("Link this owner wallet before using it for Safe signatures");
    }
  }
}

export function buildWalletLinkMessage(link: WalletLink): string {
  return [
    "The Family wallet link",
    `Telegram user: ${link.telegramUserId}`,
    `Wallet: ${link.address}`,
    `Nonce: ${link.nonce}`
  ].join("\n");
}
