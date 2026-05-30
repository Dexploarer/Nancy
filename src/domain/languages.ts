export type Language = { code: string; label: string; flag: string };

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "fr", label: "Français", flag: "🇫🇷" }
];

export const DEFAULT_LANGUAGES = ["en"];

export function languageByCode(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}

// Keep only supported codes, dedupe, preserve order; fall back to English if empty.
export function normalizeLanguages(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of codes) {
    if (SUPPORTED_LANGUAGES.some((l) => l.code === c) && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_LANGUAGES];
}
