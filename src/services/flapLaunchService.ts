import type { Address, Hex } from "viem";
import type { ChatId, FlapLaunchProposal, VaultRecipient } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import { createId } from "../utils/ids.js";
import { FlapService } from "../chain/flapService.js";
import { UserInputError } from "../domain/errors.js";

export type CreateFlapLaunchInput = {
  chatId: ChatId;
  proposerTelegramId: string;
  name: string;
  symbol: string;
  metadataUri: string;
  buyTaxBps: number;
  sellTaxBps: number;
  taxDurationSeconds: number;
  initialBuyWei: bigint;
  recipients: VaultRecipient[];
  salt: Hex;
  commissionReceiver: Address;
};

export class FlapLaunchService {
  constructor(
    private readonly repository: Repository,
    private readonly flapService: FlapService
  ) {}

  async createLaunchProposal(input: CreateFlapLaunchInput): Promise<FlapLaunchProposal> {
    const wallet = await this.repository.getGroupWallet(input.chatId);
    if (wallet === null) {
      throw new UserInputError("Set the group wallet before creating Flap launch proposals");
    }

    const transaction = this.flapService.buildLaunchTransaction({
      name: input.name,
      symbol: input.symbol,
      metadataUri: input.metadataUri,
      buyTaxBps: input.buyTaxBps,
      sellTaxBps: input.sellTaxBps,
      taxDurationSeconds: input.taxDurationSeconds,
      initialBuyWei: input.initialBuyWei,
      recipients: input.recipients,
      salt: input.salt,
      commissionReceiver: input.commissionReceiver
    });

    const proposal: FlapLaunchProposal = {
      id: createId("flap"),
      chatId: input.chatId,
      proposerTelegramId: input.proposerTelegramId,
      name: input.name,
      symbol: input.symbol,
      metadataUri: input.metadataUri,
      buyTaxBps: input.buyTaxBps,
      sellTaxBps: input.sellTaxBps,
      taxDurationSeconds: input.taxDurationSeconds,
      initialBuyWei: input.initialBuyWei,
      recipients: input.recipients,
      salt: input.salt,
      transactions: [transaction],
      createdAt: new Date()
    };
    await this.repository.saveFlapLaunch(proposal);
    return proposal;
  }

  async getLaunch(id: string): Promise<FlapLaunchProposal | null> {
    return this.repository.getFlapLaunch(id);
  }
}
