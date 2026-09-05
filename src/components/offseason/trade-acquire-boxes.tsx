"use client";

import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamIdentity } from "@/components/teams/team-identity";
import type { TradeAcquirePresentation, TradeAcquireSide } from "@/lib/trade-acquire-presentation";
import { brandWashColor } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";
import type { ParsedTradeAsset } from "@/lib/trade-tree-parse";
import { canLinkTransactionPlayer } from "@/lib/transaction-player-link";
import type { TransactionPlayerResolution } from "@/lib/transaction-player-resolution";
import { cn } from "@/lib/utils";

function resolutionForAsset(
  asset: ParsedTradeAsset,
  resolutions: TransactionPlayerResolution[] | undefined
): TransactionPlayerResolution | undefined {
  if (asset.kind !== "player" || !resolutions?.length) return undefined;
  const key = asset.matchKey;
  return resolutions.find((r) => {
    const mention = normalizePlayerName(r.mention.rawName);
    const resolved = r.playerName ? normalizePlayerName(r.playerName) : "";
    return mention === key || resolved === key;
  });
}

function AssetLine({
  asset,
  resolutions,
}: {
  asset: ParsedTradeAsset;
  resolutions?: TransactionPlayerResolution[];
}) {
  if (asset.kind !== "player") {
    return (
      <li className="text-[13px] leading-snug text-foreground">{asset.label}</li>
    );
  }

  const r = resolutionForAsset(asset, resolutions);
  const name = r?.playerName ?? asset.label;
  const played =
    r?.status === "resolved" &&
    canLinkTransactionPlayer(r.playerId) &&
    Boolean(r.playerId);

  if (!r) {
    return (
      <li className="text-[13px] leading-snug font-semibold text-foreground">
        {name}
      </li>
    );
  }

  return (
    <li className="text-[13px] leading-snug">
      <PlayerIdentity
        playerId={r.playerId ?? undefined}
        name={name}
        teamKey={r.teamKey}
        teamLabel={r.teamKey}
        href={r.href ?? undefined}
        hasPlayedNba={played}
        variant="compact"
        className="inline-flex max-w-none align-baseline"
        nameClassName="inline font-semibold"
      >
        {name}
      </PlayerIdentity>
    </li>
  );
}

function AcquireBox({
  side,
  resolutions,
  compact,
}: {
  side: TradeAcquireSide;
  resolutions?: TransactionPlayerResolution[];
  compact?: boolean;
}) {
  const brand =
    resolveTeamBrand(side.teamId) ?? resolveTeamBrand(side.teamAbbr);
  const wash = brandWashColor(brand);
  const primary = brand?.primary ?? wash;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border/70 bg-background shadow-sm",
        compact ? "min-w-0" : "min-w-0"
      )}
      style={{
        backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${wash} 14%, transparent), transparent 72%)`,
      }}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 text-white"
        style={{ backgroundColor: primary }}
      >
        <TeamIdentity
          teamKey={side.teamId}
          label={side.teamAbbr}
          className="inline-flex shrink-0"
          nameClassName="no-underline hover:no-underline"
        >
          <TeamLogo teamKey={brand?.abbr ?? side.teamAbbr} size="2xs" />
        </TeamIdentity>
        <TeamIdentity
          teamKey={side.teamId}
          label={side.teamAbbr}
          className="inline-flex min-w-0"
          nameClassName="text-[11px] font-bold uppercase tracking-wide text-white no-underline hover:no-underline decoration-transparent"
        />
        <span className="text-[11px] font-bold uppercase tracking-wide opacity-95">
          acquires:
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 px-2.5 py-2">
        {side.assets.length ? (
          side.assets.map((asset) => (
            <AssetLine
              key={`${asset.kind}:${asset.matchKey}`}
              asset={asset}
              resolutions={resolutions}
            />
          ))
        ) : (
          <li className="text-[12px] text-muted-foreground">
            Not listed in this source note
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * One trade-related transaction shown as two stacked team acquire boxes.
 */
export function TradeAcquireBoxes({
  presentation,
  resolutions,
  compact,
  className,
}: {
  presentation: TradeAcquirePresentation;
  resolutions?: TransactionPlayerResolution[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mt-2 flex flex-col gap-2", className)}>
      {presentation.sides.map((side) => (
        <AcquireBox
          key={side.teamId}
          side={side}
          resolutions={resolutions}
          compact={compact}
        />
      ))}
    </div>
  );
}
