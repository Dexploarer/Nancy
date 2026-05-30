import { describe, expect, it } from "bun:test";
import { WatchlistService } from "../src/services/watchlistService.js";
import type { TrendingCandidate, TokenRiskReport } from "../src/domain/types.js";

const cleanCandidate: TrendingCandidate = {
  rank: 1, tokenAddress: "0x1111111111111111111111111111111111111111", tokenSymbol: "GOOD",
  poolAddress: "0xaaaa111111111111111111111111111111111111", dexId: "pancakeswap_v2",
  momentumScore: 80, conviction: "high", thesis: [], risks: [], reserveUsd: 150000
};
const misfireCandidate: TrendingCandidate = {
  rank: 2, tokenAddress: "0x2222222222222222222222222222222222222222", tokenSymbol: "RUG",
  poolAddress: "0xbbbb222222222222222222222222222222222222", dexId: "pancakeswap_v2",
  momentumScore: 100, conviction: "high", thesis: [], risks: [], priceChangeH1: -99.987
};

function report(over: Partial<TokenRiskReport>): TokenRiskReport {
  return { tokenAddress: "0x0", level: "low", blocked: false, reasons: [], checkedAt: new Date(), ...over };
}

function buildService() {
  const feed = { getCandidates: async () => [cleanCandidate, misfireCandidate] };
  const pancake = {
    // 1:1 buy, 99.5% sell-back -> ~50 bps round trip for the clean token.
    quoteNativeBuy: async (token: string, amountWei: bigint) => (token === cleanCandidate.tokenAddress ? amountWei : 0n),
    quoteTokenSell: async (token: string, tokenAmount: bigint) => {
      if (token === cleanCandidate.tokenAddress) return (tokenAmount * 995n) / 1000n;
      throw new Error("no liquidity");
    }
  };
  const risk = {
    checkBscToken: async (token: string) =>
      token === cleanCandidate.tokenAddress
        ? report({ tokenAddress: cleanCandidate.tokenAddress, liquidityUsd: 150000, lpLockedPercent: 80, lpHolderTopPercent: 10 })
        : report({ tokenAddress: misfireCandidate.tokenAddress, lpLockedPercent: 0, lpHolderTopPercent: 90, level: "high" })
  };
  return new WatchlistService(feed as never, pancake as never, risk as never, {
    maxTokens: 10,
    defaultSizeBnb: 1,
    thresholds: { mode: "block", minLiquidityUsd: 1000, maxSellTaxBps: 1500, maxExitSlippageBps: 1500, minLpLockedPercent: 50, maxLpHolderTopPercent: 50 }
  });
}

describe("WatchlistService", () => {
  it("scores both, passing the clean token and blocking the misfire", async () => {
    const list = await buildService().getList(1);
    const good = list.find((e) => e.candidate.tokenSymbol === "GOOD");
    const rug = list.find((e) => e.candidate.tokenSymbol === "RUG");
    expect(good?.gate).toBe("pass");
    expect(rug?.gate).toBe("block"); // unlocked LP + unknown depth (sell quote threw)
  });

  it("ranks safer entries first", async () => {
    const list = await buildService().getList(1);
    expect(list[0]?.candidate.tokenSymbol).toBe("GOOD");
  });
});
