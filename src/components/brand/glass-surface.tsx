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
import { HOF_OUTLINE_CLASS } from "@/lib/hall-of-fame-classes";
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
  // Light/dark values come from CSS vars (globals.css) so server HTML and the
  // first client render produce the same inline style in either theme.
  const { surface } = useOwnerTheme();
  const tintScale = useContext(GlassTintScale);
  // Same fill as `.sports-card`, so opaque washes mixed from --card sit flush.
  const veil = "var(--material-standard-bg)";
  const a = accentColor?.trim() || null;
  const b = accentColorB?.trim() || null;
  // Whisper of team color only - frost stays dominant (not the opaque matchup wash).
  const amount = (token: string) =>
    tintScale === 1 ? `var(${token})` : `calc(var(${token}) * ${tintScale})`;
  const edge = amount("--glass-tint-edge");
  const inner = amount("--glass-tint-inner");
  const gradient = (base: string) => {
    const stop = (color: string, pct: string) =>
      `color-mix(in oklab, ${color} ${pct}, ${base})`;
    if (a && b) {
      return `linear-gradient(90deg, ${stop(a, edge)} 0%, ${stop(a, inner)} 46%, ${stop(b, inner)} 54%, ${stop(b, edge)} 100%)`;
    }
    if (a) {
      return `linear-gradient(135deg, ${stop(a, edge)} 0%, ${stop(a, inner)} 38%, ${base} 100%)`;
    }
    return base;
  };

  if (effect === "css") {
    const solid = surface === "solid";
    return createElement(
      as,
      {
        ...rest,
        className: cn(
          "glass-surface rounded-[var(--card-radius)]",
          honor === "hof" && HOF_OUTLINE_CLASS,
          className
        ),
        style: {
          overflow: overflowVisible ? "visible" : "hidden",
          background: solid ? "var(--card)" : gradient(veil),
          backdropFilter: solid
            ? undefined
            : `saturate(150%) blur(${backdropBlur}px)`,
          WebkitBackdropFilter: solid
            ? undefined
            : `saturate(150%) blur(${backdropBlur}px)`,
          border: solid ? undefined : "var(--glass-edge-border)",
          boxShadow: solid ? undefined : "var(--glass-edge-shadow)",
          ...style,
        },
      },
      children
    );
  }

  // Liquid heroes keep a thinner veil so SVG displacement reads clearly.
  const liquidTint = gradient("var(--glass-liquid-veil)");
  const liquidInset = "var(--glass-liquid-inset)";

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
        "glass-surface rounded-[var(--card-radius)]",
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
