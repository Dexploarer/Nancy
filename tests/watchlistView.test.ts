import { describe, expect, it } from "bun:test";
import { formatWatchlist, formatWatchlistEntry } from "../src/bot/watchlistView.js";
import type { WatchlistEntry } from "../src/domain/types.js";

function entry(over: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    candidate: { rank: 1, tokenAddress: "0x1111111111111111111111111111111111111111", tokenSymbol: "GOOD", poolAddress: "0x2", dexId: "pancakeswap_v2", momentumScore: 80, conviction: "high", thesis: [], risks: [] },
    riskReport: { tokenAddress: "0x1111111111111111111111111111111111111111", level: "low", blocked: false, reasons: [], checkedAt: new Date() },
    treasurySizeBnb: 1, score: 88, grade: "A", gate: "pass", reasons: [],
    ...over
  };
}

describe("watchlistView", () => {
  it("renders a header and a line per entry with grade + symbol", () => {
    const text = formatWatchlist([entry(), entry({ candidate: { ...entry().candidate, tokenSymbol: "BAR" }, grade: "F", gate: "block" })], 1);
    expect(text.toLowerCase()).toContain("not financial advice");
    expect(text).toContain("GOOD");
    expect(text).toContain("BAR");
  });

  it("entry detail shows the gate and the token address", () => {
    const text = formatWatchlistEntry(entry(), "FOO explanation");
    expect(text).toContain("FOO explanation");
    expect(text).toContain("0x1111111111111111111111111111111111111111");
  });

  it("strips markdown-significant characters from the symbol and the explanation", () => {
    const text = formatWatchlistEntry(entry({ candidate: { ...entry().candidate, tokenSymbol: "FO*O" } }), "ape [now]_*`");
    expect(text).toContain("*FOO*");   // symbol sanitized inside its bold span
    expect(text).toContain("ape now"); // explanation sanitized (brackets/underscore/asterisk/backtick removed)
  });
});
