/**
 * Locale segment for edge HTML cache keys.
 * Must stay aligned with request locale resolution (cookie + Accept-Language).
 * Kept dependency-free so the Cloudflare worker entry can import it.
 */

const APP_LOCALES = new Set([
  "en",
  "es",
  "fr",
  "de",
  "pt-BR",
  "ko",
  "ja",
  "zh-Hans",
  "zh-Hant",
]);

const LOCALE_COOKIE = "DRBL_LOCALE";

function normalizeTag(tag: string): string {
  const raw = tag.trim().replace(/_/g, "-");
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "zh-hant" || lower.startsWith("zh-tw") || lower.startsWith("zh-hk") || lower.startsWith("zh-mo")) {
    return "zh-Hant";
  }
  if (lower === "zh-hans" || lower.startsWith("zh-cn") || lower.startsWith("zh-sg") || lower === "zh") {
    return "zh-Hans";
  }
  if (lower === "pt" || lower.startsWith("pt-")) return "pt-BR";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("ja")) return "ja";
  return raw;
}

function parseCookieLocale(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1));
    if (value === "auto") return null;
    // Pseudolocale and unknown values must not share the English cache bucket.
    if (value === "en-XA") return "en-XA";
    if (APP_LOCALES.has(value)) return value;
    return null;
  } catch {
    return null;
  }
}

function parseAcceptLanguage(header: string | null): string {
  if (!header?.trim()) return "en";
  const parts = header.split(",").map((part) => {
    const [tag, ...params] = part.trim().split(";");
    let q = 1;
    for (const param of params) {
      const [k, v] = param.trim().split("=");
      if (k === "q" && v) {
        const n = Number(v);
        if (Number.isFinite(n)) q = n;
      }
    }
    return { tag: tag?.trim() ?? "", q };
  });
  parts.sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    const normalized = normalizeTag(tag);
    if (APP_LOCALES.has(normalized)) return normalized;
  }
  return "en";
}

/**
 * Stable cache-key locale for HTML responses.
 * Explicit cookie wins; otherwise Accept-Language → implemented locale; default en.
 * Force-English env is applied by callers that have access to process/env bindings.
 */
export function localeCacheKeySegment(
  request: Request,
  options?: { forceLocale?: string | null }
): string {
  const forced = options?.forceLocale?.trim();
  if (forced && APP_LOCALES.has(forced)) return forced;

  const fromCookie = parseCookieLocale(request.headers.get("cookie"));
  if (fromCookie) return fromCookie;

  return parseAcceptLanguage(request.headers.get("accept-language"));
}

export { APP_LOCALES as LOCALE_CACHE_LOCALES, LOCALE_COOKIE };
