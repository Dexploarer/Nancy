import type { WatchlistEntry } from "../domain/types.js";

export interface ExplanationService {
  explain(entry: WatchlistEntry): Promise<string>;
}

// Deterministic, no I/O. Also the fallback when the model is unavailable.
export class TemplatedExplanationService implements ExplanationService {
  async explain(entry: WatchlistEntry): Promise<string> {
    const verdict =
      entry.gate === "pass" ? "looks exitable" : entry.gate === "warn" ? "is risky to exit" : "is unsafe to enter";
    const head = `${entry.candidate.tokenSymbol} — grade ${entry.grade} (${entry.gate}). At ${entry.treasurySizeBnb} BNB it ${verdict}.`;
    const why = entry.reasons.length > 0 ? ` ${entry.reasons.join("; ")}.` : "";
    return head + why;
  }
}

export type ElizaConfig = { url: string; model: string; timeoutMs?: number; apiKey?: string };

// Turns the ALREADY-DECIDED numbers into prose. Never affects score/gate.
// Falls back to the templated explanation on any error/timeout.
export class ElizaExplanationService implements ExplanationService {
  private readonly fallback = new TemplatedExplanationService();

  constructor(private readonly config: ElizaConfig) {}

  async explain(entry: WatchlistEntry): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10000);
    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey === undefined ? {} : { Authorization: `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content:
                "You explain a token's exit-safety verdict for a group treasury on BNB Chain. Use ONLY the numbers given. Do NOT invent data and do NOT tell anyone to buy. 2 sentences max."
            },
            { role: "user", content: prompt(entry) }
          ],
          max_tokens: 160,
          temperature: 0.2
        })
      });
      if (!response.ok) return this.fallback.explain(entry);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content?.trim();
      return text && text.length > 0 ? text : this.fallback.explain(entry);
    } catch {
      return this.fallback.explain(entry);
    } finally {
      clearTimeout(timer);
    }
  }
}

function prompt(entry: WatchlistEntry): string {
  return [
    `Token: ${entry.candidate.tokenSymbol} (${entry.candidate.tokenAddress})`,
    `Nancy grade: ${entry.grade}; gate: ${entry.gate}; score: ${entry.score}/100`,
    `Treasury size used: ${entry.treasurySizeBnb} BNB`,
    entry.roundTripLossBps === undefined ? "Round-trip exit cost: unknown" : `Round-trip exit cost: ${(entry.roundTripLossBps / 100).toFixed(1)}%`,
    entry.liquidityUsd === undefined ? "Liquidity: unknown" : `Liquidity: $${Math.round(entry.liquidityUsd)}`,
    `elizaOK momentum: ${entry.candidate.momentumScore}/100 (${entry.candidate.conviction})`,
    `Flags: ${entry.reasons.length > 0 ? entry.reasons.join("; ") : "none"}`
  ].join("\n");
}
