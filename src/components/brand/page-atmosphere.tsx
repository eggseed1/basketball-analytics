import type { CSSProperties } from "react";

/** Official NBA identity blue / red - home atmosphere only. */
export const NBA_ATMOSPHERE = {
  colorA: "#1D428A",
  colorB: "#C8102E",
} as const;

/**
 * Soft page wash so glass materials have color to sample
 * ([Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass),
 * [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).
 */
export function PageAtmosphere({
  colorA,
  colorB,
}: {
  colorA?: string | null;
  colorB?: string | null;
}) {
  const a = colorA?.trim() || null;
  const b = colorB?.trim() || a;
  if (!a) return null;
  return (
    <div
      aria-hidden
      className="page-atmosphere"
      style={
        {
          "--atmosphere-a": a,
          "--atmosphere-b": b ?? a,
        } as CSSProperties
      }
    />
  );
}
