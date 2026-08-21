import { cn } from "@/lib/utils";
import type { ProductionProviderGuard } from "@/data/diagnostics/production-provider-guard";

/**
 * Visible when career rows are empty for a reason other than "this player
 * simply has no seasons" - especially sample-provider misconfiguration.
 * Does not crash the page. Does not expose secrets.
 */
export function PlayerCareerDataGuardBanner({
  guard,
}: {
  guard: ProductionProviderGuard;
}) {
  if (guard.status === "ok") return null;
  if (
    guard.status === "live_provider_empty_career" &&
    !guard.isSilentEmptyCareerRisk
  ) {
    // Genuinely empty live career - keep quiet; the page empty copy is enough.
    return null;
  }

  const tone =
    guard.isSilentEmptyCareerRisk ||
    guard.status === "sample_provider_on_canonical_id"
      ? "border-amber-700/40 bg-amber-950/10"
      : "border-border bg-secondary/50";

  return (
    <section
      className={cn("rounded-md border px-3 py-2.5 text-[14px]", tone)}
      role="status"
    >
      <p className="font-bold tracking-tight">{guard.label}</p>
      <p className="mt-1 text-muted-foreground">{guard.message}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Provider: {guard.provider.name} · configured: {guard.configuredKey}
      </p>
    </section>
  );
}
