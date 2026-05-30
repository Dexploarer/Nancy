import { afterEach, describe, expect, it } from "bun:test";
import { ElizaOkFeedService } from "../src/services/elizaOkFeedService.js";

const SAMPLE = {
  generatedAt: "2026-05-29T23:00:33.254Z",
  count: 1,
  tokens: [
    {
      rank: 1,
      score: 100,
      conviction: "high",
      tokenAddress: "0xAB1B1b4e82EA28a3e4D2D8513aAA9C1e42ed493f",
      tokenSymbol: "OpenHuman",
      poolAddress: "0x1097313fe77ab707097e73c5f61cc8d1c3d4d02a",
      dexId: "pancakeswap_v2",
      fdvUsd: 80.27,
      reserveUsd: 173130.9,
      volumeUsdH1: 67417.99,
      priceChangeH1: -99.987,
      poolAgeMinutes: 2,
      thesis: ["x"],
      risks: ["y"]
    }
  ]
};

describe("ElizaOkFeedService", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch }));

  function withFetch(value: unknown): void {
    Object.defineProperty(globalThis, "fetch", { configurable: true, value });
  }

  it("validates and normalizes the trending feed", async () => {
    withFetch(async () => ({ ok: true, json: async () => SAMPLE }) as Response);
    const service = new ElizaOkFeedService({ url: "https://example.com/feed", cacheSeconds: 0 });
    const candidates = await service.getCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.tokenSymbol).toBe("OpenHuman");
    expect(candidates[0]?.momentumScore).toBe(100);
    expect(candidates[0]?.tokenAddress).toBe("0xab1b1b4e82ea28a3e4d2d8513aaa9c1e42ed493f");
  });

  it("throws AppError on a non-200 response", async () => {
    withFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
    const service = new ElizaOkFeedService({ url: "https://example.com/feed", cacheSeconds: 0 });
    await expect(service.getCandidates()).rejects.toThrow("elizaOK trending feed unavailable");
  });

  it("throws AppError on a malformed payload", async () => {
    withFetch(async () => ({ ok: true, json: async () => ({ tokens: [{ rank: "nope" }] }) }) as Response);
    const service = new ElizaOkFeedService({ url: "https://example.com/feed", cacheSeconds: 0 });
    await expect(service.getCandidates()).rejects.toThrow("elizaOK trending feed");
  });
});
