import {
  TONE_EVAL_SETS,
  toneEvalTotal,
  type ToneEvalCounts,
  type ToneEvalRater,
} from "@/sentiment/tone-eval";

import { cn } from "@/lib/utils";

const RATER_LABEL: Record<ToneEvalRater, string> = {
  model: "Language model",
  wordList: "Word list",
};

const SEGMENTS = [
  { key: "match", label: "Same as the label", color: "var(--data-positive)" },
  { key: "offByOne", label: "One step off", color: "color-mix(in oklab, var(--foreground) 22%, transparent)" },
  { key: "opposite", label: "Opposite side", color: "var(--data-negative)" },
] as const satisfies readonly { key: keyof ToneEvalCounts; label: string; color: string }[];

function Bar({ rater, counts, unit }: { rater: ToneEvalRater; counts: ToneEvalCounts; unit: string }) {
  const total = toneEvalTotal(counts);
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_7.5rem] sm:grid-cols-[7rem_minmax(0,1fr)_9.5rem] items-center gap-2">
      <span className={cn(rater === "model" ? "font-semibold text-foreground" : "")}>{RATER_LABEL[rater]}</span>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-foreground/[0.06]"
        role="img"
        aria-label={`${RATER_LABEL[rater]}: ${counts.match} of ${total} ${unit} matched the label, ${counts.offByOne} were one step off and ${counts.opposite} were on the opposite side.`}
      >
        {SEGMENTS.map((s) =>
          counts[s.key] ? (
            <span
              key={s.key}
              className="h-full"
              style={{ width: `${pct(counts[s.key])}%`, background: s.color }}
              title={`${s.label}: ${counts[s.key]} of ${total}`}
            />
          ) : null
        )}
      </div>
      <span className="tabular-nums">
        <span className="font-semibold text-foreground">{Math.round(pct(counts.match))}%</span> match
        <span className={cn("ml-1.5", counts.opposite ? "text-negative" : "")}>
          {counts.opposite} opp<span className="hidden sm:inline">osite</span>
          <span className="sm:hidden">.</span>
        </span>
      </span>
    </div>
  );
}

/** How often each tone rater agrees with hand labels, per kind of text. */
export function ToneAgreementChart() {
  return (
    <figure className="flex flex-col gap-3 rounded-md border border-border/70 p-3">
      <figcaption className="flex flex-col gap-1">
        <span className="font-semibold text-foreground">How often the tone rating matches a hand label</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      {TONE_EVAL_SETS.map((set) => (
        <div key={set.id} className="flex flex-col gap-1.5">
          <p>
            <span className="font-semibold text-foreground">{set.label}</span>{" "}
            <span className="tabular-nums">
              {toneEvalTotal(set.raters.model).toLocaleString()} {set.unit}
            </span>
          </p>
          <Bar rater="model" counts={set.raters.model} unit={set.unit} />
          <Bar rater="wordList" counts={set.raters.wordList} unit={set.unit} />
        </div>
      ))}
      <p>
        A coding agent labeled each one positive, neutral or negative toward one named player, not a
        human panel. One step off means a neutral rating where the label picked a side, or the
        reverse. The headline set leaves out the half used to tune the word list.
      </p>
    </figure>
  );
}
