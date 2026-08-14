"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import {
  sourceTextCategoryLabel,
  type TransactionType,
} from "@/offseason";
import { TeamLogo } from "@/components/brand/team-logo";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { monthLabel } from "@/data/providers/transactions/offseason-window";
import { cn } from "@/lib/utils";

export { sourceTextCategoryLabel };

export function TransactionEventRow({
  event,
  compact,
}: {
  event: NbaTransactionEvent;
  compact?: boolean;
}) {
  const brand = resolveTeamBrand(event.teamId) ?? resolveTeamBrand(event.teamAbbr);
  const abbr = brand?.abbr ?? event.teamAbbr ?? event.teamId;
  return (
    <article
      className={cn(
        "flex gap-3 border-b border-border/70 py-3 last:border-0",
        compact && "py-2"
      )}
    >
      <Link
        href={`/teams/${event.teamId}`}
        className="mt-0.5 shrink-0"
        aria-label={abbr}
      >
        <TeamLogo teamKey={abbr} size={compact ? "xs" : "sm"} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <time className="text-[12px] font-semibold tabular-nums text-muted-foreground">
            {event.date}
          </time>
          <Link
            href={`/teams/${event.teamId}`}
            className="text-[13px] font-bold underline-offset-2 hover:underline"
          >
            {brand?.id ? abbr : abbr}
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {sourceTextCategoryLabel(event.sourceTextCategory)}
          </span>
        </div>
        <p
          className={cn(
            "mt-1 text-[14px] leading-relaxed text-foreground",
            compact && "text-[13px]"
          )}
        >
          {event.description}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Season {event.season} · ESPN transaction archive ·{" "}
          <Link
            href={`/offseason?event=${encodeURIComponent(event.id)}`}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Detail
          </Link>
        </p>
      </div>
    </article>
  );
}

export function OffseasonFilters({
  offseasonYear,
  years,
  teamId,
  teams,
  q,
  dateFrom,
  dateTo,
  season,
}: {
  offseasonYear: number;
  years: number[];
  teamId?: string;
  teams: Array<{ teamId: string; label: string }>;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  season?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [year, setYear] = useState(String(offseasonYear));
  const [team, setTeam] = useState(teamId ?? "");
  const [query, setQuery] = useState(q ?? "");
  const [from, setFrom] = useState(dateFrom ?? "");
  const [to, setTo] = useState(dateTo ?? "");
  const [seasonVal, setSeasonVal] = useState(season ?? "");

  function apply() {
    const params = new URLSearchParams();
    params.set("year", year);
    if (team) params.set("team", team);
    if (query.trim()) params.set("q", query.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (seasonVal.trim()) params.set("season", seasonVal.trim());
    startTransition(() => {
      router.push(`/offseason?${params.toString()}`);
    });
  }

  return (
    <div className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Offseason
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} Offseason
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Team
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Search descriptions
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Trade, draft, waiver…"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          From
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          To
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          NBA season
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-[13px] font-semibold text-foreground"
            value={seasonVal}
            onChange={(e) => setSeasonVal(e.target.value)}
            placeholder="Optional YYYY-YY"
          />
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-[13px] font-bold text-background disabled:opacity-50"
        >
          {pending ? "Loading…" : "Apply"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Search matches free-text ESPN descriptions — not entity-aware player
        lookup.
      </p>
    </div>
  );
}

export function TimelineByMonth({
  byMonth,
}: {
  byMonth: Array<{ monthKey: string; events: NbaTransactionEvent[] }>;
}) {
  if (!byMonth.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
        No transaction events for these filters.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {byMonth.map(({ monthKey, events }) => (
        <section key={monthKey}>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {monthLabel(monthKey)}
          </h3>
          <div className="mt-2">
            {events.map((e) => (
              <TransactionEventRow key={e.id} event={e} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TransactionEventDetail({
  event,
}: {
  event: NbaTransactionEvent;
}) {
  const brand = resolveTeamBrand(event.teamId) ?? resolveTeamBrand(event.teamAbbr);
  const abbr = brand?.abbr ?? event.teamAbbr ?? event.teamId;
  return (
    <div className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3">
        <TeamLogo teamKey={abbr} size="md" />
        <div>
          <p className="text-[12px] font-semibold tabular-nums text-muted-foreground">
            {event.date} · Season {event.season}
          </p>
          <Link
            href={`/teams/${event.teamId}`}
            className="text-[16px] font-bold underline-offset-2 hover:underline"
          >
            {abbr}
          </Link>
        </div>
      </div>
      <p className="text-[15px] leading-relaxed">{event.description}</p>
      <dl className="grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-foreground">Source</dt>
          <dd>ESPN transaction archive</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">
            Source-text category
          </dt>
          <dd>
            {sourceTextCategoryLabel(event.sourceTextCategory)} (keyword
            classification — not an official ESPN type)
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Record id</dt>
          <dd className="font-mono text-[11px]">{event.id}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Dataset</dt>
          <dd>
            {event.source} v{event.datasetVersion ?? "?"}
          </dd>
        </div>
      </dl>
      <p className="text-[12px] text-muted-foreground">
        Structured players, picks, and ownership are not available for this
        event. Genealogy remains blocked.
      </p>
    </div>
  );
}
