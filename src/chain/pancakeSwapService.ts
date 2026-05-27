import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Address,
  type PublicClient
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { AppError, UserInputError } from "../domain/errors.js";
import type { ChainTransaction } from "../domain/types.js";
import { pancakeV2RouterAbi } from "./abis.js";
import { type BscContractAddresses, NATIVE_TOKEN_ADDRESS } from "./addresses.js";

export class PancakeSwapService {
  readonly publicClient: PublicClient;

  constructor(
    private readonly addresses: BscContractAddresses,
    rpcUrl: string,
    chainId: 56 | 97
  ) {
    this.publicClient = createPublicClient({
      chain: chainId === 56 ? bsc : bscTestnet,
      transport: http(rpcUrl)
    });
  }

  async quoteNativeBuy(tokenAddress: Address, inputAmountWei: bigint): Promise<bigint> {
    this.assertConfigured();
    const amounts = await this.publicClient.readContract({
      address: this.addresses.pancakeV2Router,
      abi: pancakeV2RouterAbi,
      functionName: "getAmountsOut",
      args: [inputAmountWei, [this.addresses.wbnb, tokenAddress]]
    });
    const outputAmount = amounts.at(-1);
    if (outputAmount === undefined || outputAmount <= 0n) {
      throw new UserInputError("PancakeSwap V2 quote returned no output");
    }
    return outputAmount;
  }

  buildNativeBuyTransaction(
    tokenAddress: Address,
    inputAmountWei: bigint,
    minOutputAmount: bigint,
    recipient: Address,
    deadlineSeconds: number
  ): ChainTransaction {
    this.assertConfigured();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
    return {
      to: this.addresses.pancakeV2Router,
      value: inputAmountWei,
      label: "PancakeSwap V2 buy",
      data: encodeFunctionData({
        abi: pancakeV2RouterAbi,
        functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
        args: [minOutputAmount, [this.addresses.wbnb, tokenAddress], recipient, deadline]
      })
    };
  }

  private assertConfigured(): void {
    if (this.addresses.pancakeV2Router === NATIVE_TOKEN_ADDRESS || this.addresses.wbnb === NATIVE_TOKEN_ADDRESS) {
      throw new AppError("PancakeSwap V2 routing is not configured for this chain");
    }
  }
}
