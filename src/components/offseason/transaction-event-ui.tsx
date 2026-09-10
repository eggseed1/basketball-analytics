"use client";

import { useState } from "react";

import type {
  NbaTransactionEvent,
  OffseasonFeedItem,
  RelatedTransactionEventCluster,
} from "@/data/types/transaction-event";
import type { TransactionPlayerResolution } from "@/lib/transaction-player-resolution";
import {
  presentationForRelatedCluster,
  presentationForSourceEvent,
} from "@/lib/transaction-event-presentation";
import { sourceTextCategoryLabel } from "@/offseason";
import { TeamLogo } from "@/components/brand/team-logo";
import { useQueryNav } from "@/components/continuity/query-nav";
import { TradeAcquireBoxes } from "@/components/offseason/trade-acquire-boxes";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TextLink } from "@/components/ui/text-link";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  tradeAcquirePresentationFromEvent,
  tradeAcquirePresentationFromEvents,
} from "@/lib/trade-acquire-presentation";
import { monthLabel } from "@/data/providers/transactions/offseason-window";
import { cn } from "@/lib/utils";

export { sourceTextCategoryLabel };

function teamAbbr(event: NbaTransactionEvent): string {
  const brand =
    resolveTeamBrand(event.teamId) ?? resolveTeamBrand(event.teamAbbr);
  return brand?.abbr ?? event.teamAbbr ?? event.teamId;
}

export function TransactionEventRow({
  event,
  compact,
  hideClusterHint,
  playerResolutions,
  sourceTextOnly,
}: {
  event: NbaTransactionEvent;
  compact?: boolean;
  hideClusterHint?: boolean;
  playerResolutions?: TransactionPlayerResolution[];
  /** Prefer raw ESPN note (e.g. inside a cluster evidence expander). */
  sourceTextOnly?: boolean;
}) {
  const abbr = teamAbbr(event);
  const presentation = presentationForSourceEvent(event);
  const isTradeRelated = presentation.kind === "trade_related_transaction";
  const tradeAcquire =
    !sourceTextOnly && isTradeRelated
      ? tradeAcquirePresentationFromEvent(event)
      : null;

  return (
    <article
      className={cn(
        "flex gap-3 border-b border-border/70 py-3 last:border-0",
        compact && "py-2"
      )}
    >
      {!tradeAcquire ? (
        <TeamIdentity
          teamKey={event.teamId}
          label={abbr}
          className="mt-0.5 shrink-0"
          nameClassName="no-underline hover:no-underline"
        >
          <TeamLogo teamKey={abbr} size={compact ? "xs" : "sm"} />
        </TeamIdentity>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <time className="text-[12px] font-semibold tabular-nums text-muted-foreground">
            {event.date}
          </time>
          {!tradeAcquire ? (
            <TeamIdentity
              teamKey={event.teamId}
              label={abbr}
              className="inline-flex"
              nameClassName="text-[14px] font-bold"
            />
          ) : (
            <span className="text-[14px] font-bold tracking-tight">
              {tradeAcquire.sides.map((s) => s.teamAbbr).join(" ↔ ")}
            </span>
          )}
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {presentation.title}
          </span>
          {!isTradeRelated ? (
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              · {sourceTextCategoryLabel(event.sourceTextCategory)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] font-semibold text-muted-foreground">
          {presentation.sourceCountLabel}
          {isTradeRelated
            ? " · ESPN transaction archive"
            : " · ESPN transaction note"}
        </p>
        {tradeAcquire ? (
          <TradeAcquireBoxes
            presentation={tradeAcquire}
            resolutions={playerResolutions}
            compact={compact}
          />
        ) : (
          <TransactionDescription
            description={event.description}
            resolutions={playerResolutions}
            className="type-body mt-0.5 leading-relaxed text-foreground"
          />
        )}
        <p className="mt-1 text-[12px] text-muted-foreground">
          Season {event.season}
          {!isTradeRelated ? " · ESPN transaction archive" : ""}
          {!hideClusterHint && event.relatedClusterId
            ? " · part of a related-event cluster"
            : ""}{" "}
          ·{" "}
          <TextLink href={`/offseason?event=${encodeURIComponent(event.id)}`}>
            Detail
          </TextLink>
          {event.sourceUrl ? (
            <>
              {" · "}
              <TextLink href={event.sourceUrl}>ESPN source</TextLink>
            </>
          ) : null}
        </p>
      </div>
    </article>
  );
}

export function RelatedEventClusterCard({
  cluster,
  events,
  defaultOpen,
  playerResolutionsByEventId,
}: {
  cluster: RelatedTransactionEventCluster;
  events: NbaTransactionEvent[];
  defaultOpen?: boolean;
  playerResolutionsByEventId?: Record<string, TransactionPlayerResolution[]>;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const abbrs = cluster.teamIds.map(
    (id) => resolveTeamBrand(id)?.abbr ?? id
  );
  const presentation = presentationForRelatedCluster(events);
  const isTradeRelated = presentation.kind === "trade_related_transaction";
  const tradeAcquire = isTradeRelated
    ? tradeAcquirePresentationFromEvents(events)
    : null;
  const clusterResolutions = events.flatMap(
    (e) => playerResolutionsByEventId?.[e.id] ?? []
  );

  return (
    <article className="border-b border-border/70 py-3 last:border-0">
      <div className="flex flex-wrap items-start gap-3">
        {!tradeAcquire ? (
          <div className="flex -space-x-2 pt-0.5">
            {events.slice(0, 3).map((e) => (
              <TeamLogo key={e.id} teamKey={teamAbbr(e)} size="sm" />
            ))}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <time className="text-[12px] font-semibold tabular-nums text-muted-foreground">
              {cluster.date}
            </time>
            <p className="text-[14px] font-bold tracking-tight">
              {abbrs.join(" ↔ ")}
            </p>
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {presentation.title}
            </span>
          </div>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {presentation.sourceCountLabel}
            {isTradeRelated
              ? " - source evidence from the ESPN transaction archive (not a verified structured trade ledger)."
              : " - assembled from source events, not a verified structured trade ledger."}
          </p>
          {tradeAcquire ? (
            <TradeAcquireBoxes
              presentation={tradeAcquire}
              resolutions={clusterResolutions}
            />
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 text-[12px] font-semibold underline-offset-2 hover:underline"
            aria-expanded={open}
          >
            {open
              ? presentation.sourceCount === 1
                ? "Hide source event"
                : "Hide source events"
              : presentation.sourceCount === 1
                ? "Show source event"
                : "Show source events"}
          </button>
          {open ? (
            <div className="mt-3 rounded-md border border-border/80 bg-secondary/20 px-3">
              {events.map((e) => (
                <TransactionEventRow
                  key={e.id}
                  event={e}
                  compact
                  hideClusterHint
                  sourceTextOnly
                  playerResolutions={playerResolutionsByEventId?.[e.id]}
                />
              ))}
              <div className="border-t border-border/70 py-3 text-[12px] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">
                  Event interpretation
                </p>
                <p className="mt-1">
                  These source events appear to describe the same{" "}
                  {abbrs.join("-")} transaction.
                </p>
                <p className="mt-2 font-semibold text-foreground">
                  Assembled from related transaction events
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {cluster.evidence.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  <span className="font-semibold text-foreground">
                    Structured asset ledger:
                  </span>{" "}
                  not currently available. Exact pick identities are not
                  claimed from free text.
                </p>
                <p className="mt-2">
                  <TextLink
                    href={`/offseason?event=${encodeURIComponent(events[0]!.id)}`}
                  >
                    Open cluster detail →
                  </TextLink>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function OffseasonFeedItemRow({
  item,
  playerResolutionsByEventId,
}: {
  item: OffseasonFeedItem;
  playerResolutionsByEventId?: Record<string, TransactionPlayerResolution[]>;
}) {
  if (item.kind === "related_event_cluster") {
    return (
      <RelatedEventClusterCard
        cluster={item.cluster}
        events={item.events}
        playerResolutionsByEventId={playerResolutionsByEventId}
      />
    );
  }
  return (
    <TransactionEventRow
      event={item.event}
      playerResolutions={playerResolutionsByEventId?.[item.event.id]}
    />
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
  const { pending, pushHref } = useQueryNav();
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
    pushHref(`/offseason?${params.toString()}`);
  }

  return (
    <div className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Offseason
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
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
        <label className="flex flex-col gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Team
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
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
        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Search descriptions
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Trade, draft, waiver…"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          From
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          To
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          NBA season
          <input
            className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
            value={seasonVal}
            onChange={(e) => setSeasonVal(e.target.value)}
            placeholder="Optional YYYY-YY"
          />
        </label>
        <button
          type="button"
          onClick={apply}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-[14px] font-bold text-background disabled:opacity-50"
        >
          {pending ? "Updating…" : "Apply"}
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Search matches free-text ESPN descriptions - not entity-aware player
        lookup. Same-day activity stays separate unless reciprocal evidence
        shows one underlying transaction (then source-record count explains
        the evidence).
      </p>
    </div>
  );
}

export function TimelineByMonth({
  byMonth,
  playerResolutionsByEventId,
}: {
  byMonth: Array<{ monthKey: string; events: NbaTransactionEvent[] }>;
  playerResolutionsByEventId?: Record<string, TransactionPlayerResolution[]>;
}) {
  if (!byMonth.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[14px] text-muted-foreground">
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
              <TransactionEventRow
                key={e.id}
                event={e}
                playerResolutions={playerResolutionsByEventId?.[e.id]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TimelineFeedByMonth({
  byMonth,
  playerResolutionsByEventId,
}: {
  byMonth: Array<{ monthKey: string; items: OffseasonFeedItem[] }>;
  playerResolutionsByEventId?: Record<string, TransactionPlayerResolution[]>;
}) {
  if (!byMonth.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[14px] text-muted-foreground">
        No transaction events for these filters.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {byMonth.map(({ monthKey, items }) => (
        <section key={monthKey}>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {monthLabel(monthKey)}
          </h3>
          <div className="mt-2">
            {items.map((item) => (
              <OffseasonFeedItemRow
                key={
                  item.kind === "source_event"
                    ? item.event.id
                    : item.cluster.id
                }
                item={item}
                playerResolutionsByEventId={playerResolutionsByEventId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TransactionEventDetail({
  event,
  cluster,
  relatedEvents,
  playerResolutionsByEventId,
}: {
  event: NbaTransactionEvent;
  cluster?: RelatedTransactionEventCluster | null;
  relatedEvents?: NbaTransactionEvent[];
  playerResolutionsByEventId?: Record<string, TransactionPlayerResolution[]>;
}) {
  const brand = resolveTeamBrand(event.teamId) ?? resolveTeamBrand(event.teamAbbr);
  const abbr = brand?.abbr ?? event.teamAbbr ?? event.teamId;
  const related = (relatedEvents ?? []).filter((e) => e.id !== event.id);
  const clusterAbbrs = cluster?.teamIds.map(
    (id) => resolveTeamBrand(id)?.abbr ?? id
  );
  const detailEvents =
    cluster && related.length ? [event, ...related] : [event];
  const presentation = cluster
    ? presentationForRelatedCluster(detailEvents)
    : presentationForSourceEvent(event);
  const isTradeRelated = presentation.kind === "trade_related_transaction";
  const tradeAcquire = isTradeRelated
    ? tradeAcquirePresentationFromEvents(detailEvents)
    : null;
  const detailResolutions = detailEvents.flatMap(
    (e) => playerResolutionsByEventId?.[e.id] ?? []
  );
  const headerAbbrs =
    tradeAcquire?.sides.map((s) => s.teamAbbr) ??
    clusterAbbrs ??
    [abbr];

  return (
    <div className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3">
        {!tradeAcquire ? (
          <TeamIdentity
            teamKey={event.teamId}
            label={abbr}
            className="shrink-0"
            nameClassName="no-underline hover:no-underline"
          >
            <TeamLogo teamKey={abbr} size="md" />
          </TeamIdentity>
        ) : (
          <div className="flex -space-x-2 shrink-0">
            {tradeAcquire.sides.map((side) => (
              <TeamLogo key={side.teamId} teamKey={side.teamAbbr} size="md" />
            ))}
          </div>
        )}
        <div>
          <p className="text-[12px] font-semibold tabular-nums text-muted-foreground">
            {event.date} · Season {event.season}
          </p>
          <p className="text-[16px] font-bold tracking-tight">
            {headerAbbrs.join(" ↔ ")}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          {presentation.title}
        </p>
        <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
          {presentation.sourceCountLabel}
        </p>
      </div>

      {tradeAcquire ? (
        <TradeAcquireBoxes
          presentation={tradeAcquire}
          resolutions={detailResolutions}
          className="mt-0"
        />
      ) : null}

      <div>
        <p className="text-[12px] font-semibold text-muted-foreground">
          ESPN transaction note
        </p>
        <TransactionDescription
          description={event.description}
          resolutions={playerResolutionsByEventId?.[event.id]}
          className="mt-1 text-[16px] leading-relaxed"
        />
      </div>

      {cluster && related.length ? (
        <div className="rounded-md border border-border bg-secondary/30 px-3 py-3">
          <p className="text-[14px] font-bold tracking-tight">
            {clusterAbbrs?.join(" ↔ ") ?? "Related teams"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Related ESPN transaction events
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {[event, ...related].map((e) => (
              <li key={e.id}>
                <p className="text-[12px] font-bold">{teamAbbr(e)}</p>
                <TransactionDescription
                  description={e.description}
                  resolutions={playerResolutionsByEventId?.[e.id]}
                  className="text-[14px] leading-relaxed text-muted-foreground"
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-border/70 pt-3 text-[12px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Event interpretation</p>
            <p className="mt-1">
              This appears to describe the same{" "}
              {clusterAbbrs?.join("-") ?? "multi-team"} transaction.
            </p>
            <p className="mt-2 font-semibold text-foreground">
              Assembled from related transaction events
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {cluster.evidence.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2">
              <span className="font-semibold text-foreground">Data status:</span>{" "}
              Source-event reconstruction
            </p>
            <p className="mt-1">
              <span className="font-semibold text-foreground">
                Structured asset ledger:
              </span>{" "}
              not currently available.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          This is a single-team ESPN source event. One-sided wording (for
          example “acquired X for draft considerations”) is shown exactly as
          recorded - DRBL does not invent the other side of the deal from free
          text.
        </p>
      )}

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
            {sourceTextCategoryLabel(event.sourceTextCategory)} - classifies
            wording only; not a complete package claim
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Record id</dt>
          <dd className="font-mono text-[12px]">{event.id}</dd>
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
