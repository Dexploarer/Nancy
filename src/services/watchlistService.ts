import { parseEther } from "viem";
import type { TrendingCandidate, WatchlistEntry } from "../domain/types.js";
import { computeExitSafetyScore, type ExitSafetyThresholds } from "./exitSafetyScore.js";

// Structural interfaces so this service is unit-testable with fakes.
interface FeedLike { getCandidates(): Promise<TrendingCandidate[]>; }
interface QuoteLike {
  quoteNativeBuy(token: `0x${string}`, amountWei: bigint): Promise<bigint>;
  quoteTokenSell(token: `0x${string}`, amountWei: bigint): Promise<bigint>;
}
interface RiskLike { checkBscToken(token: `0x${string}`): Promise<WatchlistEntry["riskReport"]>; }

export type WatchlistConfig = { maxTokens: number; defaultSizeBnb: number; thresholds: ExitSafetyThresholds };

export class WatchlistService {
  constructor(
    private readonly feed: FeedLike,
    private readonly quotes: QuoteLike,
    private readonly risk: RiskLike,
    private readonly config: WatchlistConfig
  ) {}

  async getList(_chatId: number, treasurySizeBnb?: number): Promise<WatchlistEntry[]> {
    const size = treasurySizeBnb && treasurySizeBnb > 0 ? treasurySizeBnb : this.config.defaultSizeBnb;
    const sizeWei = parseEther(size.toString());
    const candidates = await this.feed.getCandidates();
    const entries = await Promise.all(candidates.map((c) => this.enrich(c, size, sizeWei)));
    return entries.sort((a, b) => b.score - a.score).slice(0, this.config.maxTokens);
  }

  private async enrich(candidate: TrendingCandidate, size: number, sizeWei: bigint): Promise<WatchlistEntry> {
    const riskReport = await this.safeRisk(candidate.tokenAddress);
    const roundTripLossBps = await this.roundTrip(candidate.tokenAddress, sizeWei);
    const liquidityUsd = riskReport.liquidityUsd ?? candidate.reserveUsd;

    const result = computeExitSafetyScore(
      {
        momentumScore: candidate.momentumScore,
        honeypot: riskReport.reasons.some((r) => r.toLowerCase().includes("honeypot")),
        cannotSellAll: riskReport.reasons.some((r) => r.toLowerCase().includes("cannot-sell")),
        isBlacklisted: riskReport.reasons.some((r) => r.toLowerCase().includes("blacklist")),
        ...(candidate.priceChangeH1 === undefined ? {} : { priceChangeH1: candidate.priceChangeH1 }),
        ...(liquidityUsd === undefined ? {} : { liquidityUsd }),
        ...(roundTripLossBps === undefined ? {} : { roundTripLossBps }),
        ...(riskReport.sellTaxBps === undefined ? {} : { sellTaxBps: riskReport.sellTaxBps }),
        ...(riskReport.lpLockedPercent === undefined ? {} : { lpLockedPercent: riskReport.lpLockedPercent }),
        ...(riskReport.lpHolderTopPercent === undefined ? {} : { lpHolderTopPercent: riskReport.lpHolderTopPercent })
      },
      this.config.thresholds
    );

    return {
      candidate,
      riskReport,
      treasurySizeBnb: size,
      score: result.score,
      grade: result.grade,
      gate: result.gate,
      reasons: result.reasons,
      ...(roundTripLossBps === undefined ? {} : { roundTripLossBps }),
      ...(liquidityUsd === undefined ? {} : { liquidityUsd })
    };
  }

  // Round-trip cost in bps at the treasury size: buy sizeWei -> tokens -> sell back -> bnb.
  // Stateless quotes (an approximation; ignores intra-trade reserve shift). undefined = unknown.
  private async roundTrip(token: `0x${string}`, sizeWei: bigint): Promise<number | undefined> {
    try {
      const tokensOut = await this.quotes.quoteNativeBuy(token, sizeWei);
      if (tokensOut <= 0n) return undefined;
      const bnbBack = await this.quotes.quoteTokenSell(token, tokensOut);
      if (bnbBack <= 0n) return undefined;
      const lossBps = Number(((sizeWei - bnbBack) * 10000n) / sizeWei);
      return Math.max(0, lossBps);
    } catch {
      return undefined; // depth unknown -> scorer treats conservatively (block in block mode)
    }
  }

  private async safeRisk(token: `0x${string}`): Promise<WatchlistEntry["riskReport"]> {
    try {
      return await this.risk.checkBscToken(token);
    } catch {
      return { tokenAddress: token, level: "unknown", blocked: false, reasons: ["Safety check unavailable"], checkedAt: new Date() };
    }
  }
}
