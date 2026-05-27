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
});
