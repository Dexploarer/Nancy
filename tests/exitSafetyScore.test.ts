import { describe, expect, it } from "bun:test";
import { computeExitSafetyScore, type ExitSafetySignals, type ExitSafetyThresholds } from "../src/services/exitSafetyScore.js";

const thresholds: ExitSafetyThresholds = {
  mode: "block",
  minLiquidityUsd: 1000,
  maxSellTaxBps: 1500,
  maxExitSlippageBps: 1500,
  minLpLockedPercent: 50,
  maxLpHolderTopPercent: 50
};

function base(): ExitSafetySignals {
  return {
    momentumScore: 80,
    liquidityUsd: 150000,
    roundTripLossBps: 300,
    honeypot: false,
    cannotSellAll: false,
    buyTaxBps: 100,
    sellTaxBps: 100,
    lpLockedPercent: 80,
    lpHolderTopPercent: 10,
    isBlacklisted: false,
    isOpenSource: true
  };
}

describe("computeExitSafetyScore", () => {
  it("passes a clean, deep, locked token", () => {
    const r = computeExitSafetyScore(base(), thresholds);
    expect(r.gate).toBe("pass");
    expect(r.grade).toBe("A");
  });

  it("blocks a honeypot", () => {
    const r = computeExitSafetyScore({ ...base(), honeypot: true }, thresholds);
    expect(r.gate).toBe("block");
    expect(r.grade).toBe("F");
    expect(r.reasons.join(" ")).toContain("honeypot");
  });

  it("blocks when exit cost at size is too high", () => {
    const r = computeExitSafetyScore({ ...base(), roundTripLossBps: 4000 }, thresholds);
    expect(r.gate).toBe("block");
  });

  it("blocks unlocked liquidity in block mode", () => {
    const r = computeExitSafetyScore({ ...base(), lpLockedPercent: 5 }, thresholds);
    expect(r.gate).toBe("block");
  });

  it("blocks the elizaOK misfire token (tiny FDV, dumping, unlocked, unknown depth)", () => {
    const misfire: ExitSafetySignals = {
      momentumScore: 100,
      priceChangeH1: -99.987,
      // liquidityUsd omitted => undefined (unknown depth)
      // roundTripLossBps omitted => undefined (unknown depth)
      honeypot: false,
      cannotSellAll: false,
      lpLockedPercent: 0,
      lpHolderTopPercent: 90,
      isBlacklisted: false,
      isOpenSource: false
    };
    const r = computeExitSafetyScore(misfire, thresholds);
    expect(r.gate).toBe("block");
    expect(r.grade).toBe("F");
  });

  it("warns (not block) on a short-ish but exitable token in warn mode", () => {
    const r = computeExitSafetyScore({ ...base(), lpLockedPercent: 30, sellTaxBps: 800 }, { ...thresholds, mode: "warn" });
    expect(r.gate).toBe("warn");
  });

  it("is reproducible: same input -> same output", () => {
    const a = computeExitSafetyScore(base(), thresholds);
    const b = computeExitSafetyScore(base(), thresholds);
    expect(a).toEqual(b);
  });
});
