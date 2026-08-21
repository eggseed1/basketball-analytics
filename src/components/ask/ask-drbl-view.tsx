"use client";

import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import type { AskDrblResult } from "@/query-engine/types";
import {
  daySeed,
  pickAskExamples,
  type AskExample,
} from "@/query-engine/ask-examples";
import {
  askBuilderHref,
  composeAskBuilderQuery,
  defaultAskBuilderState,
  parseAskBuilderParams,
  validateAskBuilderState,
  type AskBuilderState,
  type AskInputMode,
} from "@/query-engine/ask-builder";
import {
  historyReturnHref,
  type AskContext,
} from "@/query-engine/ask-context";
import { AskBuilderForm } from "@/components/ask/ask-builder-form";
import {
  clearAskRecent,
  getAskRecentSnapshot,
  getServerAskRecent,
  pushAskRecent,
  subscribeAskRecent,
  type AskRecentEntry,
} from "@/components/ask/ask-recent-store";
import { QueryUpdatingChrome } from "@/components/continuity/query-nav";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import { AppLink } from "@/components/ui/app-link";
import {
  conceptIdForAskMetric,
  conceptIdForAskStatus,
} from "@/lib/learn-column-concepts";
import { assertInternalHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function askHrefWithContext(
  q: string,
  context: AskContext | null | undefined,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams();
  params.set("q", q);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  if (context?.season) params.set("season", context.season);
  if (context?.date) params.set("date", context.date);
  if (context?.source === "time_machine") params.set("from", "history");
  return `/ask?${params.toString()}`;
}

function statusMeta(status: AskDrblResult["status"]): {
  title: string;
  className: string;
} {
  switch (status) {
    case "ok":
      return { title: "OK", className: "border-border bg-secondary/30" };
    case "partial":
      return {
        title: "Partially supported",
        className: "border-amber-700/40 bg-amber-950/10",
      };
    case "ambiguous":
      return {
        title: "Ambiguous",
        className: "border-border bg-secondary/50",
      };
    case "unsupported":
      return {
        title: "Unsupported",
        className: "border-border bg-secondary/40",
      };
    case "invalid":
      return {
        title: "Invalid",
        className: "border-border bg-secondary/40",
      };
    case "no_result":
      return {
        title: "No result",
        className: "border-border bg-secondary/40",
      };
    case "insufficient_data":
      return {
        title: "Insufficient data",
        className: "border-border bg-secondary/40",
      };
    default:
      return { title: status, className: "border-border bg-secondary/40" };
  }
}

function AmbiguityPicker({
  result,
  askContext,
}: {
  result: AskDrblResult;
  askContext?: AskContext | null;
}) {
  const groups = result.ast.ambiguous ?? [];
  if (!groups.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-3">
      <h3 className="text-[16px] font-bold tracking-tight">
        Which player did you mean?
      </h3>
      <ul className="flex flex-col gap-2">
        {groups.flatMap((a) =>
          a.candidates.map((c) => (
            <li
              key={`${a.kind}-${c.id}`}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
            >
              {a.kind === "player" ? (
                <PlayerIdentity
                  playerId={c.id}
                  name={c.name}
                  teamLabel={c.subtitle}
                  variant="compact"
                  className="min-w-0 flex-1"
                  nameClassName="no-underline hover:underline"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[14px] font-bold tracking-tight">
                      {c.name}
                    </span>
                    {c.subtitle ? (
                      <span className="text-[12px] text-muted-foreground">
                        {c.subtitle}
                      </span>
                    ) : null}
                  </span>
                </PlayerIdentity>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-bold tracking-tight">
                    {c.name}
                  </span>
                  {c.subtitle ? (
                    <span className="text-[12px] text-muted-foreground">
                      {c.subtitle}
                    </span>
                  ) : null}
                </span>
              )}
              <AppLink
                href={askHrefWithContext(result.rawQuery, askContext, {
                  playerId: c.id,
                })}
                className="shrink-0 text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
              >
                Continue →
              </AppLink>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function QueryPlanDisclosure({ result }: { result: AskDrblResult }) {
  const rows = result.queryPlan;
  if (!rows?.length) return null;
  return (
    <details className="sports-card px-4 py-3 sm:px-5">
      <summary className="cursor-pointer text-[14px] font-bold tracking-tight">
        How did DRBL interpret this?
      </summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <dt className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              {row.label}
            </dt>
            <dd className="text-[14px] font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function StatusBanner({
  result,
  askContext,
}: {
  result: AskDrblResult;
  askContext?: AskContext | null;
}) {
  if (result.status === "ok") return null;
  const meta = statusMeta(result.status);
  const statusConcept = conceptIdForAskStatus(result.status);
  return (
    <section className={cn("rounded-md border px-4 py-3", meta.className)}>
      <h2 className="text-[16px] font-bold tracking-tight">
        {statusConcept ? (
          <MetricHelp conceptId={statusConcept} labelClassName="font-bold">
            {meta.title}
          </MetricHelp>
        ) : (
          meta.title
        )}
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-[14px] text-muted-foreground">
        {(result.errors ?? result.limitations ?? []).map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {result.status === "partial" && result.detailLines?.length ? (
        <ul className="mt-3 flex flex-col gap-1 text-[14px]">
          {result.detailLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {result.status === "ambiguous" ? (
        <AmbiguityPicker result={result} askContext={askContext} />
      ) : null}
    </section>
  );
}

function AskResultEntities({ result }: { result: AskDrblResult }) {
  const players = result.ast.entities.filter(
    (e): e is { kind: "player"; id: string; name?: string } =>
      e.kind === "player" && Boolean(e.id)
  );
  if (!players.length) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {players.map((p) => (
        <li key={p.id}>
          <PlayerIdentity
            playerId={p.id}
            name={p.name ?? p.id}
            variant="compact"
            nameClassName="text-[14px] font-semibold"
          />
        </li>
      ))}
    </ul>
  );
}

function AskMetricChip({ result }: { result: AskDrblResult }) {
  const metricId = result.ast.metricId;
  const conceptId = conceptIdForAskMetric(metricId);
  if (!conceptId || !metricId) return null;
  const label =
    metricId === "ts_pct"
      ? "TS%"
      : metricId === "efg_pct"
        ? "eFG%"
        : metricId === "usg_pct"
          ? "USG%"
          : metricId.replace(/_/g, " ").toUpperCase();
  return (
    <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      <MetricHelp conceptId={conceptId}>{label}</MetricHelp>
    </p>
  );
}

function formatRecentTime(at: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return "";
  }
}

function ExamplesList({
  examples,
  onPick,
  compact,
}: {
  examples: AskExample[];
  onPick: (prompt: string) => void;
  compact?: boolean;
}) {
  return (
    <ul className={cn("flex flex-col gap-1.5", compact && "gap-1")}>
      {examples.map((ex) => (
        <li key={ex.id}>
          <button
            type="button"
            onClick={() => onPick(ex.prompt)}
            className={cn(
              "text-left font-semibold underline-offset-2 hover:underline",
              compact ? "text-[14px]" : "text-[14px]"
            )}
          >
            {ex.prompt}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AskResultBlock({
  result,
  askContext,
}: {
  result: AskDrblResult;
  askContext?: AskContext | null;
}) {
  const quietInterpretation = result.interpretation.slice(0, 4);
  const seasons = result.ast.when?.seasons ?? [];
  const seasonSource = result.ast.seasonSource;
  const inferred =
    seasonSource === "time_machine" || seasonSource === "url";

  return (
    <div
      id="result"
      tabIndex={-1}
      className="flex scroll-mt-20 flex-col gap-4 outline-none"
    >
      <StatusBanner result={result} askContext={askContext} />

      {result.status === "ok" ? (
        <section
          aria-labelledby="ask-result-heading"
          className="sports-card flex flex-col gap-3 px-4 py-5 sm:px-5"
        >
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            Result
          </p>
          {seasons.length ? (
            <div className="rounded-md bg-secondary/40 px-3 py-2">
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                Interpreted as
              </p>
              <p className="mt-0.5 text-[14px] font-semibold tracking-tight">
                {result.rawQuery}
              </p>
              <p className="mt-1 text-[14px]">
                Season:{" "}
                <span className="font-bold">{seasons.join(" · ")}</span>
              </p>
              {inferred ? (
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {seasonSource === "time_machine"
                    ? "Season inferred from Time Machine context."
                    : "Season inferred from shareable ASK URL context."}
                </p>
              ) : null}
            </div>
          ) : null}
          <AskResultEntities result={result} />
          <AskMetricChip result={result} />
          {result.headline ? (
            <h2
              id="ask-result-heading"
              className="text-[18px] font-bold tracking-tight"
            >
              {result.headline}
            </h2>
          ) : (
            <h2 id="ask-result-heading" className="sr-only">
              ASK DRBL result
            </h2>
          )}
          {result.valueDisplay ? (
            <p className="text-[36px] font-bold tabular-nums tracking-tight sm:text-[44px]">
              {result.valueDisplay}
            </p>
          ) : null}
          {result.detailLines?.length ? (
            <ul className="flex flex-col gap-1.5 text-[14px] text-muted-foreground">
              {result.detailLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {quietInterpretation.length ? (
        <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            What DRBL understood
          </h2>
          <ul className="flex flex-col gap-1">
            {quietInterpretation.map((line) => (
              <li
                key={line}
                className="text-[16px] font-semibold tracking-tight"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <QueryPlanDisclosure result={result} />

      {(result.source || result.methodology?.length) && (
        <section className="sports-card flex flex-col gap-2 px-4 py-4 sm:px-5">
          {result.source ? (
            <p className="text-[14px]">
              <span className="font-bold">Source</span> · {result.source}
            </p>
          ) : null}
          {result.methodology?.length ? (
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                How is this calculated?
              </p>
              {result.methodology.map((m) => (
                <p key={m} className="text-[12px] text-muted-foreground">
                  {m}
                </p>
              ))}
            </div>
          ) : null}
          {result.limitations?.map((m) => (
            <p key={m} className="text-[12px] text-muted-foreground">
              Limitation: {m}
            </p>
          ))}
        </section>
      )}

      {result.links?.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            Explore further
          </h2>
          <div className="flex flex-wrap gap-3">
            {result.links.map((l) => (
              <AppLink
                key={l.href + l.label}
                href={l.href}
                className="rounded-md bg-foreground px-3 py-2 text-[14px] font-bold text-background"
              >
                {l.label}
              </AppLink>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function AskDrblView({
  initialQuery,
  result,
  initialMode = "natural",
  initialBuilder,
  exampleSeed,
  askContext = null,
}: {
  initialQuery: string;
  result: AskDrblResult | null;
  initialMode?: AskInputMode;
  initialBuilder?: AskBuilderState;
  exampleSeed?: string;
  askContext?: AskContext | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<AskInputMode>(initialMode);
  const [value, setValue] = useState(initialQuery);
  const [builder, setBuilder] = useState<AskBuilderState>(
    () => initialBuilder ?? defaultAskBuilderState()
  );
  /** Keep last successful result visible while the next query is in-flight. */
  const [staleResult, setStaleResult] = useState(result);
  useEffect(() => {
    if (result) setStaleResult(result);
  }, [result]);
  const displayResult = result ?? (pending ? staleResult : null);
  const recent = useSyncExternalStore(
    subscribeAskRecent,
    getAskRecentSnapshot,
    getServerAskRecent
  );
  const [examplesOpen, setExamplesOpen] = useState(!result);
  const resultRef = useRef<HTMLDivElement>(null);
  const hasResult = Boolean(displayResult);
  const lastPushedQuery = useRef<string | null>(null);

  const examples = useMemo(
    () => pickAskExamples(exampleSeed ?? daySeed(), 8),
    [exampleSeed]
  );

  const historyBack = historyReturnHref(askContext);
  const hasSeasonContext = Boolean(askContext?.season);

  useEffect(() => {
    if (!result?.rawQuery) return;
    const key = `${result.rawQuery}|${result.status}`;
    if (lastPushedQuery.current === key) return;
    lastPushedQuery.current = key;
    pushAskRecent({
      q: result.rawQuery,
      title: result.headline ?? result.interpretation[0] ?? result.rawQuery,
      status: result.status,
      at: Date.now(),
    });
  }, [result]);

  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => {
      setExamplesOpen(false);
      document.getElementById("result")?.focus({ preventScroll: true });
      document.getElementById("result")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 40);
    return () => window.clearTimeout(id);
  }, [result]);

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    startTransition(() => {
      router.push(
        assertInternalHref(`${askHrefWithContext(trimmed, askContext)}#result`)
      );
    });
  }

  function submitBuilder() {
    const v = validateAskBuilderState(builder);
    if (!v.ok) return;
    let href = askBuilderHref(builder, true);
    if (askContext?.source === "time_machine") {
      const u = new URL(href, "https://drbl.local");
      u.searchParams.set("from", "history");
      if (askContext.date) u.searchParams.set("date", askContext.date);
      // Builder season is authoritative in the composed query; keep URL season in sync.
      href = `${u.pathname}?${u.searchParams.toString()}`;
    }
    startTransition(() => {
      router.push(assertInternalHref(`${href}#result`));
    });
  }

  function clearContext() {
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    if (mode === "builder") {
      // Drop historical season from builder URL; keep other builder fields via full rebuild.
      const cleared = {
        ...builder,
        season: defaultAskBuilderState().season,
      };
      setBuilder(cleared);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(assertInternalHref(qs ? `/ask?${qs}` : "/ask"));
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(value);
  }

  return (
    <div
      className="relative flex flex-col gap-6"
      data-updating={pending ? "true" : "false"}
    >
      <QueryUpdatingChrome pending={pending} />
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          DRBL · Analytical search
        </p>
        <h1 className="text-[32px] font-bold tracking-tight sm:text-[40px]">
          <MetricHelp
            conceptId="ask_drbl"
            labelClassName="font-bold tracking-tight"
          >
            ASK DRBL
          </MetricHelp>
        </h1>
        <p className="max-w-2xl text-[16px] text-muted-foreground">
          {hasResult
            ? "Ask another question, or refine with the structured builder."
            : "Natural language or a guided builder - both use the same trusted query engine. Not a chatbot."}
        </p>
      </header>

      {hasSeasonContext ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2.5"
          role="status"
        >
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Historical context
            </p>
            <p className="text-[16px] font-bold tracking-tight">
              {askContext!.season}
              {askContext?.source === "time_machine"
                ? " · Time Machine"
                : ""}
            </p>
            {askContext?.date ? (
              <p className="text-[12px] text-muted-foreground">
                Date on file: {askContext.date} (not applied to season-level
                ASK)
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {historyBack ? (
              <AppLink
                href={historyBack}
                className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
              >
                Back to {askContext!.season} Time Machine
              </AppLink>
            ) : null}
            <button
              type="button"
              onClick={clearContext}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-[12px] font-semibold"
            >
              × Clear context
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="inline-flex w-fit rounded-md border border-border bg-secondary/30 p-0.5"
        role="tablist"
        aria-label="ASK input mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "natural"}
          onClick={() => setMode("natural")}
          className={cn(
            "rounded px-3 py-1.5 text-[12px] font-bold",
            mode === "natural"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          Ask naturally
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "builder"}
          onClick={() => setMode("builder")}
          className={cn(
            "rounded px-3 py-1.5 text-[12px] font-bold",
            mode === "builder"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          Build a query
        </button>
      </div>

      {mode === "natural" ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="sr-only" htmlFor="ask-drbl-input">
            Ask DRBL
          </label>
          <textarea
            id="ask-drbl-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={hasResult ? 2 : 3}
            placeholder="Ask a basketball analytics question…"
            className="w-full resize-y rounded-md border border-border bg-background px-4 py-3 text-[16px] font-medium outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending || !value.trim()}
              className="rounded-md bg-foreground px-4 py-2.5 text-[14px] font-bold text-background disabled:opacity-50"
            >
              {pending ? "Running…" : hasResult ? "Ask another" : "Run query"}
            </button>
            <p className="text-[12px] text-muted-foreground">
              Results are shareable via the URL.
            </p>
          </div>
        </form>
      ) : (
        <AskBuilderForm
          state={builder}
          onChange={setBuilder}
          onSubmit={submitBuilder}
          pending={pending}
        />
      )}

      {hasResult && displayResult ? (
        <div
          ref={resultRef}
          className={cn(
            "query-updating-content",
            pending && "opacity-70"
          )}
          data-updating={pending ? "true" : "false"}
        >
          {pending ? (
            <p className="mb-2 text-[12px] font-semibold text-muted-foreground">
              Updating…
            </p>
          ) : null}
          <AskResultBlock result={displayResult} askContext={askContext} />
        </div>
      ) : null}

      {!hasResult ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              Try asking
            </h2>
            <ExamplesList examples={examples} onPick={submit} />
          </section>

          {recent.length ? (
            <RecentSection
              recent={recent}
              onPick={submit}
              onClear={clearAskRecent}
            />
          ) : null}
        </>
      ) : (
        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              Try another question
            </h2>
            <button
              type="button"
              onClick={() => setExamplesOpen((v) => !v)}
              className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              {examplesOpen ? "Hide" : "Show examples"}
            </button>
          </div>
          {examplesOpen ? (
            <ExamplesList examples={examples} onPick={submit} compact />
          ) : null}
          {recent.length ? (
            <RecentSection
              recent={recent}
              onPick={submit}
              onClear={clearAskRecent}
              compact
            />
          ) : null}
        </section>
      )}
    </div>
  );
}

function RecentSection({
  recent,
  onPick,
  onClear,
  compact,
}: {
  recent: AskRecentEntry[];
  onPick: (q: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          Recent
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {recent.map((entry) => (
          <li key={`${entry.q}-${entry.at}`}>
            <button
              type="button"
              onClick={() => onPick(entry.q)}
              className={cn(
                "flex w-full flex-col items-start rounded-md bg-secondary/50 px-2.5 py-1.5 text-left",
                compact && "py-1"
              )}
            >
              <span className="text-[14px] font-semibold">
                {entry.title.length > 64
                  ? `${entry.title.slice(0, 64)}…`
                  : entry.title}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {entry.status ? `${entry.status} · ` : ""}
                {formatRecentTime(entry.at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Re-export for tests / URL parsing on the page. */
export { parseAskBuilderParams, composeAskBuilderQuery };
