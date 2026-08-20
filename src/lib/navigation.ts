/**
 * Href classification for navigation - keep external destinations off Next.js router.
 */

/** True for http(s), protocol-relative, mailto, tel, and other absolute schemes. */
export function isExternalHref(href: string): boolean {
  const t = href.trim();
  if (!t) return false;
  if (t.startsWith("//")) return true;
  // Absolute URL or non-path scheme (http:, https:, mailto:, tel:, …)
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return true;
  return false;
}

export function isHashHref(href: string): boolean {
  return href.trim().startsWith("#");
}

/**
 * Which element / navigation path DRBL should use.
 * - external → plain <a> (browser navigation only)
 * - hash → plain <a> (same-document)
 * - internal → next/link (client navigation)
 */
export type LinkNavigationKind = "external" | "hash" | "internal";

export function linkNavigationKind(href: string): LinkNavigationKind {
  if (isExternalHref(href)) return "external";
  if (isHashHref(href)) return "hash";
  return "internal";
}

/** True when the click should not trigger in-app navigation (modifier / non-primary). */
export function isModifiedClickEvent(event: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
}): boolean {
  return Boolean(
    event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (event.button != null && event.button !== 0)
  );
}

/**
 * Guard for programmatic navigation helpers - never feed external URLs to router.push.
 * Returns the href so it can be used inline: `router.push(assertInternalHref(path))`.
 */
export function assertInternalHref(href: string, context = "navigation"): string {
  if (isExternalHref(href)) {
    throw new Error(
      `${context}: refused external href for Next.js router (${href}). Use a plain <a> / AppLink.`
    );
  }
  return href;
}
