import { z } from "zod";
import { AppError } from "../domain/errors.js";
import type { TrendingCandidate } from "../domain/types.js";
import { parseAddress } from "../utils/evm.js";

const TokenSchema = z.object({
  rank: z.number(),
  score: z.number(),
  conviction: z.string().default("unknown"),
  tokenAddress: z.string(),
  tokenSymbol: z.string(),
  poolAddress: z.string(),
  dexId: z.string().default("unknown"),
  fdvUsd: z.number().nullish(),
  reserveUsd: z.number().nullish(),
  volumeUsdH1: z.number().nullish(),
  priceChangeH1: z.number().nullish(),
  poolAgeMinutes: z.number().nullish(),
  buysM5: z.number().nullish(),
  sellsM5: z.number().nullish(),
  buyersM5: z.number().nullish(),
  sellersM5: z.number().nullish(),
  volumeUsdM5: z.number().nullish(),
  thesis: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([])
});

const FeedSchema = z.object({ tokens: z.array(TokenSchema) });

export type ElizaOkFeedConfig = { url: string; cacheSeconds: number };

export class ElizaOkFeedService {
  private cache: { at: number; candidates: TrendingCandidate[] } | null = null;

  constructor(private readonly config: ElizaOkFeedConfig) {}

  async getCandidates(): Promise<TrendingCandidate[]> {
    const now = Date.now();
    if (this.cache !== null && now - this.cache.at < this.config.cacheSeconds * 1000) {
      return this.cache.candidates;
    }
    let response: Response;
    try {
      response = await fetch(this.config.url, { headers: { Accept: "application/json" } });
    } catch (error) {
      throw new AppError("elizaOK trending feed unavailable", { cause: String(error) });
    }
    if (!response.ok) {
      throw new AppError("elizaOK trending feed unavailable", { status: response.status });
    }
    const parsed = FeedSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new AppError("elizaOK trending feed returned an unexpected shape", { issues: parsed.error.message });
    }
    const candidates = parsed.data.tokens.map(normalize);
    this.cache = { at: now, candidates };
    return candidates;
  }
}

function normalize(token: z.infer<typeof TokenSchema>): TrendingCandidate {
  return {
    rank: token.rank,
    tokenAddress: parseAddress(token.tokenAddress.toLowerCase()),
    tokenSymbol: token.tokenSymbol,
    poolAddress: parseAddress(token.poolAddress.toLowerCase()),
    dexId: token.dexId,
    momentumScore: token.score,
    conviction: token.conviction,
    thesis: token.thesis,
    risks: token.risks,
    ...(token.fdvUsd == null ? {} : { fdvUsd: token.fdvUsd }),
    ...(token.reserveUsd == null ? {} : { reserveUsd: token.reserveUsd }),
    ...(token.volumeUsdH1 == null ? {} : { volumeUsdH1: token.volumeUsdH1 }),
    ...(token.priceChangeH1 == null ? {} : { priceChangeH1: token.priceChangeH1 }),
    ...(token.poolAgeMinutes == null ? {} : { poolAgeMinutes: token.poolAgeMinutes }),
    ...(token.buysM5 == null ? {} : { buysM5: token.buysM5 }),
    ...(token.sellsM5 == null ? {} : { sellsM5: token.sellsM5 }),
    ...(token.buyersM5 == null ? {} : { buyersM5: token.buyersM5 }),
    ...(token.sellersM5 == null ? {} : { sellersM5: token.sellersM5 }),
    ...(token.volumeUsdM5 == null ? {} : { volumeUsdM5: token.volumeUsdM5 })
  };
}
