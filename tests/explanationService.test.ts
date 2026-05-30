import { afterEach, describe, expect, it } from "bun:test";
import { ElizaExplanationService, TemplatedExplanationService } from "../src/services/explanationService.js";
import type { WatchlistEntry } from "../src/domain/types.js";

function entry(): WatchlistEntry {
  return {
    candidate: {
      rank: 1, tokenAddress: "0x3333333333333333333333333333333333333333", tokenSymbol: "FOO",
      poolAddress: "0x4444444444444444444444444444444444444444", dexId: "pancakeswap_v2",
      momentumScore: 80, conviction: "high", thesis: [], risks: []
    },
    riskReport: { tokenAddress: "0x3333333333333333333333333333333333333333", level: "low", blocked: false, reasons: [], checkedAt: new Date() },
    treasurySizeBnb: 1, score: 88, grade: "A", gate: "pass", reasons: []
  };
}

describe("explanationService", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch }));

  it("templated explanation is deterministic and mentions the grade", async () => {
    const svc = new TemplatedExplanationService();
    const a = await svc.explain(entry());
    const b = await svc.explain(entry());
    expect(a).toBe(b);
    expect(a).toContain("A");
  });

  it("eliza explanation falls back to template when the model errors", async () => {
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { throw new Error("down"); } });
    const svc = new ElizaExplanationService({ url: "https://model.example/v1/chat/completions", model: "eliza-1", timeoutMs: 50 });
    const text = await svc.explain(entry());
    expect(text.length).toBeGreaterThan(0); // never throws; returns the templated fallback
    expect(text).toContain("FOO");
  });
});
