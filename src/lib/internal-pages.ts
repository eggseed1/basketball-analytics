/**
 * Internal tools (/internal/*, /dashboard) render in local dev only, unless a
 * build sets DRBL_INTERNAL_PAGES=1. Production visitors get a 404.
 */
export function internalPagesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DRBL_INTERNAL_PAGES === "1";
}
