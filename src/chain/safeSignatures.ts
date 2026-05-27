import { concatHex, hexToNumber, isHex, numberToHex, recoverMessageAddress, size, type Hex } from "viem";
import { UserInputError } from "../domain/errors.js";
import type { Address } from "viem";

export type SafeConfirmation = {
  owner: Address;
  signature: Hex;
};

export function buildSignatureBytes(confirmations: SafeConfirmation[]): Hex {
  if (confirmations.length === 0) {
    throw new UserInputError("Safe transaction has no confirmations");
  }
  const uniqueConfirmations = new Map<string, SafeConfirmation>();
  for (const confirmation of confirmations) {
    uniqueConfirmations.set(confirmation.owner.toLowerCase(), confirmation);
  }
  return concatHex(
    [...uniqueConfirmations.values()]
      .sort((left, right) => left.owner.toLowerCase().localeCompare(right.owner.toLowerCase()))
      .map((confirmation) => confirmation.signature)
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
