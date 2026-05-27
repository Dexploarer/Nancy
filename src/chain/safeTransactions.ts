import { concatHex, encodeFunctionData, numberToHex, padHex, size, type Address, type Hex } from "viem";
import { UserInputError } from "../domain/errors.js";
import type { ChainTransaction, SafeTransactionData } from "../domain/types.js";
import { multiSendAbi } from "./abis.js";
import { NATIVE_TOKEN_ADDRESS } from "./addresses.js";

export function buildSafeTransactionData(
  transactions: ChainTransaction[],
  nonce: bigint,
  multiSendCallOnlyAddress: Address
): SafeTransactionData {
  if (transactions.length === 0) {
    throw new UserInputError("Safe submission requires at least one transaction");
  }
  const base = {
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: NATIVE_TOKEN_ADDRESS,
    refundReceiver: NATIVE_TOKEN_ADDRESS,
    nonce
  };
  if (transactions.length === 1) {
    const transaction = transactions[0];
    if (transaction === undefined) {
      throw new UserInputError("Safe submission requires at least one transaction");
    }
    return {
      ...base,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
      operation: 0
    };
  }
  return {
    ...base,
    to: multiSendCallOnlyAddress,
    value: 0n,
    operation: 1,
    data: encodeFunctionData({
      abi: multiSendAbi,
      functionName: "multiSend",
      args: [encodeMultiSendTransactions(transactions)]
    })
  };
}

export function encodeMultiSendTransactions(transactions: ChainTransaction[]): Hex {
  return concatHex(
    transactions.map((transaction) =>
      concatHex([
        "0x00",
        transaction.to,
        padHex(numberToHex(transaction.value), { size: 32 }),
        padHex(numberToHex(size(transaction.data)), { size: 32 }),
        transaction.data
      ])
    )
  );
}
