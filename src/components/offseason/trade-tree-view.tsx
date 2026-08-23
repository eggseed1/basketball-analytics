"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import type {
  TeamTradeTree,
  TradeTreeAsset,
  TradeTreeDisposition,
  TradeTreeNode,
  TradeTreePlayerHit,
} from "@/data/types/team-trade-tree";
import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { PlayerIdentity } from "@/components/players/player-identity";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";
import { cn } from "@/lib/utils";

type TeamOption = { id: string; label: string };

function dispositionLabel(d: TradeTreeDisposition): string {
  if (d.kind === "traded") {
    return d.toTeamAbbr
      ? `Traded to ${d.toTeamAbbr} for`
      : "Traded for";
  }
  if (d.kind === "acquired") {
    return d.fromTeamAbbr
      ? `Acquired from ${d.fromTeamAbbr} for`
      : "Acquired for";
  }
  if (d.kind === "waived") return "Waived";
  if (d.kind === "drafted") {
    return d.playerLabel ? `Drafted ${d.playerLabel}` : "Drafted";
  }
  if (d.kind === "signed") return "Signed / claimed";
  if (d.kind === "terminal") return d.note;
  if (d.kind === "open") return d.note ?? "Still open in archive";
  return "";
}

function AssetLine({ asset }: { asset: TradeTreeAsset }) {
  const focusRing = asset.focused
    ? "rounded-sm bg-foreground/10 ring-1 ring-foreground/40 px-1"
    : "";
  if (asset.kind === "player" && asset.playerId) {
    return (
      <li className={cn("flex items-center gap-2 py-0.5", focusRing)}>
        <PlayerHeadshot
          playerId={asset.playerId}
          name={asset.label}
          size="xs"
          className="shrink-0"
        />
        <PlayerIdentity
          playerId={asset.playerId}
          name={asset.label.toUpperCase()}
          className="text-[13px] font-bold tracking-wide"
        />
      </li>
    );
  }
  if (asset.kind === "player") {
    return (
      <li
        className={cn(
          "py-0.5 text-[13px] font-bold uppercase tracking-wide",
          focusRing
        )}
      >
        {asset.label}
      </li>
    );
  }
  return (
    <li
      className={cn(
        "py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground",
        focusRing
      )}
    >
      {asset.label}
    </li>
  );
}

function HaulBox({
  teamId,
  teamAbbr,
  assets,
  date,
}: {
  teamId: string;
  teamAbbr: string;
  assets: TradeTreeAsset[];
  date?: string;
}) {
  const brand = resolveTeamBrand(teamId) ?? resolveTeamBrand(teamAbbr);
  const primary = brand?.primary ?? "#1a1a1a";

  return (
    <div
      className={cn(
        "min-w-[11.5rem] max-w-[16rem] overflow-hidden rounded-md border bg-background shadow-sm",
        assets.some((a) => a.focused)
          ? "border-foreground/50 ring-1 ring-foreground/25"
          : "border-border/60"
      )}
    >
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 text-white"
        style={{ backgroundColor: primary }}
      >
        <TeamLogo teamKey={brand?.abbr ?? teamAbbr} size="2xs" />
        <span className="text-[11px] font-bold uppercase tracking-wide">
          {teamAbbr} got
        </span>
        {date ? (
          <span className="ml-auto text-[10px] tabular-nums opacity-80">
            {date}
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-0.5 px-2.5 py-2">
        {assets.length ? (
          assets.map((a) => <AssetLine key={a.id} asset={a} />)
        ) : (
          <li className="text-[12px] text-muted-foreground">No parsed assets</li>
        )}
      </ul>
    </div>
  );
}

function Branch({
  fromLabel,
  disposition,
  node,
}: {
  fromLabel: string;
  disposition: TradeTreeDisposition;
  node: TradeTreeNode | null;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="flex flex-col items-center py-1">
        <div className="h-4 w-px border-l border-dashed border-foreground/35" />
        <p
          className={cn(
            type.caption,
            "max-w-[12rem] px-1 text-center font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          <span className="text-foreground/80">{fromLabel}</span>
          <br />
          {dispositionLabel(disposition)}
          {disposition.kind === "traded" ||
          disposition.kind === "acquired" ||
          disposition.kind === "waived" ||
          disposition.kind === "drafted" ||
          disposition.kind === "signed" ? (
            <span className="mt-0.5 block tabular-nums opacity-70">
              {"date" in disposition ? disposition.date : ""}
            </span>
          ) : null}
        </p>
        {disposition.kind === "traded" && disposition.toTeamAbbr ? (
          <div className="my-1">
            <TeamLogo teamKey={disposition.toTeamAbbr} size="xs" />
          </div>
        ) : null}
        {disposition.kind === "acquired" && disposition.fromTeamAbbr ? (
          <div className="my-1">
            <TeamLogo teamKey={disposition.fromTeamAbbr} size="xs" />
          </div>
        ) : null}
        <div className="h-4 w-px border-l border-dashed border-foreground/35" />
      </div>
      {node ? (
        <TreeNodeView node={node} />
      ) : disposition.kind === "waived" ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Waived
        </div>
      ) : disposition.kind === "open" ? (
        <div className="rounded-md border border-dashed border-border/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {disposition.note ?? "Open"}
        </div>
      ) : disposition.kind === "drafted" ? (
        <div className="rounded-md border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide">
          {disposition.playerLabel
            ? `Drafted · ${disposition.playerLabel}`
            : "Drafted"}
        </div>
      ) : disposition.kind === "signed" ? (
        <div className="rounded-md border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide">
          Signed
        </div>
      ) : null}
    </div>
  );
}

function TreeNodeView({ node }: { node: TradeTreeNode }) {
  const liveChildren = node.children;

  return (
    <div className="flex flex-col items-center">
      <HaulBox
        teamId={node.teamId}
        teamAbbr={node.teamAbbr}
        assets={node.assets}
        date={node.date}
      />
      {liveChildren.length > 0 ? (
        <div className="relative mt-1 flex w-full flex-col items-center">
          <div className="h-3 w-px bg-foreground/30" />
          {liveChildren.length > 1 ? (
            <div className="h-px w-[min(100%,calc(100%-2rem))] bg-foreground/30" />
          ) : null}
          <div
            className={cn(
              "flex gap-4 pt-0",
              liveChildren.length > 1
                ? "justify-center overflow-x-auto px-2 pb-2"
                : ""
            )}
          >
            {liveChildren.map((c) => (
              <Branch
                key={`${c.fromAssetId}-${c.disposition.kind}-${
                  c.disposition.kind === "traded" ||
                  c.disposition.kind === "waived" ||
                  c.disposition.kind === "drafted" ||
                  c.disposition.kind === "signed"
                    ? c.disposition.eventId
                    : c.fromAssetId
                }`}
                fromLabel={c.fromAssetLabel}
                disposition={c.disposition}
                node={c.node}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SearchSelect({
  valueLabel,
  placeholder,
  disabled,
  emptyText,
  options,
  filter,
  onSelect,
  leading,
}: {
  valueLabel: string | null;
  placeholder: string;
  disabled?: boolean;
  emptyText: string;
  options: Array<{ id: string; label: string; detail?: string; leading?: ReactNode }>;
  filter: (query: string) => Array<{ id: string; label: string; detail?: string; leading?: ReactNode }>;
  onSelect: (id: string) => void;
  leading?: ReactNode;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  const hits = useMemo(() => {
    const q = draft.trim();
    return (q ? filter(q) : options).slice(0, 40);
  }, [draft, filter, options]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setMenuBox(null);
      return;
    }
    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuBox({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, hits.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      setDraft("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [draft, open]);

  const commit = (id: string) => {
    onSelect(id);
    setOpen(false);
    setDraft("");
  };

  return (
    <div ref={rootRef} className="relative inline-flex min-w-0 max-w-full">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setDraft("");
        }}
        className={cn(
          type.bodySm,
          "glass-pill inline-flex max-w-[16rem] items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold transition-colors",
          disabled
            ? "cursor-not-allowed text-muted-foreground/50"
            : open
              ? "glass-pill-active"
              : "text-foreground hover:glass-pill-active"
        )}
      >
        {leading}
        <span className="truncate">
          {valueLabel ?? placeholder}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </button>

      {mounted && open && menuBox
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[80]"
              style={{
                top: menuBox.top,
                left: menuBox.left,
                width: menuBox.width,
              }}
            >
              <FrostFloatingSurface
                id={listId}
                role="listbox"
                className="max-h-72 overflow-hidden p-1.5"
              >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                    setDraft("");
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = hits[activeIndex];
                    if (hit) commit(hit.id);
                  }
                }}
                placeholder="Search…"
                className={cn(
                  type.bodySm,
                  "mb-1.5 w-full rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              />
              <ul className="max-h-56 overflow-y-auto overscroll-contain">
                {hits.length === 0 ? (
                  <li className={cn(type.caption, "px-2 py-2 text-muted-foreground")}>
                    {emptyText}
                  </li>
                ) : (
                  hits.map((hit, i) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === activeIndex}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => commit(hit.id)}
                        className={cn(
                          type.bodySm,
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-semibold transition-colors",
                          i === activeIndex
                            ? "bg-foreground/10 text-foreground"
                            : "text-foreground/90 hover:bg-foreground/5"
                        )}
                      >
                        {hit.leading}
                        <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                        {hit.detail ? (
                          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                            {hit.detail}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </FrostFloatingSurface>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function rankPlayerHits(
  options: Array<{ id: string; label: string; detail?: string; leading?: ReactNode }>,
  q: string
) {
  const needle = q.toLowerCase().trim();
  const key = normalizePlayerName(q);
  const scored = options
    .map((p) => {
      const label = p.label.toLowerCase();
      const norm = normalizePlayerName(p.label);
      const last = label.split(/\s+/).pop() ?? label;
      let score = 0;
      if (norm === key) score = 100;
      else if (label.startsWith(needle)) score = 80;
      else if (last.startsWith(needle)) score = 70;
      else if (norm.startsWith(key)) score = 60;
      else if (label.includes(needle)) score = 40;
      else if (norm.includes(key)) score = 30;
      else if (last.includes(needle)) score = 25;
      else return null;
      return { p, score };
    })
    .filter((x): x is { p: (typeof options)[number]; score: number } => x != null)
    .sort(
      (a, b) => b.score - a.score || a.p.label.localeCompare(b.p.label)
    );
  return scored.map((s) => s.p);
}

function TradeTreeAskBar({
  teams,
  offseasonYear,
  teamId,
  teamLabel,
  playerCatalog,
  rootEventId,
  selectedPlayerLabel,
}: {
  teams: TeamOption[];
  offseasonYear: number;
  teamId?: string;
  teamLabel?: string | null;
  playerCatalog?: TradeTreePlayerHit[];
  rootEventId?: string;
  selectedPlayerLabel?: string | null;
}) {
  const queryNav = useQueryNavOptional();

  const teamOptions = useMemo(
    () =>
      teams.map((t) => ({
        id: t.id,
        label: t.label,
        leading: <TeamLogo teamKey={t.label} size="2xs" />,
      })),
    [teams]
  );

  const playerOptions = useMemo(
    () =>
      (playerCatalog ?? []).map((p) => ({
        id: `${p.eventId}::${p.matchKey}`,
        label: p.label,
        detail: p.counterpartyAbbr
          ? `${p.date} · ${p.counterpartyAbbr}`
          : p.date,
        leading: p.playerId ? (
          <PlayerHeadshot
            playerId={p.playerId}
            name={p.label}
            size="xs"
            className="shrink-0"
          />
        ) : undefined,
      })),
    [playerCatalog]
  );

  const filterTeams = (q: string) => {
    const needle = q.toLowerCase();
    return teamOptions.filter(
      (t) =>
        t.label.toLowerCase().includes(needle) ||
        t.id.includes(needle)
    );
  };

  const filterPlayers = (q: string) => rankPlayerHits(playerOptions, q);

  const goTeam = (nextTeamId: string) => {
    const href = `/offseason?year=${offseasonYear}&team=${encodeURIComponent(nextTeamId)}`;
    if (queryNav) queryNav.pushHref(href);
    else window.location.assign(href);
  };

  const goPlayer = (compositeId: string) => {
    if (!teamId) return;
    const [eventId, ...rest] = compositeId.split("::");
    const matchKey = rest.join("::");
    const params = new URLSearchParams({
      year: String(offseasonYear),
      team: teamId,
      root: eventId ?? "",
    });
    if (matchKey) params.set("player", matchKey);
    const href = `/offseason?${params.toString()}`;
    if (queryNav) queryNav.pushHref(href);
    else window.location.assign(href);
  };

  const activePlayer =
    selectedPlayerLabel ??
    playerCatalog?.find((p) => p.eventId === rootEventId)?.label ??
    null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          type.heading,
          "flex flex-wrap items-center gap-x-2 gap-y-1.5 tracking-tight"
        )}
      >
        <span>How did</span>
        <SearchSelect
          valueLabel={teamLabel ?? null}
          placeholder="search team"
          options={teamOptions}
          filter={filterTeams}
          emptyText="No teams match"
          onSelect={goTeam}
          leading={
            teamLabel ? <TeamLogo teamKey={teamLabel} size="2xs" /> : null
          }
        />
        <span>get</span>
        <SearchSelect
          valueLabel={activePlayer}
          placeholder="search player"
          disabled={!teamId}
          options={playerOptions}
          filter={filterPlayers}
          emptyText={
            teamId
              ? "Type a name — search acquired players in the archive"
              : "Pick a team first"
          }
          onSelect={goPlayer}
        />
        <span>?</span>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Search any player this franchise acquired in a parseable trade — we open
        the full forward + backward genealogy from that deal.
        {playerCatalog?.length
          ? ` · ${playerCatalog.length} searchable acquisitions`
          : null}
      </p>
    </div>
  );
}

export function TradeTreeView({
  tree,
  offseasonYear,
  teams,
}: {
  tree: TeamTradeTree;
  offseasonYear: number;
  teams: TeamOption[];
}) {
  const brand = resolveTeamBrand(tree.teamId);
  const focusAsset =
    tree.root.assets.find((a) => a.focused) ??
    tree.root.assets.find(
      (a) =>
        a.kind === "player" &&
        tree.focusPlayerMatchKey &&
        a.matchKey === tree.focusPlayerMatchKey
    ) ??
    null;
  const rootStar =
    focusAsset ??
    tree.root.assets.find((a) => a.kind === "player") ??
    tree.rootSent.find((a) => a.kind === "player") ??
    null;
  const selectedPlayer =
    tree.focusPlayerLabel ??
    tree.playerCatalog.find((p) => p.eventId === tree.rootEventId)?.label ??
    tree.root.assets.find((a) => a.kind === "player")?.label ??
    null;

  return (
    <section
      className="pointer-events-auto relative z-10 flex flex-col gap-3"
      aria-label="Trade tree"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <TradeTreeAskBar
          teams={teams}
          offseasonYear={offseasonYear}
          teamId={tree.teamId}
          teamLabel={brand?.abbr ?? tree.teamAbbr}
          playerCatalog={tree.playerCatalog}
          rootEventId={tree.rootEventId}
          selectedPlayerLabel={selectedPlayer}
        />
        {tree.rootEventId ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            Forward depth {tree.depth}
            {tree.ancestryDepth > 0
              ? ` · ancestry ${tree.ancestryDepth}`
              : ""}{" "}
            · {tree.branchCount} later moves
          </p>
        ) : null}
      </div>

      <div className="sports-card overflow-x-auto p-4 sm:p-5">
        {!tree.rootEventId ? (
          <div className="flex flex-col gap-2 py-2">
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              {tree.disclaimer}
            </p>
            {tree.playerCatalog.length > 0 ? (
              <p className={cn(type.caption, "text-muted-foreground")}>
                {tree.playerCatalog.length} searchable acquisitions ready —
                pick a player above to build the genealogy.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex min-w-min flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              {rootStar ? (
                <PlayerHeadshot
                  playerId={rootStar.playerId}
                  name={rootStar.label}
                  size="lg"
                  className="rounded-full"
                />
              ) : (
                <TeamLogo
                  teamKey={brand?.abbr ?? tree.teamAbbr}
                  size="lg"
                />
              )}
              <h3 className="max-w-xl text-[18px] font-bold uppercase tracking-tight sm:text-[22px]">
                {tree.title}
              </h3>
              <p className={cn(type.caption, "text-muted-foreground")}>
                Root deal · {tree.rootDate}
              </p>
            </div>

            {tree.ancestry.length > 0 ? (
              <div className="flex w-full flex-col items-center gap-3 border-b border-border/50 pb-6">
                <p
                  className={cn(
                    type.caption,
                    "font-bold uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  How {tree.teamAbbr} built the outbound package
                </p>
                <div className="flex flex-wrap items-start justify-center gap-6">
                  {tree.ancestry.map((node) => (
                    <div
                      key={node.id}
                      className="flex flex-col items-center gap-2"
                    >
                      <TreeNodeView node={node} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-start justify-center gap-4">
              {tree.rootCounterparties.map((cp) => (
                <HaulBox
                  key={cp.eventId + cp.teamAbbr}
                  teamId={cp.teamId}
                  teamAbbr={cp.teamAbbr}
                  assets={cp.assets.length ? cp.assets : tree.rootSent}
                />
              ))}
              {tree.rootCounterparties.length === 0 &&
              tree.rootSent.length > 0 ? (
                <div className="min-w-[11.5rem] max-w-[16rem] rounded-md border border-dashed border-border px-3 py-2">
                  <p
                    className={cn(
                      type.caption,
                      "font-bold uppercase text-muted-foreground"
                    )}
                  >
                    Sent
                  </p>
                  <ul className="mt-1">
                    {tree.rootSent.map((a) => (
                      <AssetLine key={a.id} asset={a} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-center">
              <div className="h-5 w-px bg-foreground/35" />
              <p
                className={cn(
                  type.caption,
                  "font-bold uppercase tracking-wide text-muted-foreground"
                )}
              >
                {tree.teamAbbr} return · forward genealogy
              </p>
              <div className="h-5 w-px bg-foreground/35" />
            </div>

            <TreeNodeView node={tree.root} />
          </div>
        )}

        <p className={cn(type.caption, "mt-5 text-muted-foreground")}>
          {tree.disclaimer}
        </p>
      </div>
    </section>
  );
}

export function TradeTreePrompt({
  teams,
  offseasonYear,
}: {
  teams: TeamOption[];
  offseasonYear: number;
}) {
  return (
    <section className="sports-card pointer-events-auto relative z-10 flex flex-col gap-3 p-4 sm:p-5">
      <TradeTreeAskBar teams={teams} offseasonYear={offseasonYear} />
    </section>
  );
}


