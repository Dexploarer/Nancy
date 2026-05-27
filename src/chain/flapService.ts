import {
  concatHex,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
  type PublicClient
} from "viem";
import { randomBytes } from "node:crypto";
import { bsc, bscTestnet } from "viem/chains";
import { AppError, UserInputError } from "../domain/errors.js";
import type { ChainTransaction, FlapTokenStatus, VaultRecipient } from "../domain/types.js";
import { parseAddress } from "../utils/evm.js";
import { flapPortalAbi, flapVaultPortalAbi } from "./abis.js";
import { type BscContractAddresses, NATIVE_TOKEN_ADDRESS } from "./addresses.js";

type FlapTokenState = {
  status: FlapTokenStatus;
  reserve: bigint;
  circulatingSupply: bigint;
  price: bigint;
  tokenVersion: number;
  dexSupplyThresh: bigint;
  quoteTokenAddress: Address;
  nativeToQuoteSwapEnabled: boolean;
  taxRate: number;
  pool: Address;
  progress: bigint;
  lpFeeProfile: number;
  dexId: number;
  buyTaxRate: number;
  sellTaxRate: number;
};

type FlapLaunchInput = {
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

const STATUS_BY_CODE: Record<number, FlapTokenStatus> = {
  0: "invalid",
  1: "staged",
  2: "tradable",
  3: "dex"
};

export class FlapService {
  readonly publicClient: PublicClient;

  constructor(
    readonly addresses: BscContractAddresses,
    rpcUrl: string,
    chainId: 56 | 97
  ) {
    this.publicClient = createPublicClient({
      chain: chainId === 56 ? bsc : bscTestnet,
      transport: http(rpcUrl)
    });
  }

  async inspectToken(tokenAddress: Address): Promise<FlapTokenState> {
    const state = await this.publicClient.readContract({
      address: this.addresses.portal,
      abi: flapPortalAbi,
      functionName: "getTokenV8Safe",
      args: [tokenAddress]
    });
    return {
      status: STATUS_BY_CODE[state.status] ?? "unknown",
      reserve: state.reserve,
      circulatingSupply: state.circulatingSupply,
      price: state.price,
      tokenVersion: state.tokenVersion,
      dexSupplyThresh: state.dexSupplyThresh,
      quoteTokenAddress: state.quoteTokenAddress,
      nativeToQuoteSwapEnabled: state.nativeToQuoteSwapEnabled,
      taxRate: state.taxRate,
      pool: state.pool,
      progress: state.progress,
      lpFeeProfile: state.lpFeeProfile,
      dexId: state.dexId,
      buyTaxRate: state.buyTaxRate,
      sellTaxRate: state.sellTaxRate
    };
  }

  async quoteNativeBuy(tokenAddress: Address, inputAmountWei: bigint): Promise<bigint> {
    const simulation = await this.publicClient.simulateContract({
      address: this.addresses.portal,
      abi: flapPortalAbi,
      functionName: "quoteExactInput",
      args: [
        {
          inputToken: NATIVE_TOKEN_ADDRESS,
          outputToken: tokenAddress,
          inputAmount: inputAmountWei
        }
      ]
    });
    return simulation.result;
  }

  buildNativeBuyTransaction(tokenAddress: Address, inputAmountWei: bigint, minOutputAmount: bigint): ChainTransaction {
    return {
      to: this.addresses.portal,
      value: inputAmountWei,
      label: "Flap Portal buy",
      data: encodeFunctionData({
        abi: flapPortalAbi,
        functionName: "swapExactInput",
        args: [
          {
            inputToken: NATIVE_TOKEN_ADDRESS,
            outputToken: tokenAddress,
            inputAmount: inputAmountWei,
            minOutputAmount,
            permitData: "0x"
          }
        ]
      })
    };
  }

  buildLaunchTransaction(input: FlapLaunchInput): ChainTransaction {
    assertVaultRecipients(input.recipients);
    if (this.addresses.splitVaultFactory === NATIVE_TOKEN_ADDRESS) {
      throw new AppError("Split Vault factory address is not configured for this chain");
    }
    return {
      to: this.addresses.vaultPortal,
      value: input.initialBuyWei,
      label: "Flap Tax Token V3 launch with Split Vault",
      data: encodeFunctionData({
        abi: flapVaultPortalAbi,
        functionName: "newTokenV6WithVault",
        args: [
          {
            name: input.name,
            symbol: input.symbol,
            meta: input.metadataUri,
            dexThresh: 0n,
            salt: input.salt,
            migratorType: 0,
            quoteToken: NATIVE_TOKEN_ADDRESS,
            quoteAmt: input.initialBuyWei,
            permitData: "0x",
            extensionID: "0x0000000000000000000000000000000000000000000000000000000000000000",
            extensionData: "0x",
            dexId: 0,
            lpFeeProfile: 0,
            buyTaxRate: input.buyTaxBps,
            sellTaxRate: input.sellTaxBps,
            taxDuration: input.taxDurationSeconds,
            antiFarmerDuration: 0,
            mktBps: 0,
            deflationBps: 0,
            dividendBps: 10000,
            lpBps: 0,
            minimumShareBalance: 0n,
            dividendToken: NATIVE_TOKEN_ADDRESS,
            commissionReceiver: input.commissionReceiver,
            tokenVersion: 3,
            vaultFactory: this.addresses.splitVaultFactory,
            vaultData: encodeSplitVaultData(input.recipients)
          }
        ]
      })
    };
  }
}

export function calculateMinOutput(quoteAmount: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 5000) {
    throw new UserInputError("Slippage basis points out of range", { slippageBps });
  }
  return (quoteAmount * BigInt(10000 - slippageBps)) / 10000n;
}

export function encodeSplitVaultData(recipients: VaultRecipient[]): Hex {
  assertVaultRecipients(recipients);
  return encodeAbiParameters(
    [
      {
        name: "recipients",
        type: "tuple[]",
        components: [
          { name: "recipient", type: "address" },
          { name: "bps", type: "uint16" }
        ]
      }
    ],
    [recipients.map((recipient) => ({ recipient: recipient.address, bps: recipient.bps }))]
  );
}

export function parseVaultRecipients(value: string): VaultRecipient[] {
  const parts = value.split(",").filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new UserInputError("At least one vault recipient is required");
  }
  const recipients = parts.map((part) => {
    const [addressValue, bpsValue] = part.split(":");
    if (addressValue === undefined || bpsValue === undefined || !/^\d+$/.test(bpsValue)) {
      throw new UserInputError("Vault recipients must use address:bps format", { part });
    }
    return {
      address: parseAddress(addressValue),
      bps: Number(bpsValue)
    };
  });
  assertVaultRecipients(recipients);
  return recipients;
}

export function assertVaultRecipients(recipients: VaultRecipient[]): void {
  if (recipients.length === 0 || recipients.length > 10) {
    throw new UserInputError("Split Vault supports between 1 and 10 recipients", { count: recipients.length });
  }
  const seenRecipients = new Set<string>();
  const total = recipients.reduce((sum, recipient) => sum + recipient.bps, 0);
  if (total !== 10000) {
    throw new UserInputError("Split Vault recipient basis points must sum to 10000", { total });
  }
  for (const recipient of recipients) {
    if (recipient.address === NATIVE_TOKEN_ADDRESS) {
      throw new UserInputError("Split Vault recipient cannot be the zero address");
    }
    const normalizedAddress = recipient.address.toLowerCase();
    if (seenRecipients.has(normalizedAddress)) {
      throw new UserInputError("Split Vault recipients must be unique", { recipient: recipient.address });
    }
    seenRecipients.add(normalizedAddress);
    if (recipient.bps <= 0 || recipient.bps > 10000) {
      throw new UserInputError("Recipient basis points out of range", { bps: recipient.bps });
    }
  }
}

export function createFlapSalt(): Hex {
  return concatHex([`0x${randomBytes(30).toString("hex")}`, "0x7777"]);
}
