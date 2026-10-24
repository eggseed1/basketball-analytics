/**
 * Favicon / apple-touch mark for ImageResponse.
 * Same court-arc idea as DrblLogo, drawn for 16–32 px survival:
 * one strong arc, clear spine, oversized ball — no nested tile chrome.
 *
 * Paths are optically centered in the 32×32 viewBox (L-shaped mass sits
 * slightly high-left geometrically; +1.4,+1.8 shifts it into the tile).
 */
export const DRBL_ICON_BG = "#111114";
export const DRBL_ICON_ARC = "#7EB0FF";
export const DRBL_ICON_SPINE = "#F4F4F5";
export const DRBL_ICON_BALL = "#C8102E";

/** Inline SVG for next/og ImageResponse (no CSS classes). */
export function DrblIconMarkSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <g transform="translate(1.4 1.8)">
        <path
          d="M8.5 6.25c8.35 0 15.1 6.75 15.1 15.1"
          stroke={DRBL_ICON_ARC}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M8.5 6.25v15.1"
          stroke={DRBL_ICON_SPINE}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <circle cx="23.1" cy="20.85" r="3.55" fill={DRBL_ICON_BALL} />
        <circle
          cx="23.1"
          cy="20.85"
          r="3.55"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}
