import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { EraTheme } from "@/themes/era-theme";

/** Scopes CSS variable overrides for an era theme. */
export function EraThemeScope({
  theme,
  className,
  children,
}: {
  theme: EraTheme;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("tm-scope min-h-full", className)}
      data-era-theme={theme.cssKey}
      data-era-name={theme.name}
    >
      {children}
    </div>
  );
}

export function HistoricalModeBanner({
  season,
  themeName,
  themeMode,
}: {
  season: string;
  themeName: string;
  themeMode: "historical" | "modern";
}) {
  return (
    <div className="tm-mode-banner" role="status">
      Historical Mode · {season}
      <span className="mx-2 text-border">·</span>
      {themeMode === "modern" ? "Modern DRBL theme" : `${themeName} theme`}
    </div>
  );
}
