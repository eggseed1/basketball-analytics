import Link from "next/link";

import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import {
  formatRecordDate,
  formatRecordValue,
  type BookRecord,
  type BookShape,
  type RecordBook,
  type RecordLeader,
  type RecordScope,
} from "@/lib/record-book";
import { cn } from "@/lib/utils";

const VIEWS: Array<{ id: string; label: string; group?: BookRecord["group"]; scope?: RecordScope; shapes?: boolean }> = [
  { id: "front", label: "Front" },
  { id: "games", label: "Games", group: "game", scope: "regular" },
  { id: "playoff-games", label: "Playoff games", group: "game", scope: "playoffs" },
  { id: "seasons", label: "Seasons", group: "season", scope: "regular" },
  { id: "playoff-seasons", label: "Playoff seasons", group: "season", scope: "playoffs" },
  { id: "streaks", label: "Streaks", group: "streak" },
  { id: "teams", label: "Teams", group: "team-game" },
  { id: "team-seasons", label: "Team seasons", group: "team-season" },
  { id: "since", label: "Careers", group: "career" },
  { id: "rare", label: "Rare lines", shapes: true },
];

const FRONT_IDS = [
  "regular-game-pts",
  "regular-game-reb",
  "regular-game-ast",
  "regular-game-stl",
  "regular-game-blk",
  "regular-game-fg3m",
  "regular-game-pra",
  "regular-season-ppg",
  "regular-season-td",
  "regular-season-g50",
  "regular-streak-pts30",
  "regular-team-win-streak",
  "regular-team-margin",
  "regular-team-pts",
  "career-pts",
  "career-td",
];

function viewHref(id: string): string {
  return id === "front" ? "/history/records" : `/history/records?view=${id}`;
}

function playerHref(leader: RecordLeader): string | null {
  const index = getBundledPlayerIdAliasIndex();
  if (leader.playerId) {
    const alias = index.byNba.get(leader.playerId);
    if (alias) return `/players/${alias.espnPlayerId}`;
  }
  if (leader.brefId) {
    const alias = index.byBref?.get(leader.brefId.toLowerCase());
    if (alias) return `/players/${alias.espnPlayerId}`;
  }
  return null;
}

function LeaderName({ leader }: { leader: RecordLeader }) {
  const href = playerHref(leader);
  const label = leader.name || leader.team;
  if (!href) return <span className="font-semibold">{label}</span>;
  return (
    <Link href={href} className="font-semibold underline-offset-2 hover:underline">
      {label}
    </Link>
  );
}

function LeaderMeta({ leader }: { leader: RecordLeader }) {
  if (!leader.date) {
    return <p className="text-[12.5px] leading-snug text-muted-foreground">{leader.detail || leader.season}</p>;
  }
  const when = formatRecordDate(leader.date);
  const game = leader.gameId ? (
    <Link
      href={`/games/${encodeURIComponent(leader.gameId)}?season=${encodeURIComponent(leader.season)}`}
      className="underline-offset-2 hover:underline"
    >
      {when}
    </Link>
  ) : (
    <span>{when}</span>
  );
  return (
    <p className="text-[12.5px] leading-snug text-muted-foreground">
      {leader.detail} · {game}
    </p>
  );
}

function RecordCard({ rec }: { rec: BookRecord }) {
  const top = rec.leaders[0];
  if (!top) return null;
  const rest = rec.leaders.slice(1, 6);
  return (
    <article className="sports-card flex flex-col gap-2 px-4 py-3.5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{rec.title}</h3>
      <p className="text-[32px] font-bold leading-none tabular-nums tracking-tight">
        {formatRecordValue(top.value, rec.decimals)}
      </p>
      <p className="text-[15px]">
        <LeaderName leader={top} />
        {top.team ? <span className="text-muted-foreground"> · {top.team}</span> : null}
      </p>
      <LeaderMeta leader={top} />
      {rest.length ? (
        <ol className="mt-1 flex flex-col gap-1.5 border-t border-border/70 pt-2">
          {rest.map((leader, index) => (
            <li key={`${leader.playerId}-${leader.gameId}-${leader.date}-${index}`} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">
                <span className="mr-1.5 tabular-nums text-muted-foreground">{index + 2}</span>
                <LeaderName leader={leader} />
                {leader.team ? <span className="text-muted-foreground"> · {leader.team}</span> : null}
                {leader.season && !leader.detail.includes(leader.season) ? <span className="text-muted-foreground"> · {leader.season}</span> : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatRecordValue(leader.value, rec.decimals)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="text-[12px] leading-snug text-muted-foreground">{rec.blurb}</p>
    </article>
  );
}

function ShapeCard({ shape }: { shape: BookShape }) {
  const top = shape.examples[0];
  return (
    <article className="sports-card flex flex-col gap-2 px-4 py-3.5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{shape.title}</h3>
      <p className="text-[32px] font-bold leading-none tabular-nums tracking-tight">{shape.count}</p>
      <p className="text-[13px] text-muted-foreground">
        {shape.count === 1 ? "Game" : "Games"}
        {shape.window ? ` ${shape.window}` : " in this book"}
      </p>
      {top ? (
        <p className="text-[14px]">
          High mark: <LeaderName leader={top} />
          <span className="text-muted-foreground"> · {formatRecordValue(top.value, 0)}</span>
        </p>
      ) : null}
      {shape.examples.slice(0, 4).length ? (
        <ul className="flex flex-col gap-1 border-t border-border/70 pt-2 text-[13px]">
          {shape.examples.slice(0, 4).map((leader, index) => (
            <li key={`${leader.gameId}-${index}`} className="truncate">
              <LeaderName leader={leader} />
              <span className="text-muted-foreground"> · {leader.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function RecordBookBoard({ book, view }: { book: RecordBook; view: string }) {
  const current = VIEWS.find((item) => item.id === view) ?? VIEWS[0]!;
  const byId = new Map(book.records.map((rec) => [rec.id, rec]));
  let records: BookRecord[] = [];
  let shapes: BookShape[] = [];
  if (current.id === "front") {
    records = FRONT_IDS.map((id) => byId.get(id)).filter((rec): rec is BookRecord => Boolean(rec));
  } else if (current.shapes) {
    shapes = [...book.shapes].sort((a, b) => a.count - b.count || a.title.localeCompare(b.title));
  } else if (current.group === "streak") {
    records = book.records.filter((rec) => rec.group === "streak");
  } else if (current.group === "team-game") {
    records = book.records.filter((rec) => rec.group === "team-game" || rec.id.endsWith("team-win-streak"));
  } else if (current.group) {
    records = book.records.filter((rec) => rec.group === current.group && (!current.scope || rec.scope === current.scope));
  }

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-1.5" aria-label="Record book sections">
        {VIEWS.map((item) => (
          <Link
            key={item.id}
            href={viewHref(item.id)}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-semibold",
              item.id === current.id ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
            aria-current={item.id === current.id ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {records.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((rec) => (
            <li key={rec.id}>
              <RecordCard rec={rec} />
            </li>
          ))}
        </ul>
      ) : null}
      {shapes.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shapes.map((shape) => (
            <li key={shape.id}>
              <ShapeCard shape={shape} />
            </li>
          ))}
        </ul>
      ) : null}
      {!records.length && !shapes.length ? (
        <p className="text-[14px] text-muted-foreground">Nothing in this section yet.</p>
      ) : null}
    </div>
  );
}
