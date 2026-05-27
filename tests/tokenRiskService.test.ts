import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenRiskService } from "../src/services/tokenRiskService.js";

describe("TokenRiskService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks tokens when risk mode is block and provider checks return high-risk signals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
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
      })
    );
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

function response(body: unknown): Response {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
