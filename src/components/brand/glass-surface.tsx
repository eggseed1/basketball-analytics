import {
  createElement,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Shared glass surface — CSS backdrop-filter only (MERGE.1).
 * Liquid SVG dependency deferred; dense lists must use this CSS path.
 *
 * Server-compatible: relies on `html[data-surface="glass"]` / `.dark` CSS,
 * not a client theme hook.
 */
export function GlassSurface({
  children,
  className,
  as = "div",
  accentColor,
  accentColorB,
  overflowVisible = false,
  backdropBlur = 16,
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  accentColor?: string | null;
  accentColorB?: string | null;
  overflowVisible?: boolean;
  /** Kept for Hannah API compatibility; CSS tokens own default blur. */
  backdropBlur?: number;
  /** @deprecated Liquid effect not installed in MERGE.1 — always CSS. */
  effect?: "liquid" | "css";
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className" | "style">) {
  const a = accentColor?.trim() || null;
  const b = accentColorB?.trim() || null;

  return createElement(
    as,
    {
      ...rest,
      className: cn("glass-surface rounded-md", className),
      style: {
        overflow: overflowVisible ? "visible" : "hidden",
        ["--glass-blur" as string]: `${backdropBlur}px`,
        ...(a ? { ["--glass-accent-a" as string]: a } : null),
        ...(b ? { ["--glass-accent-b" as string]: b } : null),
        ...style,
      } as CSSProperties,
    },
    children
  );
}
