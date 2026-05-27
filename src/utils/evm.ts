import { formatEther, isAddress, parseEther, type Address } from "viem";
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
