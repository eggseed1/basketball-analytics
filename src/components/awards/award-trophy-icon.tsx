import type { ReactNode } from "react";

import type { AwardTrophyId } from "@/content/awards/catalog";
import { cn } from "@/lib/utils";

type TrophyProps = {
  className?: string;
  title?: string;
};

/**
 * Fixed optical frame so every award glyph shares the same footprint.
 * Artwork stays inside the inner 28×28 of a 40×40 viewBox.
 */
function SvgShell({
  className,
  title,
  children,
}: TrophyProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={40}
      height={40}
      className={cn("block size-full shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Unique-ish gradient id per mount via title hash — keep simple fixed ids + trophy suffix. */
function gid(base: string, trophy: string) {
  return `${base}-${trophy}`;
}

/** Larry O’Brien — gold cup with basketball (championship). */
export function LarryObrienTrophy({ className, title }: TrophyProps) {
  const g = gid("aw", "lob");
  return (
    <SvgShell className={className} title={title}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7e7a3" />
          <stop offset="45%" stopColor="#e0b23a" />
          <stop offset="100%" stopColor="#9a7014" />
        </linearGradient>
      </defs>
      <path
        d="M13 7.5h14v3.2c0 5.4-2.6 9-7 10.6-4.4-1.6-7-5.2-7-10.6V7.5z"
        fill={`url(#${g})`}
      />
      <path
        d="M13 9.8c-2.4.2-4 1.8-4 4.2 0 2.2 1.2 3.6 3.2 4.2"
        fill="none"
        stroke="#c49212"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M27 9.8c2.4.2 4 1.8 4 4.2 0 2.2-1.2 3.6-3.2 4.2"
        fill="none"
        stroke="#c49212"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="18.2" y="21" width="3.6" height="4.8" rx="0.6" fill="#b8860b" />
      <rect x="14" y="25.6" width="12" height="2" rx="0.7" fill="#8a6a10" />
      <rect x="11.5" y="29.2" width="17" height="4.2" rx="1" fill="#6b5420" />
      <circle cx="20" cy="13.6" r="4" fill="#c45c26" stroke="#8a3a12" strokeWidth="0.7" />
      <path
        d="M17.2 12.2c.9 1.8 2.2 2.8 3.8 3.1M20 9.7v7.8"
        fill="none"
        stroke="#8a3a12"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      <text
        x="20"
        y="32.2"
        textAnchor="middle"
        fill="#f5e6a8"
        fontSize="3.6"
        fontWeight="700"
        fontFamily="system-ui,sans-serif"
      >
        NBA
      </text>
    </SvgShell>
  );
}

/** Michael Jordan Trophy — regular-season MVP. */
export function MichaelJordanTrophy({ className, title }: TrophyProps) {
  const g = gid("aw", "mj");
  return (
    <SvgShell className={className} title={title}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d78c" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      <rect x="10" y="30.5" width="20" height="3.5" rx="0.7" fill="#6b5420" />
      <rect x="14.5" y="25.5" width="11" height="5.2" rx="0.5" fill={`url(#${g})`} />
      <circle cx="20" cy="9" r="2.5" fill="#1a1a1a" />
      <path
        d="M20 12c1.8 0 3 1.2 3 2.8v5c0 1-.8 1.8-1.7 2L20 22.6l-1.3-.8c-.9-.2-1.7-1-1.7-2v-5c0-1.6 1.2-2.8 3-2.8z"
        fill="#1a1a1a"
      />
      <path
        d="M13.5 16h3.4M23.1 16h3.4"
        stroke={`url(#${g})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text
        x="20"
        y="33"
        textAnchor="middle"
        fill="#f5e6a8"
        fontSize="4.2"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.4"
      >
        MVP
      </text>
    </SvgShell>
  );
}

/** Bill Russell Trophy — Finals MVP (silver). */
export function BillRussellTrophy({ className, title }: TrophyProps) {
  const g = gid("aw", "br");
  return (
    <SvgShell className={className} title={title}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4f5f7" />
          <stop offset="100%" stopColor="#8a9099" />
        </linearGradient>
      </defs>
      <rect x="10" y="30.5" width="20" height="3.5" rx="0.7" fill="#4a5560" />
      <rect x="15" y="25.2" width="10" height="5.5" rx="0.5" fill={`url(#${g})`} />
      <circle cx="20" cy="9.2" r="2.5" fill="#2d3740" />
      <path
        d="M15 13c0-1.9 2.2-3.2 5-3.2s5 1.3 5 3.2v6.4c0 1.3-2.2 2.2-5 2.2s-5-.9-5-2.2V13z"
        fill={`url(#${g})`}
      />
      <path
        d="M12 16h3.2M24.8 16H28"
        stroke="#6b7280"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <text
        x="20"
        y="33"
        textAnchor="middle"
        fill="#e8ecf0"
        fontSize="3.4"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.2"
      >
        FMVP
      </text>
    </SvgShell>
  );
}

/** Hakeem Olajuwon Trophy — DPOY shield. */
export function OlajuwonTrophy({ className, title }: TrophyProps) {
  const g = gid("aw", "dpoy");
  return (
    <SvgShell className={className} title={title}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ec5ff" />
          <stop offset="100%" stopColor="#1e4d8c" />
        </linearGradient>
      </defs>
      <path
        d="M20 5.5l11.5 4.4v9.8c0 6.4-4.5 11.5-11.5 14-7-2.5-11.5-7.6-11.5-14V9.9L20 5.5z"
        fill={`url(#${g})`}
        stroke="#0f2f5c"
        strokeWidth="0.8"
      />
      <text
        x="20"
        y="23"
        textAnchor="middle"
        fill="#e8f1ff"
        fontSize="11"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
      >
        D
      </text>
    </SvgShell>
  );
}

/** Rookie of the Year — tip-off ball on pedestal. */
export function TipOffTrophy({ className, title }: TrophyProps) {
  const g = gid("aw", "roy");
  return (
    <SvgShell className={className} title={title}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d78c" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      <rect x="11.5" y="29.5" width="17" height="4.2" rx="1" fill="#6b5420" />
      <rect x="15.8" y="22.5" width="8.4" height="7.2" rx="0.6" fill={`url(#${g})`} />
      <circle cx="20" cy="13.5" r="6.6" fill="#c45c26" stroke="#8a3a12" strokeWidth="0.85" />
      <path
        d="M15 11.6c1.7 2.8 3.9 4.3 7.1 4.7M20 7.2v12.6M15.5 17.2c2.2.9 4.8.9 7 0"
        fill="none"
        stroke="#8a3a12"
        strokeWidth="0.75"
        strokeLinecap="round"
      />
      <text
        x="20"
        y="32.5"
        textAnchor="middle"
        fill="#f5e6a8"
        fontSize="3.6"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.3"
      >
        ROY
      </text>
    </SvgShell>
  );
}

/** All-NBA — circular league medallion with label. */
export function AllNbaBadgeIcon({ className, title }: TrophyProps) {
  return (
    <SvgShell className={className} title={title}>
      <circle cx="20" cy="20" r="14" fill="#1a1a2e" stroke="#d4a017" strokeWidth="2" />
      <circle cx="20" cy="20" r="10.8" fill="none" stroke="#f5e6a8" strokeWidth="0.7" />
      <text
        x="20"
        y="17.2"
        textAnchor="middle"
        fill="#f5e6a8"
        fontSize="5.5"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.6"
      >
        ALL
      </text>
      <text
        x="20"
        y="24.5"
        textAnchor="middle"
        fill="#d4a017"
        fontSize="6.2"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.4"
      >
        NBA
      </text>
    </SvgShell>
  );
}

/** All-Defense — defensive shield with label. */
export function AllDefenseBadgeIcon({ className, title }: TrophyProps) {
  return (
    <SvgShell className={className} title={title}>
      <path
        d="M20 5.8l12.5 5.2v9c0 6.6-4.6 12-12.5 14.6C11.1 32 6.5 26.6 6.5 20V11l13.5-5.2z"
        fill="#1e3a5f"
        stroke="#7eb6ff"
        strokeWidth="1.5"
      />
      <text
        x="20"
        y="17"
        textAnchor="middle"
        fill="#9ec5ff"
        fontSize="5"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.5"
      >
        ALL
      </text>
      <text
        x="20"
        y="24.5"
        textAnchor="middle"
        fill="#e8f1ff"
        fontSize="5.2"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.2"
      >
        DEF
      </text>
    </SvgShell>
  );
}

/** All-Star — star in a gold ring. */
export function AllStarBadgeIcon({ className, title }: TrophyProps) {
  const g = gid("aw", "as");
  return (
    <SvgShell className={className} title={title}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#d4a017" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="14" fill="#1a1a2e" stroke="#d4a017" strokeWidth="1.8" />
      <path
        d="M20 9.2l2.7 6.4 6.9.6-5.2 4.7 1.6 6.6L20 24.2l-6 3.3 1.6-6.6-5.2-4.7 6.9-.6z"
        fill={`url(#${g})`}
        stroke="#b8860b"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
    </SvgShell>
  );
}

/** Hall of Fame — Naismith plaque. */
export function HallOfFameBadgeIcon({ className, title }: TrophyProps) {
  return (
    <SvgShell className={className} title={title}>
      <rect
        x="7.5"
        y="8.5"
        width="25"
        height="23"
        rx="2.2"
        fill="#3d2b1f"
        stroke="#d4a017"
        strokeWidth="1.4"
      />
      <rect x="10.5" y="11.5" width="19" height="2" rx="0.5" fill="#d4a017" />
      <text
        x="20"
        y="24"
        textAnchor="middle"
        fill="#d4a017"
        fontSize="7.5"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
        letterSpacing="0.8"
      >
        HOF
      </text>
    </SvgShell>
  );
}

export function AwardTrophyIcon({
  trophy,
  className,
  title,
}: {
  trophy: AwardTrophyId;
  className?: string;
  title?: string;
}) {
  switch (trophy) {
    case "larry-obrien":
      return <LarryObrienTrophy className={className} title={title} />;
    case "michael-jordan":
      return <MichaelJordanTrophy className={className} title={title} />;
    case "bill-russell":
      return <BillRussellTrophy className={className} title={title} />;
    case "olajuwon":
      return <OlajuwonTrophy className={className} title={title} />;
    case "tip-off":
      return <TipOffTrophy className={className} title={title} />;
    case "all-nba":
      return <AllNbaBadgeIcon className={className} title={title} />;
    case "all-defense":
      return <AllDefenseBadgeIcon className={className} title={title} />;
    case "all-star":
      return <AllStarBadgeIcon className={className} title={title} />;
    case "hof":
      return <HallOfFameBadgeIcon className={className} title={title} />;
    default:
      return null;
  }
}
