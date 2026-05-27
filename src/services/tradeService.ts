import type { Address } from "viem";
import { UserInputError } from "../domain/errors.js";
import type { ChatId, TradeProposal } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import { createId } from "../utils/ids.js";
import { NATIVE_TOKEN_ADDRESS } from "../chain/addresses.js";
import { buildFeeTransaction, splitTradingFee } from "../chain/feeService.js";
import { calculateMinOutput, FlapService } from "../chain/flapService.js";
import { PancakeSwapService } from "../chain/pancakeSwapService.js";
import { TokenRiskService } from "./tokenRiskService.js";

export type CreateNativeBuyInput = {
  chatId: ChatId;
  proposerTelegramId: string;
  tokenAddress: Address;
  inputAmountWei: bigint;
  slippageBps: number;
  tradeFeeBps: number;
  feeRecipient: Address;
  dexDeadlineSeconds: number;
};

export class TradeService {
  constructor(
    private readonly repository: Repository,
    private readonly flapService: FlapService,
    private readonly pancakeSwapService: PancakeSwapService,
    private readonly tokenRiskService: TokenRiskService
  ) {}

  async createNativeBuyProposal(input: CreateNativeBuyInput): Promise<TradeProposal> {
    const wallet = await this.repository.getGroupWallet(input.chatId);
    if (wallet === null) {
      throw new UserInputError("Set the group wallet before creating trade proposals");
    }

    const feeSplit = splitTradingFee(input.inputAmountWei, input.tradeFeeBps);
    if (feeSplit.netAmount <= 0n) {
      throw new UserInputError("Trade amount is too small after platform fee");
    }
    const riskReport = await this.tokenRiskService.checkBscToken(input.tokenAddress);
    if (riskReport.blocked) {
      throw new UserInputError("Token failed risk checks", { reasons: riskReport.reasons.join("; ") });
    }

    const flapState = await this.flapService.inspectToken(input.tokenAddress);
    if (flapState.status === "tradable") {
      return this.createFlapNativeBuyProposal(input, feeSplit.netAmount, feeSplit.feeAmount, riskReport);
    }
    if (flapState.status === "staged" || flapState.status === "unknown") {
      throw new UserInputError("Token is not a tradable Flap bonding-curve token", { status: flapState.status });
    }

    return this.createPancakeNativeBuyProposal(input, wallet.safeAddress, feeSplit.netAmount, feeSplit.feeAmount, riskReport);
  }

  async getProposal(id: string): Promise<TradeProposal | null> {
    return this.repository.getTradeProposal(id);
  }

  private async createFlapNativeBuyProposal(
    input: CreateNativeBuyInput,
    netAmountWei: bigint,
    feeAmountWei: bigint,
    riskReport: Awaited<ReturnType<TokenRiskService["checkBscToken"]>>
  ): Promise<TradeProposal> {
    const quote = await this.flapService.quoteNativeBuy(input.tokenAddress, netAmountWei);
    const minOutputAmount = calculateMinOutput(quote, input.slippageBps);
    const transactions = [
      buildFeeTransaction(NATIVE_TOKEN_ADDRESS, input.feeRecipient, feeAmountWei),
      this.flapService.buildNativeBuyTransaction(input.tokenAddress, netAmountWei, minOutputAmount)
    ].filter((transaction) => transaction !== null);

    const proposal: TradeProposal = {
      id: createId("trade"),
      chatId: input.chatId,
      proposerTelegramId: input.proposerTelegramId,
      tokenAddress: input.tokenAddress,
      inputAmountWei: input.inputAmountWei,
      minOutputAmount,
      feeAmountWei,
      route: "flap-portal",
      status: "created",
      riskReport,
      transactions,
      createdAt: new Date()
    };
    await this.repository.saveTradeProposal(proposal);
    return proposal;
  }

  private async createPancakeNativeBuyProposal(
    input: CreateNativeBuyInput,
    recipient: Address,
    netAmountWei: bigint,
    feeAmountWei: bigint,
    riskReport: Awaited<ReturnType<TokenRiskService["checkBscToken"]>>
  ): Promise<TradeProposal> {
    const quote = await this.pancakeSwapService.quoteNativeBuy(input.tokenAddress, netAmountWei);
    const minOutputAmount = calculateMinOutput(quote, input.slippageBps);
    const transactions = [
      buildFeeTransaction(NATIVE_TOKEN_ADDRESS, input.feeRecipient, feeAmountWei),
      this.pancakeSwapService.buildNativeBuyTransaction(
        input.tokenAddress,
        netAmountWei,
        minOutputAmount,
        recipient,
        input.dexDeadlineSeconds
      )
    ].filter((transaction) => transaction !== null);

    const proposal: TradeProposal = {
      id: createId("trade"),
      chatId: input.chatId,
      proposerTelegramId: input.proposerTelegramId,
      tokenAddress: input.tokenAddress,
      inputAmountWei: input.inputAmountWei,
      minOutputAmount,
      feeAmountWei,
      route: "pancakeswap-v2",
      status: "created",
      riskReport,
      transactions,
      createdAt: new Date()
    };
    await this.repository.saveTradeProposal(proposal);
    return proposal;
  }
}
