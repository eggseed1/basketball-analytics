"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import type { AskDrblResult } from "@/query-engine/types";
import { ASK_DRBL_EXAMPLE_PROMPTS } from "@/query-engine/types";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { cn } from "@/lib/utils";

const RECENT_KEY = "ask-drbl-recent-v1.1";

type RecentEntry = {
  q: string;
  title: string;
  status?: string;
  at: number;
};

function loadRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  if (typeof window === "undefined") return;
  const next = [
    entry,
    ...loadRecent().filter((x) => x.q !== entry.q),
  ].slice(0, 8);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function clearRecent() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RECENT_KEY);
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

function AmbiguityPicker({ result }: { result: AskDrblResult }) {
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
            <li key={`${a.kind}-${c.id}`}>
              <Link
                href={`/ask?q=${encodeURIComponent(result.rawQuery)}&playerId=${encodeURIComponent(c.id)}`}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-secondary/60"
              >
                {a.kind === "player" ? (
                  <PlayerHeadshot
                    playerId={c.id}
                    espnId={c.id}
                    name={c.name}
                    size="sm"
                  />
                ) : null}
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
                <span className="ml-auto text-[12px] font-semibold text-muted-foreground">
                  Continue →
                </span>
              </Link>
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
      <summary className="cursor-pointer text-[13px] font-bold tracking-tight">
        How did DRBL interpret this?
      </summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {row.label}
            </dt>
            <dd className="text-[14px] font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function StatusBanner({ result }: { result: AskDrblResult }) {
  if (result.status === "ok") return null;
  const meta = statusMeta(result.status);
  return (
    <section
      className={cn("rounded-md border px-4 py-3", meta.className)}
    >
      <h2 className="text-[15px] font-bold tracking-tight">{meta.title}</h2>
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
      {result.status === "ambiguous" ? <AmbiguityPicker result={result} /> : null}
    </section>
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

export function AskDrblView({
  initialQuery,
  result,
}: {
  initialQuery: string;
  result: AskDrblResult | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initialQuery);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, [result?.rawQuery, result?.status]);

  useEffect(() => {
    if (!result?.rawQuery) return;
    pushRecent({
      q: result.rawQuery,
      title: result.headline ?? result.interpretation[0] ?? result.rawQuery,
      status: result.status,
      at: Date.now(),
    });
    setRecent(loadRecent());
  }, [result]);

  const quietInterpretation = useMemo(() => {
    if (!result) return [];
    return result.interpretation.slice(0, 4);
  }, [result]);

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    startTransition(() => {
      router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(value);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          DRBL · Analytical search
        </p>
        <h1 className="text-[34px] font-bold tracking-tight sm:text-[40px]">
          ASK DRBL
        </h1>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          A search engine for basketball intelligence — natural language to a
          trusted analytical result. Not a chatbot.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="ask-drbl-input">
          Ask DRBL
        </label>
        <textarea
          id="ask-drbl-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          placeholder="Ask a basketball analytics question…"
          className="w-full resize-y rounded-md border border-border bg-background px-4 py-3 text-[16px] font-medium outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="rounded-md bg-foreground px-4 py-2.5 text-[13px] font-bold text-background disabled:opacity-50"
          >
            {pending ? "Running…" : "Run query"}
          </button>
          <p className="text-[12px] text-muted-foreground">
            Results are shareable via the URL.
          </p>
        </div>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          Examples ASK DRBL can answer
        </h2>
        <ul className="flex flex-col gap-1.5">
          {ASK_DRBL_EXAMPLE_PROMPTS.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => {
                  setValue(p);
                  submit(p);
                }}
                className="text-left text-[14px] font-semibold underline-offset-2 hover:underline"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {recent.length ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              Recent
            </h2>
            <button
              type="button"
              onClick={() => {
                clearRecent();
                setRecent([]);
              }}
              className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {recent.map((entry) => (
              <li key={`${entry.q}-${entry.at}`}>
                <button
                  type="button"
                  onClick={() => {
                    setValue(entry.q);
                    submit(entry.q);
                  }}
                  className="flex w-full flex-col items-start rounded-md bg-secondary/50 px-2.5 py-1.5 text-left"
                >
                  <span className="text-[13px] font-semibold">
                    {entry.title.length > 64
                      ? `${entry.title.slice(0, 64)}…`
                      : entry.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {entry.status ? `${entry.status} · ` : ""}
                    {formatRecentTime(entry.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-4">
          <StatusBanner result={result} />

          {quietInterpretation.length ? (
            <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
              <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                Interpreted as
              </h2>
              <ul className="flex flex-col gap-1">
                {quietInterpretation.map((line) => (
                  <li
                    key={line}
                    className="text-[15px] font-semibold tracking-tight"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <QueryPlanDisclosure result={result} />

          {result.status === "ok" ? (
            <section className="sports-card flex flex-col gap-3 px-4 py-5 sm:px-5">
              {result.headline ? (
                <h2 className="text-[18px] font-bold tracking-tight">
                  {result.headline}
                </h2>
              ) : null}
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

          {(result.source || result.methodology?.length) && (
            <section className="sports-card flex flex-col gap-2 px-4 py-4 sm:px-5">
              {result.source ? (
                <p className="text-[13px]">
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
                Continue exploring
              </h2>
              <div className="flex flex-wrap gap-3">
                {result.links.map((l) => (
                  <Link
                    key={l.href + l.label}
                    href={l.href}
                    className="rounded-md bg-foreground px-3 py-2 text-[13px] font-bold text-background"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
