import type { ExitSafetyGate, ExitSafetyGrade } from "../domain/types.js";

// Unknown depth is treated as this round-trip cost — high enough to saturate the cost penalty below.
const UNKNOWN_ROUND_TRIP_BPS = 2000;
// Score points removed per this many bps of round-trip exit cost (so /50 = 1 pt per 50 bps).
const COST_BPS_PER_POINT = 50;
// Sell tax above this (but at/under the block limit maxSellTaxBps) is a warning, not a block.
const NOTABLE_SELL_TAX_BPS = 300;

export type ExitSafetySignals = {
  momentumScore: number; // 0–100 from elizaOK
  priceChangeH1?: number;
  liquidityUsd?: number; // undefined = unknown depth
  roundTripLossBps?: number; // combined enter+exit cost at treasury size; undefined = unknown
  honeypot: boolean;
  cannotSellAll: boolean;
  sellTaxBps?: number;
  lpLockedPercent?: number; // 0–100
  lpHolderTopPercent?: number; // 0–100
  isBlacklisted: boolean;
  isOpenSource?: boolean;
  safetyUnknown?: boolean;
};

export type ExitSafetyThresholds = {
  mode: "warn" | "block";
  minLiquidityUsd: number;
  maxSellTaxBps: number;
  maxExitSlippageBps: number;
  minLpLockedPercent: number;
  maxLpHolderTopPercent: number;
};

export type ExitSafetyResult = {
  score: number; // 0–100, higher = safer to enter/exit
  grade: ExitSafetyGrade;
  gate: ExitSafetyGate;
  reasons: string[];
};

// Deterministic. No time, no randomness, no I/O. Same input => same output.
export function computeExitSafetyScore(signals: ExitSafetySignals, t: ExitSafetyThresholds): ExitSafetyResult {
  const hardBlocks: string[] = [];
  const warns: string[] = [];

  // --- Hard safety failures (cannot exit / will lose funds) ---
  if (signals.honeypot) hardBlocks.push("Flagged as honeypot — you may not be able to sell");
  if (signals.cannotSellAll) hardBlocks.push("Cannot-sell-all risk flagged");
  if (signals.isBlacklisted) hardBlocks.push("Blacklist mechanism present");
  if (signals.safetyUnknown) hardBlocks.push("Token safety could not be verified — try again shortly");
  if (signals.sellTaxBps !== undefined && signals.sellTaxBps > t.maxSellTaxBps) {
    hardBlocks.push(`Sell tax ${(signals.sellTaxBps / 100).toFixed(1)}% exceeds the exit-safety limit`);
  }
  if (signals.roundTripLossBps !== undefined && signals.roundTripLossBps > t.maxExitSlippageBps) {
    // A ~total round-trip loss almost always means the PancakeSwap-v2 WBNB pair is
    // near-empty (the real liquidity is on a launchpad bonding curve or Infinity),
    // not a literal 100% loss — word it honestly so it doesn't look broken next to a
    // healthy DexScreener liquidity figure.
    hardBlocks.push(
      signals.roundTripLossBps >= 9000
        ? "No clean PancakeSwap-v2 exit at your size — liquidity isn't in the v2 pair (likely a launchpad curve or Infinity)"
        : `Round-trip cost ${(signals.roundTripLossBps / 100).toFixed(1)}% at your size — too thin to exit cleanly`
    );
  }
  if (signals.liquidityUsd !== undefined && signals.liquidityUsd < t.minLiquidityUsd) {
    hardBlocks.push(`Liquidity below $${t.minLiquidityUsd}`);
  }
  if (signals.liquidityUsd === undefined || signals.roundTripLossBps === undefined) {
    hardBlocks.push("Depth unknown — could not confirm you can exit at your size");
  }
  if (signals.lpLockedPercent !== undefined && signals.lpLockedPercent < t.minLpLockedPercent) {
    hardBlocks.push(`Only ${signals.lpLockedPercent.toFixed(0)}% of liquidity locked/burned — rug risk`);
  }

  // --- Softer concerns (downgrade, not block) ---
  if (signals.lpLockedPercent === undefined) warns.push("Liquidity lock status unknown");
  if (signals.lpHolderTopPercent !== undefined && signals.lpHolderTopPercent > t.maxLpHolderTopPercent) {
    warns.push(`One LP holder controls ${signals.lpHolderTopPercent.toFixed(0)}% of unlocked liquidity`);
  }
  if (signals.isOpenSource === false) warns.push("Contract source not verified");
  if (signals.priceChangeH1 !== undefined && Math.abs(signals.priceChangeH1) > 50) {
    warns.push(`Volatile: ${signals.priceChangeH1.toFixed(0)}% in 1h (chase risk)`);
  }
  if (signals.sellTaxBps !== undefined && signals.sellTaxBps > NOTABLE_SELL_TAX_BPS && signals.sellTaxBps <= t.maxSellTaxBps) {
    warns.push(`Sell tax ${(signals.sellTaxBps / 100).toFixed(1)}% eats into exits`);
  }

  // --- Score (0–100). Start high, subtract for risk. Momentum is a small secondary nudge. ---
  // Risk signals compound on purpose: a hard-failing signal incurs both its continuous
  // deduction (e.g. exit cost, low lock) AND the per-hard-block penalty below.
  let score = 100;
  score -= Math.min(40, (signals.roundTripLossBps ?? UNKNOWN_ROUND_TRIP_BPS) / COST_BPS_PER_POINT); // exit cost dominates
  if (signals.lpLockedPercent !== undefined) score -= Math.max(0, (t.minLpLockedPercent - signals.lpLockedPercent) * 0.5);
  if (signals.lpHolderTopPercent !== undefined) score -= Math.min(15, signals.lpHolderTopPercent * 0.2);
  score -= hardBlocks.length * 20;
  score -= warns.length * 5;
  score += Math.min(5, signals.momentumScore / 20); // small secondary nudge
  score = Math.max(0, Math.min(100, Math.round(score)));

  const gate: ExitSafetyGate = hardBlocks.length > 0 ? (t.mode === "block" ? "block" : "warn") : warns.length > 0 ? "warn" : "pass";
  const reasons = [...hardBlocks, ...warns];
  const grade = gradeFor(score, gate);
  return { score, grade, gate, reasons };
}

function gradeFor(score: number, gate: ExitSafetyGate): ExitSafetyGrade {
  if (gate === "block") return "F";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}
