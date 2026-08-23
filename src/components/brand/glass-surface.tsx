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
import { HOF_OUTLINE_CLASS } from "@/lib/hall-of-fame-style";
import { cn } from "@/lib/utils";

export type GlassSurfaceEffect = "liquid" | "css";
export type GlassSurfaceHonor = "hof";

/**
 * Shared glass surface.
 * Default `css` matches `.sports-card` frost (cheap for chrome / boards / heroes).
 * Prefer `liquid` only for rare marketing moments — SVG displacement is expensive
 * on sticky or large surfaces.
 */
export function GlassSurface({
  children,
  className,
  as = "div",
  accentColor,
  accentColorB,
  overflowVisible = false,
  backdropBlur = 24,
  effect = "css",
  honor,
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
  honor?: GlassSurfaceHonor;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className" | "style">) {
  const { resolvedDark, surface } = useOwnerTheme();
  // Match `.sports-card` glass fill so CSS panels read like site chrome frost.
  const veil = resolvedDark
    ? "rgba(28, 28, 30, 0.38)"
    : "rgba(255, 255, 255, 0.42)";
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
    ? "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgb(0 0 0 / 40%), 0 12px 32px rgb(0 0 0 / 36%)"
    : "inset 0 1px 0 rgba(255,255,255,0.70), 0 1px 2px rgb(0 0 0 / 4%), 0 8px 24px rgb(0 0 0 / 6%)";

  if (effect === "css") {
    const solid = surface === "solid";
    return createElement(
      as,
      {
        ...rest,
        className: cn(
          "rounded-md",
          honor === "hof" && HOF_OUTLINE_CLASS,
          className
        ),
        style: {
          overflow: overflowVisible ? "visible" : "hidden",
          background: solid ? "var(--card)" : tintColor,
          backdropFilter: solid
            ? undefined
            : `saturate(190%) blur(${backdropBlur}px)`,
          WebkitBackdropFilter: solid
            ? undefined
            : `saturate(190%) blur(${backdropBlur}px)`,
          border: solid
            ? undefined
            : resolvedDark
              ? "1px solid rgba(255,255,255,0.16)"
              : "1px solid rgba(255,255,255,0.58)",
          boxShadow: solid ? undefined : insetShadow,
          ...style,
        },
      },
      children
    );
  }

  // Liquid heroes keep a thinner veil so SVG displacement reads clearly.
  const liquidVeil = resolvedDark
    ? "rgba(0, 0, 0, 0.28)"
    : "rgba(255, 255, 255, 0.22)";
  const liquidStop = (color: string, amount: number) =>
    `color-mix(in oklab, ${color} ${amount}%, ${liquidVeil})`;
  const liquidTint =
    a && b
      ? `linear-gradient(90deg, ${liquidStop(a, edge)} 0%, ${liquidStop(a, inner)} 46%, ${liquidStop(b, inner)} 54%, ${liquidStop(b, edge)} 100%)`
      : a
        ? `linear-gradient(135deg, ${liquidStop(a, edge)} 0%, ${liquidStop(a, inner)} 38%, ${liquidVeil} 100%)`
        : liquidVeil;
  const liquidInset = resolvedDark
    ? "inset 0 1px 0 rgba(255,255,255,0.1)"
    : "inset 0 1px 0 rgba(255,255,255,0.45)";

  return (
    <LiquidGlass
      as={as}
      glassBorder
      backdropBlur={backdropBlur}
      displacementScale={70}
      turbulenceBaseFrequency={0.008}
      turbulenceSeed={1}
      tintColor={liquidTint}
      className={cn(
        "rounded-md",
        honor === "hof" && HOF_OUTLINE_CLASS,
        className
      )}
      style={{
        overflow: overflowVisible ? "visible" : "hidden",
        boxShadow: liquidInset,
        ...style,
      }}
      {...rest}
    >
      {children}
    </LiquidGlass>
  );
}
