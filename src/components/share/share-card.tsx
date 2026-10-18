import type { CSSProperties, ReactNode } from "react";

/** Colors copied from the site light and dark tokens so a PNG does not follow the page theme. */
export const SHARE_PALETTE = {
  light: {
    canvas: "#f2f2f7",
    card: "#ffffff",
    fg: "#1d1d1f",
    muted: "#6e6e73",
    line: "rgba(29, 29, 31, 0.08)",
    track: "rgba(29, 29, 31, 0.08)",
    tile: "rgba(29, 29, 31, 0.04)",
    border: "rgba(0, 0, 0, 0.06)",
  },
  dark: {
    canvas: "#0c0d11",
    card: "#17191d",
    fg: "#eff0f3",
    muted: "#a6a9b1",
    line: "rgba(255, 255, 255, 0.08)",
    track: "rgba(255, 255, 255, 0.08)",
    tile: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.06)",
  },
} as const;

export type ShareAppearance = keyof typeof SHARE_PALETTE;

export function ShareCardFrame({
  appearance,
  colorA,
  colorB,
  children,
}: {
  appearance: ShareAppearance;
  /** Team colors for the page wash. One color is enough; the second orb repeats it. */
  colorA?: string | null;
  colorB?: string | null;
  children: ReactNode;
}) {
  const palette = SHARE_PALETTE[appearance];
  const a = colorA?.trim() || null;
  const b = colorB?.trim() || a;
  const cardFill =
    appearance === "light" ? "rgb(255 255 255 / 0.82)" : "rgb(23 25 29 / 0.82)";
  return (
    <div
      className="relative w-[540px] max-w-[540px] shrink-0 select-none overflow-hidden p-4 font-sans"
      style={{ background: palette.canvas, color: palette.fg }}
    >
      {a ? (
        <div
          aria-hidden
          className="share-atmosphere"
          data-appearance={appearance}
          style={{ "--atmosphere-a": a, "--atmosphere-b": b ?? a } as CSSProperties}
        >
          <span className="share-atmosphere__a" />
          <span className="share-atmosphere__b" />
          <span className="share-atmosphere__c" />
        </div>
      ) : null}
      <div
        className="relative z-[1] flex flex-col gap-5 rounded-[16px] px-5 py-5"
        style={{
          background: cardFill,
          border: `1px solid ${palette.border}`,
          boxShadow:
            appearance === "light"
              ? "0 1px 2px rgb(0 0 0 / 3%), 0 6px 20px rgb(0 0 0 / 4%)"
              : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
