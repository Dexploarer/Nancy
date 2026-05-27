import type { Address } from "viem";
import type { TokenRiskReport } from "../domain/types.js";

type RiskConfig = {
  mode: "warn" | "block";
  minLiquidityUsd: number;
  maxBuyTaxBps: number;
  maxSellTaxBps: number;
};

type DexScreenerPair = {
  url?: string;
  liquidity?: {
    usd?: number;
  };
};

type DexScreenerResponse = {
  pairs?: DexScreenerPair[];
};

type GoPlusTokenSecurity = {
  is_honeypot?: string;
  cannot_sell_all?: string;
  is_blacklisted?: string;
  is_open_source?: string;
  buy_tax?: string;
  sell_tax?: string;
};

type GoPlusResponse = {
  result?: Record<string, GoPlusTokenSecurity>;
};

export class TokenRiskService {
  constructor(private readonly config: RiskConfig) {}

  async checkBscToken(tokenAddress: Address): Promise<TokenRiskReport> {
    const [dexScreener, goPlus] = await Promise.all([
      fetchDexScreener(tokenAddress),
      fetchGoPlus(tokenAddress)
    ]);
    const reasons: string[] = [];
    const liquidityUsd = getBestLiquidity(dexScreener);
    const pairUrl = getBestPairUrl(dexScreener);
    const tokenSecurity = getGoPlusTokenSecurity(goPlus, tokenAddress);
    const buyTaxBps = parseTaxBps(tokenSecurity?.buy_tax);
    const sellTaxBps = parseTaxBps(tokenSecurity?.sell_tax);

    if (liquidityUsd !== undefined && liquidityUsd < this.config.minLiquidityUsd) {
      reasons.push(`Liquidity below ${this.config.minLiquidityUsd} USD`);
    }
    if (liquidityUsd === undefined) {
      reasons.push("No DexScreener BSC liquidity found");
    }
    if (tokenSecurity?.is_honeypot === "1") {
      reasons.push("GoPlus flags token as honeypot");
    }
    if (tokenSecurity?.cannot_sell_all === "1") {
      reasons.push("GoPlus flags cannot-sell-all risk");
    }
    if (tokenSecurity?.is_blacklisted === "1") {
      reasons.push("GoPlus flags blacklist risk");
    }
    if (tokenSecurity?.is_open_source === "0") {
      reasons.push("Contract source is not verified/open-source");
    }
    if (buyTaxBps !== undefined && buyTaxBps > this.config.maxBuyTaxBps) {
      reasons.push(`Buy tax above ${this.config.maxBuyTaxBps} bps`);
    }
    if (sellTaxBps !== undefined && sellTaxBps > this.config.maxSellTaxBps) {
      reasons.push(`Sell tax above ${this.config.maxSellTaxBps} bps`);
    }

    const level = reasons.length === 0 ? "low" : reasons.length <= 2 ? "medium" : "high";
    return {
      tokenAddress,
      level,
      blocked: this.config.mode === "block" && reasons.length > 0,
      reasons,
      ...(liquidityUsd === undefined ? {} : { liquidityUsd }),
      ...(pairUrl === undefined ? {} : { pairUrl }),
      ...(buyTaxBps === undefined ? {} : { buyTaxBps }),
      ...(sellTaxBps === undefined ? {} : { sellTaxBps }),
      checkedAt: new Date()
    };
  }
}

async function fetchDexScreener(tokenAddress: Address): Promise<DexScreenerResponse> {
  const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/bsc/${tokenAddress}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    return {};
  }
  const pairs = (await response.json()) as DexScreenerPair[];
  return { pairs };
}

async function fetchGoPlus(tokenAddress: Address): Promise<GoPlusResponse> {
  const response = await fetch(`https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=${tokenAddress}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    return {};
  }
  return (await response.json()) as GoPlusResponse;
}

function getBestLiquidity(response: DexScreenerResponse): number | undefined {
  return response.pairs?.reduce<number | undefined>((best, pair) => {
    const liquidity = pair.liquidity?.usd;
    if (liquidity === undefined) {
      return best;
    }
    return best === undefined || liquidity > best ? liquidity : best;
  }, undefined);
}

function getBestPairUrl(response: DexScreenerResponse): string | undefined {
  const pairs = response.pairs ?? [];
  return [...pairs].sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0))[0]?.url;
}

function getGoPlusTokenSecurity(response: GoPlusResponse, tokenAddress: Address): GoPlusTokenSecurity | undefined {
  return response.result?.[tokenAddress.toLowerCase()] ?? response.result?.[tokenAddress];
}

function parseTaxBps(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.round(parsed * 10000);
}
