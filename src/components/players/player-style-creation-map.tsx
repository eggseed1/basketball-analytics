import { type } from "@/lib/design-system";
import type { StylePeerDot } from "@/lib/player-style-story";
import { cn } from "@/lib/utils";

const W = 420;
const H = 280;
const PAD = { l: 44, r: 16, t: 18, b: 36 };

function xScale(usg: number): number {
  const lo = 0.08;
  const hi = 0.4;
  const t = Math.max(0, Math.min(1, (usg - lo) / (hi - lo)));
  return PAD.l + t * (W - PAD.l - PAD.r);
}

function yScale(ast: number): number {
  const lo = 0.02;
  const hi = 0.5;
  const t = Math.max(0, Math.min(1, (ast - lo) / (hi - lo)));
  // Higher assist rate toward the top.
  return PAD.t + (1 - t) * (H - PAD.t - PAD.b);
}

/**
 * Usage × assist scatter with region labels so the style reads as a place
 * on the creation plane, not just a phrase.
 */
export function PlayerStyleCreationMap({
  usagePct,
  assistPct,
  peers,
  accent = "var(--foreground)",
  className,
}: {
  usagePct: number;
  assistPct: number;
  peers: StylePeerDot[];
  accent?: string;
  className?: string;
}) {
  const px = xScale(usagePct);
  const py = yScale(assistPct);

  const regions: Array<{
    label: string;
    x: number;
    y: number;
  }> = [
    { label: "Engine", x: xScale(0.32), y: yScale(0.38) },
    { label: "Volume", x: xScale(0.33), y: yScale(0.1) },
    { label: "Secondary", x: xScale(0.22), y: yScale(0.26) },
    { label: "Spacer", x: xScale(0.14), y: yScale(0.08) },
    { label: "Connector", x: xScale(0.14), y: yScale(0.24) },
  ];

  return (
    <figure className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <figcaption className={cn(type.caption, "font-semibold text-foreground")}>
        Creation map
      </figcaption>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Usage across, assist rate up. Faint dots are peers (20+ games).
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-full"
        role="img"
        aria-label={`Creation map: usage ${Math.round(usagePct * 100)} percent, assist rate ${Math.round(assistPct * 100)} percent`}
      >
        {/* Soft region washes */}
        <rect
          x={xScale(0.26)}
          y={yScale(0.5)}
          width={xScale(0.4) - xScale(0.26)}
          height={yScale(0.22) - yScale(0.5)}
          fill="currentColor"
          opacity={0.04}
        />
        <rect
          x={xScale(0.26)}
          y={yScale(0.2)}
          width={xScale(0.4) - xScale(0.26)}
          height={yScale(0.02) - yScale(0.2)}
          fill="currentColor"
          opacity={0.03}
        />

        {/* Grid */}
        {[0.15, 0.22, 0.3].map((u) => (
          <line
            key={`u-${u}`}
            x1={xScale(u)}
            x2={xScale(u)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        ))}
        {[0.12, 0.22, 0.35].map((a) => (
          <line
            key={`a-${a}`}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={yScale(a)}
            y2={yScale(a)}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        ))}

        {regions.map((r) => (
          <text
            key={r.label}
            x={r.x}
            y={r.y}
            textAnchor="middle"
            className="fill-current"
            opacity={0.28}
            fontSize={10}
            fontWeight={600}
          >
            {r.label}
          </text>
        ))}

        {peers.map((peer) => (
          <circle
            key={peer.playerId}
            cx={xScale(peer.usagePct)}
            cy={yScale(peer.assistPct)}
            r={2.2}
            fill="currentColor"
            opacity={0.14}
          />
        ))}

        <circle
          cx={px}
          cy={py}
          r={7}
          fill={accent}
          stroke="var(--background)"
          strokeWidth={2.5}
        />
        <circle cx={px} cy={py} r={2.5} fill="var(--background)" />

        <text
          x={(PAD.l + W - PAD.r) / 2}
          y={H - 10}
          textAnchor="middle"
          className="fill-current"
          opacity={0.55}
          fontSize={10}
        >
          Usage →
        </text>
        <text
          x={14}
          y={(PAD.t + H - PAD.b) / 2}
          textAnchor="middle"
          className="fill-current"
          opacity={0.55}
          fontSize={10}
          transform={`rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})`}
        >
          Assist rate →
        </text>
      </svg>
    </figure>
  );
}
