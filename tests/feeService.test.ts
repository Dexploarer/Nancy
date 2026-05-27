import { describe, expect, it } from "bun:test";
import { splitTradingFee } from "../src/chain/feeService.js";

describe("splitTradingFee", () => {
  it("deducts the configured fee from the input amount", () => {
    expect(splitTradingFee(1_000_000n, 10)).toEqual({
      feeAmount: 1_000n,
      netAmount: 999_000n
    });
  });

  it("allows zero-fee routing explicitly", () => {
    expect(splitTradingFee(1_000_000n, 0)).toEqual({
      feeAmount: 0n,
      netAmount: 1_000_000n
    });
  });
});
