import type { CSSProperties } from "react";

/**
 * Floating UI defaults to transform:translate + will-change:transform, which
 * stops backdrop-filter from sampling the page. Pin with top/left instead.
 */
export function stripFloatingTransform(
  style?: CSSProperties
): CSSProperties | undefined {
  if (!style) return style;
  const next: CSSProperties = { ...style };
  if (next.willChange === "transform") {
    delete next.willChange;
  }
  const transform = next.transform;
  if (typeof transform !== "string" || transform === "none") {
    return next;
  }
  const match = /translate3?d?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/.exec(
    transform
  );
  if (match) {
    next.left = Number(match[1]);
    next.top = Number(match[2]);
  }
  next.transform = "none";
  return next;
}
