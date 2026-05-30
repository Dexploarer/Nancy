import type { WatchlistEntry } from "../domain/types.js";

const GATE_ICON: Record<WatchlistEntry["gate"], string> = { pass: "🟢", warn: "🟡", block: "🔴" };

export function formatWatchlist(entries: WatchlistEntry[], treasurySizeBnb: number): string {
  const lines = [
    "💛 *Nancy's watch* — elizaOK finds them, I check if your group can get *out*.",
    `_Exit-safety at ${treasurySizeBnb} BNB. not financial advice._`,
    ""
  ];
  if (entries.length === 0) {
    lines.push("Nothing to show right now — the discovery feed is empty or unavailable.");
    return lines.join("\n");
  }
  entries.forEach((e, i) => {
    lines.push(`${i + 1}. ${GATE_ICON[e.gate]} *${e.candidate.tokenSymbol}* — grade ${e.grade} · momentum ${e.candidate.momentumScore}`);
  });
  lines.push("", "Tap a token for the full read.");
  return lines.join("\n");
}

export function formatWatchlistEntry(entry: WatchlistEntry, explanation: string): string {
  const lines = [
    `${GATE_ICON[entry.gate]} *${entry.candidate.tokenSymbol}* — grade ${entry.grade} (${entry.gate})`,
    explanation,
    "",
    entry.liquidityUsd === undefined ? "Liquidity: unknown" : `Liquidity: $${Math.round(entry.liquidityUsd).toLocaleString()}`,
    entry.roundTripLossBps === undefined ? "Exit cost at your size: unknown" : `Exit cost at your size: ${(entry.roundTripLossBps / 100).toFixed(1)}%`,
    `Token: \`${entry.candidate.tokenAddress}\``
  ];
  if (entry.reasons.length > 0) lines.push("", "Flags: " + entry.reasons.join("; "));
  if (entry.gate !== "pass") lines.push("", "_Nancy would not enter this at your size._");
  return lines.join("\n");
}
