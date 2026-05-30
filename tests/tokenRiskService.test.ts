import { afterEach, describe, expect, it } from "bun:test";
import { TokenRiskService } from "../src/services/tokenRiskService.js";

type JsonBody = string | number | boolean | null | JsonBody[] | { [key: string]: JsonBody };

describe("TokenRiskService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch
    });
  });

  it("blocks tokens when risk mode is block and provider checks return high-risk signals", async () => {
    const fakeFetch = async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("dexscreener")) {
        return response([
          {
            url: "https://dexscreener.com/bsc/pair",
            liquidity: { usd: 100 }
          }
        ]);
      }
      return response({
        result: {
          "0x1111111111111111111111111111111111111111": {
            is_honeypot: "1",
            buy_tax: "0.20",
            sell_tax: "0.25"
          }
        }
      });
    };
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fakeFetch
    });
    const service = new TokenRiskService({
      mode: "block",
      minLiquidityUsd: 1000,
      maxBuyTaxBps: 1500,
      maxSellTaxBps: 1500
    });

    const report = await service.checkBscToken("0x1111111111111111111111111111111111111111");

    expect(report.blocked).toBe(true);
    expect(report.level).toBe("high");
    expect(report.reasons).toContain("GoPlus flags token as honeypot");
  });

  it("surfaces GoPlus LP lock and holder fields", async () => {
    const token = "0x3333333333333333333333333333333333333333";
    const fakeFetch = async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("dexscreener")) {
        return response([{ url: "https://dexscreener.com/bsc/pair", liquidity: { usd: 50000 } }]);
      }
      return response({
        result: {
          [token]: {
            is_honeypot: "0",
            buy_tax: "0.01",
            sell_tax: "0.01",
            holder_count: "1200",
            lp_holder_count: "3",
            lp_holders: [
              { address: "0x000000000000000000000000000000000000dead", percent: "0.6", is_locked: 1, tag: "Burn" },
              { address: "0xabc", percent: "0.3", is_locked: 0 },
              { address: "0xdef", percent: "0.1", is_locked: 0 }
            ]
          }
        }
      });
    };
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fakeFetch });
    const service = new TokenRiskService({ mode: "warn", minLiquidityUsd: 1000, maxBuyTaxBps: 1500, maxSellTaxBps: 1500 });

    const report = await service.checkBscToken(token);

    expect(report.lpLockedPercent).toBeCloseTo(60, 0);   // burned LP counts as locked
    expect(report.lpHolderTopPercent).toBeCloseTo(30, 0); // largest non-locked holder
    expect(report.lpHolderCount).toBe(3);
    expect(report.holderCount).toBe(1200);
  });
});

function response(body: JsonBody): Response {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
