import { formatEther, isAddress, parseEther, type Address, type Hex } from "viem";
import { UserInputError } from "../domain/errors.js";

export function parseAddress(value: string): Address {
  if (!isAddress(value)) {
    throw new UserInputError("Invalid EVM address", { value });
  }
  return value;
}

export function parseBnbAmount(value: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) {
    throw new UserInputError("Invalid BNB amount", { value });
  }
  const amount = parseEther(value);
  if (amount <= 0n) {
    throw new UserInputError("BNB amount must be positive", { value });
  }
  return amount;
}

export function parseNonNegativeBnbAmount(value: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) {
    throw new UserInputError("Invalid BNB amount", { value });
  }
  return parseEther(value);
}

export function formatBnb(value: bigint): string {
  return `${formatEther(value)} BNB`;
}

export function parseBasisPoints(value: string, max: number): number {
  if (!/^\d+$/.test(value)) {
    throw new UserInputError("Basis points must be an integer", { value });
  }
  const bps = Number(value);
  if (bps < 0 || bps > max) {
    throw new UserInputError("Basis points out of range", { value, max });
  }
  return bps;
}

export function parseHex(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new UserInputError(`${label} must be a hex string`);
  }
  return value as Hex;
}

export function parseTransactionHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new UserInputError("Transaction hash must be 32-byte hex");
  }
  return value as Hex;
}
