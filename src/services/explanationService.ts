import type { WatchlistEntry } from "../domain/types.js";
import { languageByCode } from "../domain/languages.js";

export interface ExplanationService {
  explain(entry: WatchlistEntry, languages: string[]): Promise<string>;
}

const SYSTEM_PROMPT =
  "You are writing one short explanation for a token already scored by a deterministic system. The verdict is FINAL — do NOT change, question, contradict it, or mention buying or selling. In at most 2 sentences, explain why the given numbers support the stated verdict.";

// Deterministic, no I/O. Also the fallback when the model is unavailable.
export class TemplatedExplanationService implements ExplanationService {
  async explain(entry: WatchlistEntry, _languages: string[]): Promise<string> {
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

  async explain(entry: WatchlistEntry, languages: string[]): Promise<string> {
    const langs = languages.length > 0 ? languages : ["en"];
    const first = langs[0] ?? "en";
    if (langs.length === 1) return this.generate(entry, first);
    const parts: string[] = [];
    for (const code of langs) {
      const lang = languageByCode(code);
      const text = await this.generate(entry, code); // one language at a time (CPU is sequential)
      parts.push(lang ? `${lang.flag} ${text}` : text);
    }
    return parts.join("\n\n");
  }

  private async generate(entry: WatchlistEntry, code: string): Promise<string> {
    const lang = languageByCode(code);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20000);
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
          // eliza-1 is a Qwen3 reasoning model; without this it spends all tokens in
          // reasoning_content and returns empty content (→ we'd always fall back).
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            {
              role: "system",
              content: lang && lang.code !== "en" ? `${SYSTEM_PROMPT} Respond entirely in ${lang.label}.` : SYSTEM_PROMPT
            },
            { role: "user", content: prompt(entry) }
          ],
          max_tokens: 160,
          temperature: 0.2
        })
      });
      if (!response.ok) return this.fallback.explain(entry, [code]);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = stripThink(body.choices?.[0]?.message?.content ?? "").trim();
      return text.length > 0 ? text : this.fallback.explain(entry, [code]);
    } catch {
      return this.fallback.explain(entry, [code]);
    } finally {
      clearTimeout(timer);
    }
  }
}

// Qwen3 reasoning models can still emit <think>…</think>; strip it defensively.
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function prompt(entry: WatchlistEntry): string {
  const meaning =
    entry.gate === "pass"
      ? "safe to enter and exit at this size"
      : entry.gate === "warn"
        ? "risky to exit at this size"
        : "unsafe to exit at this size";
  return [
    `Verdict: ${entry.gate.toUpperCase()}, grade ${entry.grade} (${meaning}).`,
    `Token ${entry.candidate.tokenSymbol}, treasury size ${entry.treasurySizeBnb} BNB.`,
    entry.roundTripLossBps === undefined
      ? "Round-trip exit cost: unknown"
      : entry.roundTripLossBps >= 9000
        ? "PancakeSwap-v2 exit: none at this size (liquidity is on a launchpad curve or Infinity, not the v2 pair)"
        : `Round-trip exit cost: ${(entry.roundTripLossBps / 100).toFixed(1)}%`,
    entry.liquidityUsd === undefined ? "Liquidity: unknown" : `Liquidity: $${Math.round(entry.liquidityUsd)}`,
    `elizaOK momentum: ${entry.candidate.momentumScore}/100 (${entry.candidate.conviction})`,
    `Flags: ${entry.reasons.length > 0 ? entry.reasons.join("; ") : "none"}`
  ].join("\n");
}
