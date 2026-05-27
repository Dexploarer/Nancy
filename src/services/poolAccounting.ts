import { UserInputError } from "../domain/errors.js";

export const BASIS_POINTS = 10000n;

export type DepositShareInput = {
  amountWei: bigint;
  totalShares: bigint;
  activeNavWei: bigint;
};

export type WithdrawalQuoteInput = {
  memberShares: bigint;
  totalShares: bigint;
  activeNavWei: bigint;
  withdrawalBps: number;
  withdrawalFeeBps: number;
};

export type WithdrawalQuote = {
  shares: bigint;
  grossAmountWei: bigint;
  feeAmountWei: bigint;
  netAmountWei: bigint;
};

export function calculateDepositShares(input: DepositShareInput): bigint {
  if (input.amountWei <= 0n) {
    throw new UserInputError("Deposit amount must be positive");
  }
  if (input.totalShares === 0n) {
    return input.amountWei;
  }
  if (input.activeNavWei <= 0n) {
    throw new UserInputError("Pool NAV must be positive before minting shares");
  }
  const shares = (input.amountWei * input.totalShares) / input.activeNavWei;
  if (shares === 0n) {
    throw new UserInputError("Deposit amount is too small for current pool NAV");
  }
  return shares;
}

export function calculateWithdrawalQuote(input: WithdrawalQuoteInput): WithdrawalQuote {
  if (input.memberShares <= 0n) {
    throw new UserInputError("No active pool shares to withdraw");
  }
  if (input.totalShares <= 0n || input.activeNavWei <= 0n) {
    throw new UserInputError("Pool NAV is not withdrawable");
  }
  if (input.withdrawalBps <= 0 || input.withdrawalBps > 10000) {
    throw new UserInputError("Withdrawal basis points must be between 1 and 10000");
  }
  const shares = (input.memberShares * BigInt(input.withdrawalBps)) / BASIS_POINTS;
  if (shares === 0n) {
    throw new UserInputError("Withdrawal amount is too small");
  }
  const grossAmountWei = (shares * input.activeNavWei) / input.totalShares;
  if (grossAmountWei === 0n) {
    throw new UserInputError("Withdrawal value is too small");
  }
  const feeAmountWei = (grossAmountWei * BigInt(input.withdrawalFeeBps)) / BASIS_POINTS;
  return {
    shares,
    grossAmountWei,
    feeAmountWei,
    netAmountWei: grossAmountWei - feeAmountWei
  };
}

export function calculateOwnershipBps(shares: bigint, totalShares: bigint): number {
  if (totalShares === 0n) {
    return 0;
  }
  return Number((shares * BASIS_POINTS) / totalShares);
}

export function calculateShareValue(shares: bigint, totalShares: bigint, activeNavWei: bigint): bigint {
  if (shares === 0n || totalShares === 0n || activeNavWei === 0n) {
    return 0n;
  }
  return (shares * activeNavWei) / totalShares;
}
