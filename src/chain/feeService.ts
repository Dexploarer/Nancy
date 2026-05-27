import { encodeFunctionData, type Address } from "viem";
import type { ChainTransaction } from "../domain/types.js";
import { erc20Abi } from "./abis.js";
import { NATIVE_TOKEN_ADDRESS } from "./addresses.js";

export type FeeSplit = {
  feeAmount: bigint;
  netAmount: bigint;
};

export function splitTradingFee(inputAmount: bigint, feeBps: number): FeeSplit {
  const feeAmount = (inputAmount * BigInt(feeBps)) / 10000n;
  return {
    feeAmount,
    netAmount: inputAmount - feeAmount
  };
}

export function buildFeeTransaction(inputToken: Address, feeRecipient: Address, feeAmount: bigint): ChainTransaction | null {
  if (feeAmount === 0n) {
    return null;
  }
  if (inputToken === NATIVE_TOKEN_ADDRESS) {
    return {
      to: feeRecipient,
      value: feeAmount,
      data: "0x",
      label: "Platform trading fee"
    };
  }
  return {
    to: inputToken,
    value: 0n,
    label: "Platform token trading fee",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [feeRecipient, feeAmount]
    })
  };
}
