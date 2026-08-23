import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { SentimentAssociationNote } from "@/components/sentiment/sentiment-association-note";
import type { PlayerSentimentProfile } from "@/sentiment/curated-types";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function polarityLabel(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function scoreLabel(score: number) {
  const pct = Math.round(((score + 1) / 2) * 100);
  return `${pct}%`;
}

function LaneRow({
  label,
  lane,
}: {
  label: string;
  lane: PlayerSentimentProfile["fan"];
}) {
  const topTopic = Object.entries(lane.topicBreakdown).sort(
    (a, b) => b[1] - a[1]
  )[0];
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-white/35 px-2 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn(type.caption, "font-semibold")}>{label}</p>
        <p className={cn(type.caption, "capitalize text-muted-foreground")}>
          {lane.direction}
        </p>
      </div>
      <p className={cn(type.caption, "tabular-nums")}>
        {polarityLabel(lane.polarity)} · {scoreLabel(lane.score)}
      </p>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {lane.mentionVolume.toLocaleString()} mentions ·{" "}
        {Math.round(lane.coverageConfidence * 100)}% coverage
      </p>
      {topTopic ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Top topic: {topTopic[0].replace(/_/g, " ")}
        </p>
      ) : null}
    </div>
  );
}

export function PlayerSentimentColumn({
  playerName,
  teamKey,
  profile,
  historicalBrand,
  honor,
}: {
  playerName: string;
  teamKey?: string | null;
  profile?: (PlayerSentimentProfile & { disclaimer: string }) | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const modernBrand = resolveTeamBrand(teamKey);
  const wash = brandAtmosphereColors(
    historicalBrand?.palette?.primary ?? modernBrand?.primary,
    historicalBrand?.palette?.secondary ?? modernBrand?.secondary
  );

  return (
    <GlassSurface
      accentColor={wash?.colorA}
      accentColorB={wash?.colorB}
      className="relative min-w-0 p-0"
      effect="css"
      honor={honor}
    >
      <div className="relative z-[1] flex w-full flex-col gap-2.5 px-3 py-2.5">
        <div>
          <p
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            Sentiment
          </p>
          <p className={cn(type.caption, "text-muted-foreground")}>
            Fan vs media · {profile?.window ?? "7d"} window
          </p>
        </div>

        {profile ? (
          <>
            <LaneRow label="Fan" lane={profile.fan} />
            <LaneRow label="Media" lane={profile.media} />
            {profile.association ? (
              <SentimentAssociationNote association={profile.association} />
            ) : null}
            <p className={cn(type.caption, "text-muted-foreground")}>
              {profile.disclaimer}
            </p>
          </>
        ) : (
          <p className={cn(type.caption, "text-muted-foreground")}>
            No sentiment coverage for {playerName} in the current prototype
            snapshot.
          </p>
        )}
      </div>
    </GlassSurface>
  );
}
