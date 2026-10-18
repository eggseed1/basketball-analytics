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
import type { TransactionType } from "@/offseason";
import { GlassSurface } from "@/components/brand/glass-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink, useQueryNav } from "@/components/continuity/query-nav";
import { TradeAcquireBoxes } from "@/components/offseason/trade-acquire-boxes";
import { TransactionDescription } from "@/components/offseason/transaction-description";
import { MoreInfo } from "@/components/ui/more-info";
import { Badge } from "@/components/ui/badge";
import { TeamIdentity } from "@/components/teams/team-identity";
import { TeamSelect, currentTeamChoices } from "@/components/teams/team-select";
import { TextLink } from "@/components/ui/text-link";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  tradeAcquirePresentationFromEvent,
  tradeAcquirePresentationFromEvents,
} from "@/lib/trade-acquire-presentation";
import { choiceTrackClassName, searchFieldClassName } from "@/components/ui/choice-chip";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import { LinkCue } from "@/components/ui/link-cue";

export { sourceTextCategoryLabel };

function teamAbbr(event: NbaTransactionEvent): string {
  const brand =
    resolveTeamBrand(event.teamId) ?? resolveTeamBrand(event.teamAbbr);
  return brand?.abbr ?? event.teamAbbr ?? event.teamId;
}

function tagVariant(category: TransactionType) {
  switch (category) {
    case "waive":
    case "release":
      return "negative" as const;
    case "signing":
    case "extension":
      return "positive" as const;
    case "trade":
      return "info" as const;
    case "option":
      return "warning" as const;
    case "draft":
      return "elite" as const;
    default:
      return "transaction" as const;
  }
}

export function TransactionKindTag({ category }: { category: TransactionType }) {
  return (
    <Badge size="sm" variant={tagVariant(category)} className="border-transparent font-bold">
      {sourceTextCategoryLabel(category)}
    </Badge>
  );
}

function uniqueCategories(events: NbaTransactionEvent[]): TransactionType[] {
  const seen = new Set<TransactionType>();
  const out: TransactionType[] = [];
  for (const event of events) {
    if (seen.has(event.sourceTextCategory)) continue;
    seen.add(event.sourceTextCategory);
    out.push(event.sourceTextCategory);
  }
  return out;
}

export function TransactionEventRow({
  event,
  compact,
  hideClusterHint: _hideClusterHint,
  playerResolutions,
  sourceTextOnly,
}: {
  event: NbaTransactionEvent;
  compact?: boolean;
  hideClusterHint?: boolean;
  playerResolutions?: TransactionPlayerResolution[];
  /** Prefer the raw source note (e.g. inside a cluster evidence expander). */
  sourceTextOnly?: boolean;
}) {
  const abbr = teamAbbr(event);
  const presentation = presentationForSourceEvent(event);
  const isTradeRelated = presentation.kind === "trade_related_transaction";
  const tradeAcquire =
    !sourceTextOnly && isTradeRelated
      ? tradeAcquirePresentationFromEvent(event)
      : null;
  const detailHref = `/offseason?event=${encodeURIComponent(event.id)}`;

  return (
    <article
      className={cn(
        "relative flex gap-3 border-b border-border/70 py-3 last:border-0 hover:bg-foreground/[0.03] [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-[2]",
        compact && "py-2"
      )}
    >
      <TransitionLink
        href={detailHref}
        data-row-link
        aria-label={`${event.date}, ${abbr}. Open detail`}
        className="absolute inset-0 z-[1]"
      />
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
          <TransactionKindTag category={event.sourceTextCategory} />
        </div>
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
            <span className="inline-flex flex-wrap gap-1">
              {uniqueCategories(events).map((category) => (
                <TransactionKindTag key={category} category={category} />
              ))}
            </span>
          </div>
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
              ? "Hide the lines"
              : "Show the lines"}
          </button>
          {open ? (
            <div data-motion-list className="mt-3 rounded-md border border-border/80 bg-secondary/20 px-3">
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
                  These notes look like the same {abbrs.join("-")} transaction.
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
                    Open cluster detail <LinkCue />
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
}: {
  offseasonYear: number;
  years: number[];
  teamId?: string;
  teams: Array<{ teamId: string; label: string }>;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { pending, pushHref } = useQueryNav();
  const [year, setYear] = useState(String(offseasonYear));
  const [team, setTeam] = useState(teamId ?? "");
  const [query, setQuery] = useState(q ?? "");
  const [from, setFrom] = useState(dateFrom ?? "");
  const [to, setTo] = useState(dateTo ?? "");

  function apply(next?: {
    year?: string;
    team?: string;
    query?: string;
    from?: string;
    to?: string;
  }) {
    const params = new URLSearchParams();
    const nextYear = next?.year ?? year;
    const nextTeam = next?.team ?? team;
    const nextQuery = next?.query ?? query;
    const nextFrom = next?.from ?? from;
    const nextTo = next?.to ?? to;
    params.set("year", nextYear);
    if (nextTeam) params.set("team", nextTeam);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    pushHref(`/offseason?${params.toString()}`);
  }

  const selectedYear = Number(year);
  const windowLabel = Number.isFinite(selectedYear)
    ? `June ${selectedYear} to May ${selectedYear + 1}`
    : "";
  const fieldClass = cn(searchFieldClassName, "w-auto");
  const groupClass = choiceTrackClassName;

  return (
    <GlassSurface
      effect="css"
      className="relative z-40 w-full min-w-0 max-w-full p-2 sm:p-3"
    >
      <form
        className="flex w-full min-w-0 max-w-full flex-col gap-2"
        aria-label="Transaction filters"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        <label className={groupClass}>
          <span className={cn(type.caption, "pl-2 font-medium uppercase tracking-[0.04em] text-muted-foreground")}>
            Year
          </span>
          <select
            className={cn(fieldClass, "pr-1")}
            value={year}
            aria-label="Year"
            onChange={(e) => {
              setYear(e.target.value);
              apply({ year: e.target.value });
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}-{String((y + 1) % 100).padStart(2, "0")}
              </option>
            ))}
          </select>
          <span className={cn(type.caption, "pr-2 text-muted-foreground")}>{windowLabel}</span>
        </label>
        <TeamSelect
          id="offseason-team"
          value={team || "ALL"}
          empty={{ value: "ALL", label: "All teams" }}
          teams={teams.map((row) => {
            const brand = resolveTeamBrand(row.teamId);
            const known = currentTeamChoices().find(
              (choice) => choice.abbreviation === brand?.abbr
            );
            return {
              id: row.teamId,
              abbreviation: brand?.abbr ?? known?.abbreviation ?? row.label,
              fullName: known?.fullName ?? row.label,
              conference: known?.conference,
            };
          })}
          onChange={(value) => {
            const next = value === "ALL" ? "" : value;
            setTeam(next);
            apply({ team: next });
          }}
        />
        <label className={cn(groupClass, "min-w-[12rem] flex-1")}>
          <span className="sr-only">Search</span>
          <input
            className={cn(fieldClass, "w-full")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => apply()}
            placeholder="Search"
            aria-label="Search"
          />
        </label>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-border/40 pt-2">
        <label className={groupClass}>
          <span className={cn(type.caption, "pl-2 font-medium uppercase tracking-[0.04em] text-muted-foreground")}>
            From
          </span>
          <input
            type="date"
            className={fieldClass}
            value={from}
            aria-label="From"
            onChange={(e) => {
              setFrom(e.target.value);
              apply({ from: e.target.value });
            }}
          />
        </label>
        <label className={groupClass}>
          <span className={cn(type.caption, "pl-2 font-medium uppercase tracking-[0.04em] text-muted-foreground")}>
            To
          </span>
          <input
            type="date"
            className={fieldClass}
            value={to}
            aria-label="To"
            onChange={(e) => {
              setTo(e.target.value);
              apply({ to: e.target.value });
            }}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="sports-pill disabled:opacity-50"
        >
          {pending ? "Updating…" : "Apply"}
        </button>
      </div>
      <MoreInfo summary="How search works">
        <p>
          Search matches the text of transaction descriptions, not player identities. Same-day
          activity stays separate unless reciprocal evidence shows one underlying transaction.
        </p>
      </MoreInfo>
      </form>
    </GlassSurface>
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
  const events = byMonth.flatMap((group) => group.events);
  return (
    <div data-motion-list>
      {events.map((e) => (
        <TransactionEventRow
          key={e.id}
          event={e}
          playerResolutions={playerResolutionsByEventId?.[e.id]}
        />
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
  const items = byMonth.flatMap((group) => group.items);
  return (
    <div data-motion-list className="sports-card px-4 py-2 sm:px-5">
      {items.map((item) => (
        <OffseasonFeedItemRow
          key={item.kind === "source_event" ? item.event.id : item.cluster.id}
          item={item}
          playerResolutionsByEventId={playerResolutionsByEventId}
        />
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
  const fromNbaCom = event.source === "nba-player-movement";
  const fromDraft = event.source === "espn-draft";

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

      <div className="flex flex-wrap gap-1">
        {uniqueCategories(detailEvents).map((category) => (
          <TransactionKindTag key={category} category={category} />
        ))}
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
          Transaction note
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
            Related transaction events
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
          {fromDraft
            ? "Each pick is one row for the team that made it. Trades of the pick before or after draft night are separate rows."
            : fromNbaCom
            ? "This note is one team's line. The source lists each player or pick a team received on its own line, and DRBL joins one team's lines for a deal into this sentence without adding anything."
            : "This note is one team's line. One-sided wording (for example “acquired X for draft considerations”) is shown as recorded. DRBL does not invent the other side of the deal from free text."}
        </p>
      )}

      <dl className="grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-foreground">
            Kind
          </dt>
          <dd>
            {sourceTextCategoryLabel(event.sourceTextCategory)}. Wording only, not a complete package.
          </dd>
        </div>
      </dl>
      <p className="text-[12px] text-muted-foreground">
        {fromDraft
          ? "This record is built from the draft order: pick number, round and position."
          : <>
              {fromNbaCom
                ? "This record is built from NBA.com's per-player lines."
                : event.source === "espn-site-v2-transactions"
                  ? "This record is free text from ESPN's transaction feed."
                  : "This record is free text from the source."}{" "}
              Players and picks are read from it, not from a structured ownership ledger.
            </>}
      </p>
    </div>
  );
}
