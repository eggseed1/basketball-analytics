import { cn } from "@/lib/utils";
import type {
  HistoricalTeamBrand,
  HistoricalTeamBrandPalette,
} from "@/lib/historical-team-brand";
import type { CSSProperties } from "react";

type Size = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";

const PX: Record<Size, number> = {
  "2xs": 14,
  xs: 20,
  sm: 28,
  md: 40,
  lg: 64,
  xl: 96,
};

/** Visible label for a text mark (abbr preferred). */
export function historicalTeamMarkLabel(
  brand: Pick<HistoricalTeamBrand, "abbreviation" | "displayName">
): string {
  const abbr = brand.abbreviation?.trim();
  if (abbr) return abbr.slice(0, 3).toUpperCase();
  const fromName = brand.displayName?.trim();
  if (fromName) {
    const parts = fromName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    return fromName.slice(0, 3).toUpperCase();
  }
  return "?";
}

function textMarkStyle(
  sizePx: number,
  palette: HistoricalTeamBrandPalette | null | undefined
): CSSProperties {
  if (palette) {
    return {
      width: sizePx,
      height: sizePx,
      fontSize: Math.max(8, Math.round(sizePx * 0.3)),
      lineHeight: 1,
      background: palette.primary,
      color: palette.foreground,
      borderColor: palette.secondary,
      borderWidth: 2,
      borderStyle: "solid",
    };
  }
  // Neutral DRBL mark only when historical colors are unavailable.
  return {
    width: sizePx,
    height: sizePx,
    fontSize: Math.max(8, Math.round(sizePx * 0.3)),
    lineHeight: 1,
  };
}

/**
 * Server-safe team mark from a resolved historical brand.
 * historical_text uses era palette; never blank; never invents official logos.
 */
export function HistoricalTeamMark({
  brand,
  size = "sm",
  className,
  priority = false,
}: {
  brand: Pick<
    HistoricalTeamBrand,
    "abbreviation" | "logoUrl" | "source" | "displayName" | "palette"
  >;
  size?: Size;
  className?: string;
  priority?: boolean;
}) {
  const px = PX[size];
  const label = historicalTeamMarkLabel(brand);
  const hasImage =
    (brand.source === "historical_verified" || brand.source === "current") &&
    typeof brand.logoUrl === "string" &&
    brand.logoUrl.trim().length > 0;

  if (!hasImage) {
    const usesHistoricalPalette =
      brand.source === "historical_text" && brand.palette != null;
    return (
      <span
        className={cn(
          "historical-team-mark inline-flex shrink-0 items-center justify-center rounded-md font-bold tracking-wide shadow-none",
          usesHistoricalPalette
            ? null
            : "border border-border/70 bg-secondary text-secondary-foreground",
          className
        )}
        style={textMarkStyle(
          px,
          usesHistoricalPalette ? brand.palette : null
        )}
        title={brand.displayName || label}
        aria-hidden
      >
        {label}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static/CDN marks; avoid client Image islands in lists
    <img
      src={brand.logoUrl!}
      alt=""
      width={px}
      height={px}
      className={cn("shrink-0 object-contain", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
