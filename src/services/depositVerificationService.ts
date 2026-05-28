import { createPublicClient, http, type Address, type Hex } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { UserInputError } from "../domain/errors.js";

export type VerifiedNativeDeposit = {
  transactionHash: Hex;
  sender: Address;
  recipient: Address;
  amountWei: bigint;
};

export type NativeDepositTransaction = {
  from: Address;
  to: Address | null;
  value: bigint;
};

export type NativeDepositReceipt = {
  status: "success" | "reverted";
};

export interface NativeDepositClient {
  getTransaction(input: { hash: Hex }): Promise<NativeDepositTransaction>;
  getTransactionReceipt(input: { hash: Hex }): Promise<NativeDepositReceipt>;
}

export class DepositVerificationService {
  private readonly publicClient: NativeDepositClient;

  constructor(rpcUrl: string, chainId: 56 | 97, client?: NativeDepositClient) {
    this.publicClient = client ?? createPublicClient({
      chain: chainId === 56 ? bsc : bscTestnet,
      transport: http(rpcUrl)
    });
  }

  async verifyNativeDeposit(input: {
    transactionHash: Hex;
    safeAddress: Address;
    // Optional: when provided it is checked against the on-chain value; when
    // omitted the verified on-chain amount is read and returned (lazy deposit).
    amountWei?: bigint;
    allowedSenders: Address[];
  }): Promise<VerifiedNativeDeposit> {
    const existingSender = input.allowedSenders.find((sender) => sender.length > 0);
    if (existingSender === undefined) {
      throw new UserInputError("Link or generate a wallet before crediting a pool deposit");
    }
    const transaction = await this.publicClient.getTransaction({ hash: input.transactionHash });
    const receipt = await this.publicClient.getTransactionReceipt({ hash: input.transactionHash });
    if (receipt.status !== "success") {
      throw new UserInputError("Deposit transaction is not successful", { transactionHash: input.transactionHash });
    }
    if (transaction.to === null || transaction.to.toLowerCase() !== input.safeAddress.toLowerCase()) {
      throw new UserInputError("Deposit transaction must send BNB directly to the group Safe");
    }
    if (input.amountWei !== undefined && transaction.value !== input.amountWei) {
      throw new UserInputError("Deposit transaction amount does not match the requested pool credit");
    }
    const senderAllowed = input.allowedSenders.some((sender) => sender.toLowerCase() === transaction.from.toLowerCase());
    if (!senderAllowed) {
      throw new UserInputError("Deposit transaction sender is not linked to your Telegram user");
    }
    return {
      transactionHash: input.transactionHash,
      sender: transaction.from,
      recipient: transaction.to,
      amountWei: transaction.value
    };
  }
}
