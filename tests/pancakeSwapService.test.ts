import { describe, expect, it } from "bun:test";
import { PancakeSwapService } from "../src/chain/pancakeSwapService.js";
import { getBscContractAddresses } from "../src/chain/addresses.js";

function serviceWithQuote(out: bigint[]): PancakeSwapService {
  const service = new PancakeSwapService(getBscContractAddresses(56), "https://bsc-dataseed.binance.org", 56);
  // Override the viem client's readContract with a deterministic stub.
  (service.publicClient as unknown as { readContract: () => Promise<bigint[]> }).readContract = async () => out;
  return service;
}

describe("PancakeSwapService.quoteTokenSell", () => {
  it("returns the last amount from getAmountsOut for token->WBNB", async () => {
    const service = serviceWithQuote([1000n, 950n]);
    const out = await service.quoteTokenSell("0x2222222222222222222222222222222222222222", 1000n);
    expect(out).toBe(950n);
  });

  it("throws when the quote returns no output", async () => {
    const service = serviceWithQuote([1000n, 0n]);
    await expect(service.quoteTokenSell("0x2222222222222222222222222222222222222222", 1000n)).rejects.toThrow(
      "PancakeSwap V2 quote returned no output"
    );
  });
});
