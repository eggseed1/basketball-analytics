"use client";

import {
  createContext,
  createElement,
  useContext,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";

import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { HOF_OUTLINE_CLASS } from "@/lib/hall-of-fame-style";
import { cn } from "@/lib/utils";

/** Liquid SVG glass — only fetched when a surface opts into `effect="liquid"`. */
const LiquidGlass = dynamic(
  () =>
    import("react-liquid-glass-svg").then((m) => ({ default: m.LiquidGlass }))
);

const GlassTintScale = createContext(1);

/** Scales the team-color tint of every GlassSurface below it (1 = default). */
export function GlassTintScaleProvider({
  scale,
  children,
}: {
  scale: number;
  children: ReactNode;
}) {
  return <GlassTintScale.Provider value={scale}>{children}</GlassTintScale.Provider>;
}

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
  const tintScale = useContext(GlassTintScale);
  // Same fill as `.sports-card`, so opaque washes mixed from --card sit flush.
  const veil = "var(--material-standard-bg)";
  const a = accentColor?.trim() || null;
  const b = accentColorB?.trim() || null;
  const stop = (color: string, amount: number) =>
    `color-mix(in oklab, ${color} ${amount}%, ${veil})`;
  // Whisper of team color only - frost stays dominant (not the opaque matchup wash).
  const edge = Number(((resolvedDark ? 9 : 7) * tintScale).toFixed(2));
  const inner = Number(((resolvedDark ? 4 : 3) * tintScale).toFixed(2));
  const tintColor =
    a && b
      ? `linear-gradient(90deg, ${stop(a, edge)} 0%, ${stop(a, inner)} 46%, ${stop(b, inner)} 54%, ${stop(b, edge)} 100%)`
      : a
        ? `linear-gradient(135deg, ${stop(a, edge)} 0%, ${stop(a, inner)} 38%, ${veil} 100%)`
        : veil;
  const insetShadow = resolvedDark
    ? "inset 0 1px 0 rgba(255,255,255,0.035), 0 1px 2px rgb(0 0 0 / 24%), 0 10px 28px rgb(0 0 0 / 20%)"
    : "inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 2px rgb(0 0 0 / 2%), 0 6px 20px rgb(0 0 0 / 3%)";

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
            : `saturate(150%) blur(${backdropBlur}px)`,
          WebkitBackdropFilter: solid
            ? undefined
            : `saturate(150%) blur(${backdropBlur}px)`,
          border: solid
            ? undefined
            : resolvedDark
              ? "1px solid rgba(255,255,255,0.045)"
              : "1px solid rgba(255,255,255,0.2)",
          boxShadow: solid ? undefined : insetShadow,
          ...style,
        },
      },
      children
    );
  }

  // Liquid heroes keep a thinner veil so SVG displacement reads clearly.
  const liquidVeil = resolvedDark
    ? "rgb(var(--glass-rgb) / 40%)"
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
    ? "inset 0 1px 0 rgba(255,255,255,0.07)"
    : "inset 0 1px 0 rgba(255,255,255,0.32)";

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
