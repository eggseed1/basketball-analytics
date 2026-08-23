import { SentimentAssociationNote } from "@/components/sentiment/sentiment-association-note";
import type { CuratedSentimentLane, SentimentProfileProvenance } from "@/sentiment/curated-types";
import type { SentimentPolarity } from "@/sentiment/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function provenanceLabel(provenance?: SentimentProfileProvenance): string | null {
  switch (provenance) {
    case "hand_crafted":
      return "Curated profile";
    case "observation":
      return "Observation-backed";
    case "generated":
      return "Pilot sample";
    default:
      return null;
  }
}

function SentimentProvenanceBadge({
  provenance,
}: {
  provenance?: SentimentProfileProvenance;
}) {
  const label = provenanceLabel(provenance);
  if (!label) return null;
  return (
    <span
      className={cn(
        type.caption,
        "inline-flex w-fit rounded-full border border-border/60 bg-white/40 px-2 py-0.5 text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

function polarityColor(polarity: SentimentPolarity): string {
  switch (polarity) {
    case "positive":
      return "rgb(34 197 94)";
    case "negative":
      return "rgb(239 68 68)";
    case "mixed":
      return "rgb(245 158 11)";
    default:
      return "rgb(148 163 184)";
  }
}

function polarityLabel(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function scoreLabel(score: number) {
  const pct = Math.round(((score + 1) / 2) * 100);
  return `${pct}%`;
}

function scoreMarkerLeft(score: number) {
  const t = Math.max(0, Math.min(1, (score + 1) / 2));
  return `calc(8px + (100% - 16px) * ${t})`;
}

function SentimentLaneChart({
  label,
  lane,
  topicLimit = 2,
}: {
  label: string;
  lane: CuratedSentimentLane;
  topicLimit?: number;
}) {
  const color = polarityColor(lane.polarity);
  const topTopics = Object.entries(lane.topicBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topicLimit);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-white/35 px-2 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn(type.caption, "font-semibold")}>{label}</p>
        <p className={cn(type.caption, "capitalize text-muted-foreground")}>
          {lane.direction}
        </p>
      </div>

      <div className="relative mt-1 h-7">
        <div
          className="absolute inset-x-2 top-1/2 h-2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(239,68,68,0.22) 0%, rgba(148,163,184,0.18) 50%, rgba(34,197,94,0.22) 100%)",
          }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/25"
          style={{ left: "50%" }}
          aria-hidden
        />
        <div
          className="absolute top-1/2 z-[1] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-sm"
          style={{ left: scoreMarkerLeft(lane.score), backgroundColor: color }}
          aria-hidden
        />
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className={cn(type.caption, "font-medium")}>
          {polarityLabel(lane.polarity)}
        </span>
        <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {scoreLabel(lane.score)}
        </span>
      </div>

      <p className={cn(type.caption, "text-muted-foreground")}>
        {lane.mentionVolume.toLocaleString()} mentions ·{" "}
        {Math.round(lane.coverageConfidence * 100)}% coverage
      </p>

      {topTopics.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {topTopics.map(([topic, share]) => (
            <li key={topic}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn(type.caption, "truncate text-muted-foreground")}>
                  {topic.replace(/_/g, " ")}
                </span>
                <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
                  {Math.round(share * 100)}%
                </span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-foreground/[0.08]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(share * 100)}%`,
                    backgroundColor: color,
                    opacity: 0.65,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Fan vs media sentiment lanes — compact or detailed topic breakdown. */
export function PlayerSentimentGraph({
  playerName,
  profile,
  detailed = false,
}: {
  playerName: string;
  profile?: {
    window: string;
    provenance?: SentimentProfileProvenance;
    fan: CuratedSentimentLane;
    media: CuratedSentimentLane;
    association?: {
      explanation: string;
      eventKind?: string;
      eventRef?: string;
    };
    disclaimer: string;
  } | null;
  detailed?: boolean;
}) {
  if (!profile) {
    if (detailed) return null;
    return (
      <p className={cn(type.caption, "text-muted-foreground")}>
        No sentiment coverage for {playerName} in the current prototype snapshot.
      </p>
    );
  }

  const topicLimit = detailed ? 5 : 2;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className={cn(type.caption, "text-muted-foreground")}>
          Fan vs media · {profile.window} window
        </p>
        <SentimentProvenanceBadge provenance={profile.provenance} />
      </div>
      <div className={cn(detailed && "grid gap-3 sm:grid-cols-2")}>
        <SentimentLaneChart label="Fan" lane={profile.fan} topicLimit={topicLimit} />
        <SentimentLaneChart label="Media" lane={profile.media} topicLimit={topicLimit} />
      </div>
      {profile.association ? (
        <SentimentAssociationNote association={profile.association} />
      ) : null}
      {!detailed ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {profile.disclaimer}
        </p>
      ) : null}
    </div>
  );
}
