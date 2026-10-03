import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { SentimentAssociationNote } from "@/components/sentiment/sentiment-association-note";
import { LaneOriginTag } from "@/components/sentiment/sentiment-source";
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
  if (!lane) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-dashed border-border/60 px-2 py-1.5">
        <p className={cn(type.caption, "font-semibold")}>{label}</p>
        <p className={cn(type.caption, "text-muted-foreground")}>
          No source has enough coverage yet.
        </p>
      </div>
    );
  }
  const topTopic = Object.entries(lane.topicBreakdown).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const unit = lane.origin === "headlines" ? "headlines" : lane.origin === "reddit" ? "posts" : "mentions";
  const showDirection = lane.origin === "curated" || lane.origin == null || lane.priorScore != null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 frost-surface-soft px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className={cn(type.caption, "font-semibold")}>{label}</p>
        <LaneOriginTag lane={lane} />
      </div>
      <p className={cn(type.caption, "tabular-nums")}>
        {polarityLabel(lane.polarity)} · {scoreLabel(lane.score)}
        {showDirection ? <span className="capitalize text-muted-foreground"> · {lane.direction}</span> : null}
      </p>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {lane.mentionVolume.toLocaleString()} {unit} ·{" "}
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
            No sentiment coverage for {playerName} yet. Media tone appears once
            3 headlines name him in a week.
          </p>
        )}
      </div>
    </GlassSurface>
  );
}
