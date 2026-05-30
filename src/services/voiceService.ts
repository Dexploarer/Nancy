import { Logger } from "../logger.js";

// Kokoro covers these languages (others fall back to no voice).
const KOKORO_VOICE: Record<string, string> = {
  en: "af_bella",
  zh: "zf_xiaoxiao",
  es: "ef_dora",
  pt: "pf_dora",
  ja: "jf_alpha",
  fr: "ff_siwis",
  it: "if_sara"
};

export function voiceSupported(lang: string): boolean {
  return Object.prototype.hasOwnProperty.call(KOKORO_VOICE, lang);
}

export type VoiceConfig = { url: string; apiKey?: string; timeoutMs?: number };

// Synthesizes a Telegram-ready opus voice note. Returns null on any failure or
// unsupported language (caller degrades gracefully — no voice note).
export class VoiceService {
  constructor(private readonly config: VoiceConfig) {}

  async synthesize(text: string, lang: string): Promise<Buffer | null> {
    const voice = KOKORO_VOICE[lang];
    if (voice === undefined) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 45000);
    const startedAt = performance.now();
    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey === undefined ? {} : { Authorization: `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({ model: "kokoro", input: text.slice(0, 600), voice, response_format: "opus" })
      });
      if (!response.ok) {
        Logger.warn("[Voice] synth non-OK", { lang, status: response.status, ms: Math.round(performance.now() - startedAt) });
        return null;
      }
      const buf = Buffer.from(await response.arrayBuffer());
      Logger.info("[Voice] synth ok", { lang, bytes: buf.length, ms: Math.round(performance.now() - startedAt) });
      return buf.length > 0 ? buf : null;
    } catch (error) {
      Logger.warn("[Voice] synth failed", { lang, err: error instanceof Error ? error.message : String(error), ms: Math.round(performance.now() - startedAt) });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
