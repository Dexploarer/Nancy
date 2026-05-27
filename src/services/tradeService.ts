import type { Address } from "viem";
import { UserInputError } from "../domain/errors.js";
import type { ChatId, TradeProposal } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import { createId } from "../utils/ids.js";
import { NATIVE_TOKEN_ADDRESS } from "../chain/addresses.js";
import { buildFeeTransaction, splitTradingFee } from "../chain/feeService.js";
import { calculateMinOutput, FlapService } from "../chain/flapService.js";

export type CreateNativeBuyInput = {
  chatId: ChatId;
  proposerTelegramId: string;
  tokenAddress: Address;
  inputAmountWei: bigint;
  slippageBps: number;
  tradeFeeBps: number;
  feeRecipient: Address;
};

export class TradeService {
  constructor(
    private readonly repository: Repository,
    private readonly flapService: FlapService
  ) {}

  async createNativeBuyProposal(input: CreateNativeBuyInput): Promise<TradeProposal> {
    const wallet = await this.repository.getGroupWallet(input.chatId);
    if (wallet === null) {
      throw new UserInputError("Set the group wallet before creating trade proposals");
    }

    const flapState = await this.flapService.inspectToken(input.tokenAddress);
    if (flapState.status === "dex") {
      const proposal: TradeProposal = {
        id: createId("trade"),
        chatId: input.chatId,
        proposerTelegramId: input.proposerTelegramId,
        tokenAddress: input.tokenAddress,
        inputAmountWei: input.inputAmountWei,
        minOutputAmount: 0n,
        feeAmountWei: 0n,
        route: "dex-required",
        status: "needs-dex-route",
        transactions: [],
        createdAt: new Date()
      };
      await this.repository.saveTradeProposal(proposal);
      return proposal;
    }

    if (flapState.status !== "tradable") {
      throw new UserInputError("Token is not a tradable Flap bonding-curve token", { status: flapState.status });
    }

    const feeSplit = splitTradingFee(input.inputAmountWei, input.tradeFeeBps);
    if (feeSplit.netAmount <= 0n) {
      throw new UserInputError("Trade amount is too small after platform fee");
    }

    const quote = await this.flapService.quoteNativeBuy(input.tokenAddress, feeSplit.netAmount);
    const minOutputAmount = calculateMinOutput(quote, input.slippageBps);
    const transactions = [
      buildFeeTransaction(NATIVE_TOKEN_ADDRESS, input.feeRecipient, feeSplit.feeAmount),
      this.flapService.buildNativeBuyTransaction(input.tokenAddress, feeSplit.netAmount, minOutputAmount)
    ].filter((transaction) => transaction !== null);

    const proposal: TradeProposal = {
      id: createId("trade"),
      chatId: input.chatId,
      proposerTelegramId: input.proposerTelegramId,
      tokenAddress: input.tokenAddress,
      inputAmountWei: input.inputAmountWei,
      minOutputAmount,
      feeAmountWei: feeSplit.feeAmount,
      route: "flap-portal",
      status: "created",
      transactions,
      createdAt: new Date()
    };
    await this.repository.saveTradeProposal(proposal);
    return proposal;
  }

  async getProposal(id: string): Promise<TradeProposal | null> {
    return this.repository.getTradeProposal(id);
  }
}
