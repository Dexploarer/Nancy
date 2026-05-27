import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";
import { AppError, UserInputError } from "../domain/errors.js";
import type { ChainTransaction, SafeTransactionData } from "../domain/types.js";
import { safeAbi } from "./abis.js";
import type { BscContractAddresses } from "./addresses.js";
import { buildSignatureBytes, normalizeOwnerSignature, type SafeConfirmation } from "./safeSignatures.js";
import { buildSafeTransactionData } from "./safeTransactions.js";

export { buildSignatureBytes, normalizeOwnerSignature } from "./safeSignatures.js";
export { encodeMultiSendTransactions } from "./safeTransactions.js";

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

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type SafeTransactionServiceStatus = {
  confirmations?: SafeConfirmation[];
} & { [key: string]: JsonValue | SafeConfirmation[] | undefined };

export class SafeService {
  readonly publicClient: PublicClient;
  private readonly chain;
  private readonly walletClient?: ReturnType<typeof createWalletClient>;
  private readonly executorAccount?: ReturnType<typeof privateKeyToAccount>;

  constructor(
    private readonly addresses: BscContractAddresses,
    rpcUrl: string,
    private readonly chainId: 56 | 97,
    private readonly explicitTransactionServiceUrl?: string,
    private readonly apiKey?: string,
    executorPrivateKey?: Hex
  ) {
    this.chain = chainId === 56 ? bsc : bscTestnet;
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl)
    });
    if (executorPrivateKey !== undefined) {
      this.executorAccount = privateKeyToAccount(executorPrivateKey);
      this.walletClient = createWalletClient({
        account: this.executorAccount,
        chain: this.chain,
        transport: http(rpcUrl)
      });
    }
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

  async getTransaction(serviceUrl: string, safeTxHash: Hex): Promise<SafeTransactionServiceStatus> {
    return this.requestJson<SafeTransactionServiceStatus>(`${trimTrailingSlash(serviceUrl)}/api/v1/multisig-transactions/${safeTxHash}/`, {
      method: "GET"
    });
  }

  async executeTransaction(
    safeAddress: Address,
    safeTransaction: SafeTransactionData,
    confirmations: SafeConfirmation[]
  ): Promise<Hex> {
    if (this.walletClient === undefined || this.executorAccount === undefined) {
      throw new UserInputError("SAFE_EXECUTOR_PRIVATE_KEY is required to execute Safe transactions from the bot");
    }
    const signatures = buildSignatureBytes(confirmations);
    return this.walletClient.writeContract({
      address: safeAddress,
      abi: safeAbi,
      functionName: "execTransaction",
      account: this.executorAccount,
      chain: this.chain,
      args: [
        safeTransaction.to,
        safeTransaction.value,
        safeTransaction.data,
        safeTransaction.operation,
        safeTransaction.safeTxGas,
        safeTransaction.baseGas,
        safeTransaction.gasPrice,
        safeTransaction.gasToken,
        safeTransaction.refundReceiver,
        signatures
      ]
    });
  }

  static buildSafeTransactionData(
    transactions: ChainTransaction[],
    nonce: bigint,
    multiSendCallOnlyAddress: Address
  ): SafeTransactionData {
    return buildSafeTransactionData(transactions, nonce, multiSendCallOnlyAddress);
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

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
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
    const payload = text.length === 0 ? null : (JSON.parse(text) as JsonValue);
    if (!response.ok) {
      throw new AppError("Safe Transaction Service request failed", {
        status: response.status,
        url
      });
    }
    return payload as T;
  }
}

export function extractConfirmations(status: SafeTransactionServiceStatus): SafeConfirmation[] {
  return status.confirmations ?? [];
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
