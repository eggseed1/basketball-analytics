"use client";

import {
  createElement,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { LiquidGlass } from "react-liquid-glass-svg";

import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { cn } from "@/lib/utils";

export type GlassSurfaceEffect = "liquid" | "css";

/**
 * Shared glass surface.
 * `liquid` uses SVG displacement (chrome, heroes). `css` is backdrop-filter
 * only - use it for long repeating lists so scroll stays cheap.
 */
export function GlassSurface({
  children,
  className,
  as = "div",
  accentColor,
  accentColorB,
  overflowVisible = false,
  backdropBlur = 16,
  effect = "liquid",
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  accentColor?: string | null;
  accentColorB?: string | null;
  overflowVisible?: boolean;
  backdropBlur?: number;
  effect?: GlassSurfaceEffect;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className" | "style">) {
  const { resolvedDark, surface } = useOwnerTheme();
  const veil = resolvedDark
    ? "rgba(0, 0, 0, 0.28)"
    : "rgba(255, 255, 255, 0.22)";
  const a = accentColor?.trim() || null;
  const b = accentColorB?.trim() || null;
  const stop = (color: string, amount: number) =>
    `color-mix(in oklab, ${color} ${amount}%, ${veil})`;
  // Whisper of team color only - frost stays dominant (not the opaque matchup wash).
  const edge = resolvedDark ? 9 : 7;
  const inner = resolvedDark ? 4 : 3;
  const tintColor =
    a && b
      ? `linear-gradient(90deg, ${stop(a, edge)} 0%, ${stop(a, inner)} 46%, ${stop(b, inner)} 54%, ${stop(b, edge)} 100%)`
      : a
        ? `linear-gradient(135deg, ${stop(a, edge)} 0%, ${stop(a, inner)} 38%, ${veil} 100%)`
        : veil;
  const insetShadow = resolvedDark
    ? "inset 0 1px 0 rgba(255,255,255,0.1)"
    : "inset 0 1px 0 rgba(255,255,255,0.45)";

  if (effect === "css") {
    const solid = surface === "solid";
    return createElement(
      as,
      {
        ...rest,
        className: cn("rounded-md", className),
        style: {
          overflow: overflowVisible ? "visible" : "hidden",
          background: solid ? "var(--card)" : tintColor,
          backdropFilter: solid
            ? undefined
            : `saturate(190%) blur(${backdropBlur}px)`,
          WebkitBackdropFilter: solid
            ? undefined
            : `saturate(190%) blur(${backdropBlur}px)`,
          border: resolvedDark
            ? "1px solid rgba(255,255,255,0.16)"
            : "1px solid rgba(255,255,255,0.58)",
          boxShadow: insetShadow,
          ...style,
        },
      },
      children
    );
  }

  return (
    <LiquidGlass
      as={as}
      glassBorder
      backdropBlur={backdropBlur}
      displacementScale={70}
      turbulenceBaseFrequency={0.008}
      turbulenceSeed={1}
      tintColor={tintColor}
      className={cn("rounded-md", className)}
      style={{
        overflow: overflowVisible ? "visible" : "hidden",
        boxShadow: insetShadow,
        ...style,
      }}
      {...rest}
    >
      {children}
    </LiquidGlass>
  );
}
