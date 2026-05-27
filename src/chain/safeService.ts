import {
  concatHex,
  createPublicClient,
  encodeFunctionData,
  hexToNumber,
  http,
  isHex,
  numberToHex,
  padHex,
  recoverMessageAddress,
  size,
  type Address,
  type Hex,
  type PublicClient
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { AppError, UserInputError } from "../domain/errors.js";
import type { ChainTransaction, SafeTransactionData } from "../domain/types.js";
import { safeAbi, multiSendAbi } from "./abis.js";
import { type BscContractAddresses, NATIVE_TOKEN_ADDRESS } from "./addresses.js";

type ProposeTransactionInput = {
  serviceUrl: string;
  safeAddress: Address;
  safeTxHash: Hex;
  safeTransaction: SafeTransactionData;
  senderAddress: Address;
  senderSignature: Hex;
};

type ConfirmTransactionInput = {
  serviceUrl: string;
  safeTxHash: Hex;
  senderSignature: Hex;
};

type SafeConfigResponse = {
  transactionService?: string;
};

export class SafeService {
  readonly publicClient: PublicClient;

  constructor(
    private readonly addresses: BscContractAddresses,
    rpcUrl: string,
    private readonly chainId: 56 | 97,
    private readonly explicitTransactionServiceUrl?: string,
    private readonly apiKey?: string
  ) {
    this.publicClient = createPublicClient({
      chain: chainId === 56 ? bsc : bscTestnet,
      transport: http(rpcUrl)
    });
  }

  async prepareSafeTransaction(
    safeAddress: Address,
    transactions: ChainTransaction[]
  ): Promise<{
    safeTransaction: SafeTransactionData;
    safeTxHash: Hex;
    transactionServiceUrl: string;
  }> {
    const nonce = await this.publicClient.readContract({
      address: safeAddress,
      abi: safeAbi,
      functionName: "nonce"
    });
    const safeTransaction = SafeService.buildSafeTransactionData(transactions, nonce, this.addresses.multiSendCallOnly);
    const safeTxHash = await this.getSafeTransactionHash(safeAddress, safeTransaction);
    return {
      safeTransaction,
      safeTxHash,
      transactionServiceUrl: await this.resolveTransactionServiceUrl()
    };
  }

  async normalizeOwnerSignature(safeTxHash: Hex, ownerAddress: Address, signature: Hex): Promise<Hex> {
    return normalizeOwnerSignature(safeTxHash, ownerAddress, signature);
  }

  async proposeTransaction(input: ProposeTransactionInput): Promise<void> {
    await this.requestJson(`${trimTrailingSlash(input.serviceUrl)}/api/v2/safes/${input.safeAddress}/multisig-transactions/`, {
      method: "POST",
      body: JSON.stringify({
        to: input.safeTransaction.to,
        value: input.safeTransaction.value.toString(),
        data: input.safeTransaction.data,
        operation: input.safeTransaction.operation,
        safeTxGas: input.safeTransaction.safeTxGas.toString(),
        baseGas: input.safeTransaction.baseGas.toString(),
        gasPrice: input.safeTransaction.gasPrice.toString(),
        gasToken: input.safeTransaction.gasToken,
        refundReceiver: input.safeTransaction.refundReceiver,
        nonce: input.safeTransaction.nonce.toString(),
        contractTransactionHash: input.safeTxHash,
        sender: input.senderAddress,
        signature: input.senderSignature,
        origin: "The Family Bot"
      })
    });
  }

  async confirmTransaction(input: ConfirmTransactionInput): Promise<void> {
    await this.requestJson(`${trimTrailingSlash(input.serviceUrl)}/api/v1/multisig-transactions/${input.safeTxHash}/confirmations/`, {
      method: "POST",
      body: JSON.stringify({
        signature: input.senderSignature
      })
    });
  }

  async getTransaction(serviceUrl: string, safeTxHash: Hex): Promise<unknown> {
    return this.requestJson(`${trimTrailingSlash(serviceUrl)}/api/v1/multisig-transactions/${safeTxHash}/`, {
      method: "GET"
    });
  }

  static buildSafeTransactionData(
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

  private async getSafeTransactionHash(safeAddress: Address, transaction: SafeTransactionData): Promise<Hex> {
    return this.publicClient.readContract({
      address: safeAddress,
      abi: safeAbi,
      functionName: "getTransactionHash",
      args: [
        transaction.to,
        transaction.value,
        transaction.data,
        transaction.operation,
        transaction.safeTxGas,
        transaction.baseGas,
        transaction.gasPrice,
        transaction.gasToken,
        transaction.refundReceiver,
        transaction.nonce
      ]
    });
  }

  private async resolveTransactionServiceUrl(): Promise<string> {
    if (this.explicitTransactionServiceUrl !== undefined) {
      return this.explicitTransactionServiceUrl;
    }
    const response = await fetch(`https://safe-config.safe.global/api/v1/chains/${this.chainId}/`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new AppError("Safe Transaction Service is not configured for this chain", {
        chainId: this.chainId,
        status: response.status
      });
    }
    const config = (await response.json()) as SafeConfigResponse;
    if (config.transactionService === undefined || config.transactionService.length === 0) {
      throw new AppError("Safe Transaction Service URL missing from Safe config", { chainId: this.chainId });
    }
    return config.transactionService;
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(this.apiKey === undefined ? {} : { Authorization: `Bearer ${this.apiKey}` }),
        ...init.headers
      }
    });
    const text = await response.text();
    const payload = text.length === 0 ? null : JSON.parse(text);
    if (!response.ok) {
      throw new AppError("Safe Transaction Service request failed", {
        status: response.status,
        url
      });
    }
    return payload;
  }
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

export async function normalizeOwnerSignature(safeTxHash: Hex, ownerAddress: Address, signature: Hex): Promise<Hex> {
  if (!isHex(signature) || size(signature) !== 65) {
    throw new UserInputError("Signature must be a 65-byte hex value");
  }
  const safeAdjustedSignature = toSafeAdjustedEthSignSignature(signature);
  const personalSignSignature = toPersonalSignSignature(signature);
  const recovered = await recoverMessageAddress({
    message: { raw: safeTxHash },
    signature: personalSignSignature
  });
  if (recovered.toLowerCase() !== ownerAddress.toLowerCase()) {
    throw new UserInputError("Signature does not recover to the provided Safe owner", {
      ownerAddress,
      recovered
    });
  }
  return safeAdjustedSignature;
}

function toSafeAdjustedEthSignSignature(signature: Hex): Hex {
  const v = signatureV(signature);
  if (v === 31 || v === 32) {
    return signature;
  }
  if (v === 27 || v === 28) {
    return replaceSignatureV(signature, v + 4);
  }
  if (v === 0 || v === 1) {
    return replaceSignatureV(signature, v + 31);
  }
  throw new UserInputError("Unsupported signature recovery byte", { v });
}

function toPersonalSignSignature(signature: Hex): Hex {
  const v = signatureV(signature);
  if (v === 31 || v === 32) {
    return replaceSignatureV(signature, v - 4);
  }
  if (v === 27 || v === 28) {
    return signature;
  }
  if (v === 0 || v === 1) {
    return replaceSignatureV(signature, v + 27);
  }
  throw new UserInputError("Unsupported signature recovery byte", { v });
}

function signatureV(signature: Hex): number {
  return hexToNumber(`0x${signature.slice(-2)}`);
}

function replaceSignatureV(signature: Hex, v: number): Hex {
  return `${signature.slice(0, -2)}${numberToHex(v, { size: 1 }).slice(2)}` as Hex;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
