import { formatEther, isAddress, parseEther, type Address, type Hex } from "viem";
import { InvalidInputError } from "../domain/errors.js";

export function parseAddress(value: string): Address {
  if (!isAddress(value)) {
    throw new InvalidInputError("That is not a valid EVM address. It must start with 0x and be 40 hex characters.", { value });
  }
  return value;
}

export function parseBnbAmount(value: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) {
    throw new InvalidInputError("That is not a valid BNB amount. Use a decimal number like 0.25.", { value });
  }
  const amount = parseEther(value);
  if (amount <= 0n) {
    throw new InvalidInputError("BNB amount must be greater than zero.", { value });
  }
  return amount;
}

export function parseNonNegativeBnbAmount(value: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) {
    throw new InvalidInputError("That is not a valid BNB amount. Use a decimal number like 1.2 (0 is allowed).", { value });
  }
  return parseEther(value);
}

export function formatBnb(value: bigint): string {
  return `${formatEther(value)} BNB`;
}

export function parseBasisPoints(value: string, max: number): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidInputError("Basis points must be a whole number (1% = 100 bps).", { value });
  }
  const bps = Number(value);
  if (bps < 0 || bps > max) {
    throw new InvalidInputError(`Basis points must be between 0 and ${max} (${max / 100}%).`, { value, max });
  }
  return bps;
}

export function parseHex(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new InvalidInputError(`${label} must be a 0x-prefixed hex string.`, { value });
  }
  return value as Hex;
}

export function parseTransactionHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new InvalidInputError("That is not a valid transaction hash. It must be 0x followed by 64 hex characters.", { value });
  }
  return value as Hex;
}
