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
});

function response(body: JsonBody): Response {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
