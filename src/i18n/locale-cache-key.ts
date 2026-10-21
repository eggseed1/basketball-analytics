/**
 * Locale segment for edge HTML cache keys.
 * Must stay aligned with request locale resolution (cookie + Accept-Language + nav hint).
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
const LOCALE_NAV_COOKIE = "DRBL_LOCALE_NAV";
const DEFAULT_LOCALE = "en";

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

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

function parseCookieLocale(cookieHeader: string | null): string | null {
  const value = cookieValue(cookieHeader, LOCALE_COOKIE);
  if (!value || value === "auto") return null;
  // Pseudolocale and unknown values must not share the English cache bucket.
  if (value === "en-XA") return "en-XA";
  if (APP_LOCALES.has(value)) return value;
  return null;
}

function parseNavHint(cookieHeader: string | null): string | null {
  const value = cookieValue(cookieHeader, LOCALE_NAV_COOKIE);
  if (value && APP_LOCALES.has(value)) return value;
  return null;
}

function parseAcceptLanguage(header: string | null): string {
  if (!header?.trim()) return DEFAULT_LOCALE;
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
  return DEFAULT_LOCALE;
}

/**
 * Stable cache-key locale for HTML responses.
 * Explicit cookie wins; otherwise Accept-Language (non-English), then system nav hint.
 * Force-English env is applied by callers that have access to process/env bindings.
 */
export function localeCacheKeySegment(
  request: Request,
  options?: { forceLocale?: string | null }
): string {
  const forced = options?.forceLocale?.trim();
  if (forced && APP_LOCALES.has(forced)) return forced;

  const cookieHeader = request.headers.get("cookie");
  const fromCookie = parseCookieLocale(cookieHeader);
  if (fromCookie) return fromCookie;

  const fromAccept = parseAcceptLanguage(request.headers.get("accept-language"));
  if (fromAccept !== DEFAULT_LOCALE) return fromAccept;

  const nav = parseNavHint(cookieHeader);
  if (nav) return nav;

  return fromAccept;
}

export { APP_LOCALES as LOCALE_CACHE_LOCALES, LOCALE_COOKIE, LOCALE_NAV_COOKIE };
