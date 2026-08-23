import { linkNavigationKind } from "@/lib/navigation";

import type { MovementClaim } from "./types";

/**
 * Movement claim links must never point at fabricated outlet URLs.
 * Prototype seed rows omit external hrefs; only internal ledger links
 * (e.g. /offseason) or future verified ingest URLs are linked.
 */
export function resolveMovementClaimHref(
  claim: MovementClaim
): string | null {
  const url = claim.sourceUrl?.trim();
  if (!url) return null;

  if (url.startsWith("/")) return url;

  if (linkNavigationKind(url) !== "external") return url;

  if (claim.reporterLabel?.toLowerCase().includes("curated prototype")) {
    return null;
  }

  return url;
}

export function movementClaimOpensNewTab(href: string): boolean {
  return linkNavigationKind(href) === "external";
}
