import { describe, expect, it } from "bun:test";
import { parseEther } from "viem";
import { calculateDepositShares, calculateWithdrawalQuote } from "../src/services/poolAccounting.js";

describe("poolAccounting", () => {
  it("mints first shares one-to-one and later deposits against active NAV", () => {
    expect(
      calculateDepositShares({
        amountWei: parseEther("100"),
        totalShares: 0n,
        activeNavWei: 0n
      })
    ).toBe(parseEther("100"));

    expect(
      calculateDepositShares({
        amountWei: parseEther("100"),
        totalShares: parseEther("100"),
        activeNavWei: parseEther("200")
      })
    ).toBe(parseEther("50"));
  });

  it("quotes withdrawals from shares and subtracts the withdrawal fee", () => {
    const quote = calculateWithdrawalQuote({
      memberShares: parseEther("100"),
      totalShares: parseEther("200"),
      activeNavWei: parseEther("300"),
      withdrawalBps: 5000,
      withdrawalFeeBps: 25
    });

    expect(quote.shares).toBe(parseEther("50"));
    expect(quote.grossAmountWei).toBe(parseEther("75"));
    expect(quote.feeAmountWei).toBe(parseEther("0.1875"));
    expect(quote.netAmountWei).toBe(parseEther("74.8125"));
  });

  it("rejects value-moving dust and invalid withdrawal inputs", () => {
    expect(() =>
      calculateDepositShares({
        amountWei: 0n,
        totalShares: 0n,
        activeNavWei: 0n
      })
    ).toThrow("Deposit amount must be positive");

    expect(() =>
      calculateDepositShares({
        amountWei: 1n,
        totalShares: parseEther("100"),
        activeNavWei: parseEther("1000000000000000000")
      })
    ).toThrow("too small");

    expect(() =>
      calculateWithdrawalQuote({
        memberShares: parseEther("1"),
        totalShares: parseEther("1"),
        activeNavWei: parseEther("1"),
        withdrawalBps: 0,
        withdrawalFeeBps: 25
      })
    ).toThrow("between 1 and 10000");
  });
});
