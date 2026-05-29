// Shared <head> branding + social-share (OpenGraph/Twitter) tags. Call
// `${brandHead()}` inside each page's <head>. The absolute og:image URL is filled
// from the base URL set once at startup via setOgBaseUrl(), so a shared Nancy link
// (e.g. the /pool Mini App) shows a title, description, and the Nancy banner.

const OG_TITLE = "Nancy, the Golden Girl of Binance";
const OG_DESCRIPTION =
  "Run a shared BSC Safe trading pool in your Telegram group — pool BNB, trade, and launch tokens. Non-custodial.";
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%92%9B%3C/text%3E%3C/svg%3E";

let ogBaseUrl: string | undefined;

// Set once at startup so social-share tags can carry an absolute og:image URL.
export function setOgBaseUrl(url: string | undefined): void {
  ogBaseUrl = url === undefined ? undefined : url.replace(/\/$/, "");
}

export function brandHead(): string {
  const imageTags =
    ogBaseUrl === undefined
      ? ""
      : `
  <meta property="og:image" content="${ogBaseUrl}/og-image.png" />
  <meta name="twitter:image" content="${ogBaseUrl}/og-image.png" />`;
  return `<link rel="icon" href="${FAVICON}" />
  <meta name="theme-color" content="#f0b90b" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${OG_TITLE}" />
  <meta property="og:description" content="${OG_DESCRIPTION}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${OG_TITLE}" />
  <meta name="twitter:description" content="${OG_DESCRIPTION}" />${imageTags}`;
}
