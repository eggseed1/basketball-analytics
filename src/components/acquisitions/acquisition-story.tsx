import Link from "next/link";
import type { ReactNode } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { DealSides } from "@/components/movement/movement-cluster-card";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import type {
  AcquisitionStory,
  Arrival,
  Departure,
  DraftCandidate,
  DraftedBy,
  DraftSlot,
  ForwardNode,
  OriginNode,
  PathAsset,
  PathDeal,
  TeamAcquisitionEntry,
} from "@/trades/acquisition-types";
import { teamNameAt } from "@/trades/team-era-names";

type Names = Record<string, string>;

export function formatPlainDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function sentenceCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function acquisitionHref(teamId: string, asset: { label: string; playerId?: string }, since?: string): string {
  const params = new URLSearchParams({ team: teamId, player: asset.playerId ?? asset.label });
  if (since) params.set("since", since);
  return `/acquisitions?${params.toString()}`;
}

function AssetName({ asset, teamId, lead = false }: { asset: PathAsset; teamId: string; lead?: boolean }) {
  if (asset.playerId) {
    return (
      <Link href={acquisitionHref(teamId, asset)} className="font-semibold underline-offset-2 hover:underline">
        {asset.label}
      </Link>
    );
  }
  if (asset.nonPlayer) return <span>{lead ? sentenceCase(asset.label) : asset.label}</span>;
  return <span className="font-semibold">{asset.label}</span>;
}

function AssetList({ assets, teamId, more = 0 }: { assets: PathAsset[]; teamId: string; more?: number }) {
  const count = assets.length + (more ? 1 : 0);
  const separator = (i: number) => (i === 0 ? null : i === count - 1 ? (count > 2 ? ", and " : " and ") : ", ");
  return (
    <>
      {assets.map((asset, i) => (
        <span key={`${asset.key}-${i}`}>
          {separator(i)}
          <AssetName asset={asset} teamId={teamId} />
        </span>
      ))}
      {more ? (
        <>
          {separator(assets.length)}
          {more} more
        </>
      ) : null}
    </>
  );
}

function pickPronoun(asset: PathAsset): string {
  return asset.playerId || !asset.nonPlayer ? "him" : "it";
}

function CandidateList({ candidates }: { candidates: DraftCandidate[] }) {
  return (
    <>
      {candidates.map((c, i) => (
        <span key={`${c.label}-${c.pick}`}>
          {i === 0 ? null : i === candidates.length - 1 ? " and " : ", "}
          {c.playerId ? (
            <Link href={`/players/${c.playerId}`} className="font-semibold underline-offset-2 hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className="font-semibold">{c.label}</span>
          )}{" "}
          ({ordinal(c.pick)})
        </span>
      ))}
    </>
  );
}

function draftSlotText(d: DraftSlot): string {
  return `${ordinal(d.pick)} in ${d.year}${d.round === 2 ? " (second round)" : ""}`;
}

/** Plain one-liner for origin rows and player pages. */
function draftedElsewhereLine(drafted: DraftedBy, firstLogged: string, names: Names, where = "here"): string {
  const drafter = teamNameAt(drafted.teamId, `${drafted.year}-06-26`, names);
  const swapped = (drafted.swappedFor ?? []).map((c) => c.label);
  const swap = swapped.length
    ? `, likely swapped for ${swapped.length > 1 ? `${swapped.slice(0, -1).join(", ")} and ${swapped.at(-1)}` : swapped[0]} on draft night`
    : "";
  return `Drafted ${draftSlotText(drafted)} by the ${drafter}${swap}. First logged ${where} on ${formatPlainDate(firstLogged)}.`;
}

function draftedByOf(a: Arrival): DraftedBy | undefined {
  return a.how === "draft" || a.how === "signing" || a.how === "first-seen" ? a.draftedBy : undefined;
}

/** Another team's pick: who drafted him and any pick that likely went the other way. */
function DraftedElsewhere({
  drafted,
  teamId,
  arrivedOn,
  player,
  names,
}: {
  drafted: DraftedBy;
  teamId: string;
  arrivedOn: string;
  player: ReactNode;
  names: Names;
}) {
  const drafter = teamNameAt(drafted.teamId, `${drafted.year}-06-26`, names);
  const team = teamNameAt(teamId, arrivedOn, names);
  const swapped = drafted.swappedFor ?? [];
  return swapped.length ? (
    <>
      The {drafter} drafted {player} {draftSlotText(drafted)}, and the {team} likely got him in a draft-night swap for{" "}
      {swapped.map((c) => c.label).join(" and ")}.
    </>
  ) : (
    <>
      The {drafter} drafted {player} {draftSlotText(drafted)}. The log doesn&apos;t show how he got to the {team}.
    </>
  );
}

/** Evidence under the answer when another team drafted him. */
export function AnswerNote({ story, names }: { story: AcquisitionStory; names: Names }) {
  const a = story.arrival;
  const drafted = draftedByOf(a);
  if (!drafted || a.how === "unknown") return null;
  const team = teamNameAt(story.teamId, a.date, names);
  const draftTeam = teamNameAt(story.teamId, `${drafted.year}-06-26`, names);
  const drafter = teamNameAt(drafted.teamId, `${drafted.year}-06-26`, names);
  const lastName = story.player.label.split(" ").slice(1).join(" ") || story.player.label;
  const swapped = drafted.swappedFor ?? [];
  const date = formatPlainDate(a.date);
  const firstMove = a.how === "draft" ? "signing his rookie deal" : a.how === "signing" ? "signing" : "re-signing";
  return (
    <p className={cn(type.bodySm, "max-w-2xl text-muted-foreground")}>
      {swapped.length ? (
        <>
          <CandidateList candidates={swapped} /> {swapped.length === 1 ? "was the" : "were the"} {possessive(draftTeam)}{" "}
          {swapped.length === 1 ? "pick" : "picks"} that year and first {swapped.length === 1 ? "shows" : "show"} up
          with the {drafter}. The log doesn&apos;t record the trade and first mentions {lastName} with the {team}{" "}
          {firstMove} on {date}.
        </>
      ) : (
        `The log first mentions ${lastName} with the ${team} ${firstMove} on ${date}.`
      )}
    </p>
  );
}

export function AnswerSentence({ story, names }: { story: AcquisitionStory; names: Names }) {
  const a = story.arrival;
  const team = teamNameAt(story.teamId, "date" in a ? a.date : undefined, names);
  const player = <span className="font-semibold">{story.player.label}</span>;
  if (a.how === "trade") {
    const from = a.fromTeamId ? <> from the {teamNameAt(a.fromTeamId, a.date, names)}</> : <> in a trade</>;
    const shown = a.gave.length > 3 ? a.gave.slice(0, 2) : a.gave;
    const more = a.gave.length - shown.length;
    return (
      <>
        The {team} got {player}
        {from} on {formatPlainDate(a.date)}
        {a.gave.length ? (
          <>
            {" "}
            for <AssetList assets={shown} teamId={story.teamId} more={more} />.
          </>
        ) : (
          <>. The log doesn&apos;t list what they sent back.</>
        )}
      </>
    );
  }
  const drafted = draftedByOf(a);
  if (drafted && a.how !== "unknown") {
    return <DraftedElsewhere drafted={drafted} teamId={story.teamId} arrivedOn={a.date} player={player} names={names} />;
  }
  if (a.how === "draft") {
    if (a.draft) {
      const round = a.draft.round === 2 ? " (second round)" : "";
      return (
        <>
          The {team} drafted {player} with the {ordinal(a.draft.pick)} pick{round} in {a.draft.year}.
        </>
      );
    }
    return (
      <>
        The {team} drafted {player} in {a.date.slice(0, 4)}.
      </>
    );
  }
  if (a.how === "signing") {
    return (
      <>
        The {team} signed {player} on {formatPlainDate(a.date)}.
      </>
    );
  }
  if (a.how === "claim") {
    return (
      <>
        The {team} claimed {player} off waivers on {formatPlainDate(a.date)}.
      </>
    );
  }
  if (a.how === "first-seen") {
    return (
      <>
        The log doesn&apos;t show how the {team} got {player}. It first mentions him re-signing on{" "}
        {formatPlainDate(a.date)}.
      </>
    );
  }
  return (
    <>
      The log doesn&apos;t show how the {team} got {player}.
    </>
  );
}

export function StoryDeal({ deal, names }: { deal: PathDeal; names: Names }) {
  return (
    <DealSides
      compact={false}
      deal={{
        date: deal.date,
        sides: deal.sides.map((s) => ({
          teamId: s.teamId,
          teamName: teamNameAt(s.teamId, deal.date, names),
          receives: s.receives,
        })),
        ...(deal.unconfirmed ? { unconfirmed: deal.unconfirmed } : {}),
      }}
    />
  );
}

function DepartureLine({ node, names }: { node: ForwardNode; names: Names }) {
  const d: Departure = node.departure;
  const team = (id: string, date?: string) => teamNameAt(id, date, names);
  const holder = team(node.teamId, "date" in d ? d.date : undefined);
  switch (d.how) {
    case "trade":
      return (
        <>
          Traded{d.toTeamId ? ` to the ${team(d.toTeamId, d.date)}` : ""} on {formatPlainDate(d.date)}
          {d.got.length ? (
            <>
              {" "}
              for <AssetList assets={d.got} teamId={node.teamId} />.
            </>
          ) : (
            <>. The log doesn&apos;t list anything coming back to the {holder}.</>
          )}
        </>
      );
    case "waived":
      return <>Waived on {formatPlainDate(d.date)}.</>;
    case "left":
      return (
        <>
          {d.via === "claim" ? "Claimed off waivers by" : "Signed with"} the {team(d.toTeamId, d.date)} on{" "}
          {formatPlainDate(d.date)}.
        </>
      );
    case "next-seen":
      return (
        <>
          Next shows up with the {team(d.teamId, d.date)} on {formatPlainDate(d.date)}. The log doesn&apos;t say how{" "}
          {pickPronoun(node.asset) === "it" ? "it" : "he"} left.
        </>
      );
    case "used": {
      const owner = team(node.teamId, `${d.year}-06-26`);
      const round = d.round === 1 ? "first-round" : "second-round";
      const joined = <CandidateList candidates={d.candidates} />;
      if (!d.candidates.length) {
        return (
          <>
            No trade of this pick shows up in the log. Our draft data doesn&apos;t list the {possessive(owner)}{" "}
            {d.year} {round} picks.
          </>
        );
      }
      return d.candidates.length === 1 ? (
        <>
          No trade of this pick shows up in the log. The {possessive(owner)} {d.year} {round} pick was {joined}.
        </>
      ) : (
        <>
          No trade of this pick shows up in the log. The {possessive(owner)} {d.year} {round} picks were {joined}
          . The log doesn&apos;t say which one came from this pick.
        </>
      );
    }
    case "pending":
      return <>Still unused. The {d.year} draft hasn&apos;t happened yet.</>;
    case "here":
      return <>Still on the {holder} roster.</>;
    default:
      return <>The log doesn&apos;t show where {pickPronoun(node.asset) === "it" ? "it" : "he"} went next.</>;
  }
}

function possessive(name: string) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function NodeAvatar({ asset, teamId }: { asset: PathAsset; teamId: string }) {
  if (asset.playerId) {
    return <PlayerHeadshot playerId={asset.playerId} name={asset.label} teamKey={teamId} size="xs" />;
  }
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-[10px] font-semibold text-muted-foreground"
    >
      {asset.nonPlayer ? "Pk" : asset.label.charAt(0)}
    </span>
  );
}

function ForwardItem({ node, names, root = false }: { node: ForwardNode; names: Names; root?: boolean }) {
  return (
    <li className={cn("relative flex flex-col gap-1", !root && "pl-4")}>
      {!root ? <span aria-hidden className="absolute left-0 top-3 h-px w-3 bg-border" /> : null}
      <div className="flex items-start gap-2">
        <NodeAvatar asset={node.asset} teamId={node.teamId} />
        <p className={cn(type.bodySm, "leading-snug")}>
          <AssetName asset={node.asset} teamId={node.teamId} lead />
          <span className="text-muted-foreground">
            {" "}
            <DepartureLine node={node} names={names} />
          </span>
        </p>
      </div>
      {node.next.length ? (
        <ol className="ml-3 flex flex-col gap-2 border-l border-border/70 pt-1">
          {node.next.map((child) => (
            <ForwardItem key={`${child.asset.key}-${child.since}`} node={child} names={names} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export function WhereItLed({ story, names }: { story: AcquisitionStory; names: Names }) {
  return (
    <ol className="flex flex-col gap-2">
      <ForwardItem node={story.afterwards} names={names} root />
    </ol>
  );
}

function ArrivalLine({ node, names }: { node: OriginNode; names: Names }) {
  const a: Arrival = node.arrival;
  if (node.repeat) return <>Came over in the same trade as a piece listed above.</>;
  const team = teamNameAt(node.teamId, "date" in a ? a.date : undefined, names);
  const drafted = draftedByOf(a);
  if (drafted && a.how !== "unknown") return <>{draftedElsewhereLine(drafted, a.date, names)}</>;
  switch (a.how) {
    case "trade":
      return (
        <>
          Came {a.fromTeamId ? `from the ${teamNameAt(a.fromTeamId, a.date, names)}` : "in a trade"} on{" "}
          {formatPlainDate(a.date)}
          {a.gave.length ? (
            <>
              {" "}
              for <AssetList assets={a.gave} teamId={node.teamId} />.
            </>
          ) : (
            "."
          )}
        </>
      );
    case "draft":
      return a.draft ? (
        <>
          Drafted {ordinal(a.draft.pick)} in {a.draft.year}
          {a.draft.round === 2 ? " (second round)" : ""}.
        </>
      ) : (
        <>Drafted in {a.date.slice(0, 4)}.</>
      );
    case "signing":
      return <>Signed on {formatPlainDate(a.date)}.</>;
    case "claim":
      return <>Claimed off waivers on {formatPlainDate(a.date)}.</>;
    case "first-seen":
      return <>Arrival not logged. First mentioned re-signing on {formatPlainDate(a.date)}.</>;
    default:
      if (node.asset.key.startsWith("pick:")) {
        return <>The log shows no trade bringing this pick in, so it was likely the {possessive(team)} own.</>;
      }
      return (
        <>
          The log doesn&apos;t show how the {team} got {pickPronoun(node.asset)}.
        </>
      );
  }
}

function OriginItem({ node, names }: { node: OriginNode; names: Names }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <NodeAvatar asset={node.asset} teamId={node.teamId} />
        <p className={cn(type.bodySm, "leading-snug")}>
          <AssetName asset={node.asset} teamId={node.teamId} lead />
          <span className="text-muted-foreground">
            {" "}
            <ArrivalLine node={node} names={names} />
          </span>
        </p>
      </div>
      {node.origins.length ? (
        <ul className="ml-3 flex flex-col gap-2 border-l border-border/70 pl-4 pt-1">
          {node.origins.map((child) => (
            <OriginItem key={child.asset.key} node={child} names={names} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OutgoingOrigins({ story, names }: { story: AcquisitionStory; names: Names }) {
  if (!story.origins.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {story.origins.map((node) => (
        <OriginItem key={node.asset.key} node={node} names={names} />
      ))}
    </ul>
  );
}

const HOW_LABEL: Record<TeamAcquisitionEntry["how"], string> = {
  trade: "Trade",
  draft: "Draft",
  signing: "Signed",
  claim: "Waiver claim",
  "first-seen": "First logged",
};

/** One-line arrival summary for player pages. */
export function PlayerArrivalLine({
  teamId,
  arrival,
  player,
  names,
}: {
  teamId: string;
  arrival: Arrival;
  player: { label: string; playerId?: string };
  names: Names;
}) {
  if (arrival.how === "unknown") return null;
  const team = teamNameAt(teamId, arrival.date, names);
  const date = formatPlainDate(arrival.date);
  const drafted = draftedByOf(arrival);
  const text = drafted
    ? draftedElsewhereLine(drafted, arrival.date, names, `with the ${team}`)
    : arrival.how === "trade"
      ? `Joined the ${team} in a trade${arrival.fromTeamId ? ` with the ${teamNameAt(arrival.fromTeamId, arrival.date, names)}` : ""} on ${date}.`
      : arrival.how === "draft"
        ? arrival.draft
          ? `Drafted by the ${team} with the ${ordinal(arrival.draft.pick)} pick in ${arrival.draft.year}.`
          : `Drafted by the ${team} in ${arrival.date.slice(0, 4)}.`
        : arrival.how === "signing"
          ? `Signed with the ${team} on ${date}.`
          : arrival.how === "claim"
            ? `Claimed off waivers by the ${team} on ${date}.`
            : `With the ${team} since at least ${date}. The log doesn't show how he arrived.`;
  return (
    <p className={cn(type.caption, "text-muted-foreground")}>
      {text}{" "}
      <Link
        href={acquisitionHref(teamId, player, arrival.date)}
        className="font-semibold text-foreground/90 underline-offset-2 hover:underline"
      >
        How they got him →
      </Link>
    </p>
  );
}

export function RosterArrivals({
  teamId,
  onRoster,
  notLogged,
}: {
  teamId: string;
  onRoster: TeamAcquisitionEntry[];
  notLogged: Array<{ playerId: string; name: string }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {onRoster.length ? <AcquisitionEntryList teamId={teamId} entries={onRoster} /> : null}
      {notLogged.length ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Arrival not in the log yet:{" "}
          {notLogged.map((p, i) => (
            <span key={p.playerId}>
              {i > 0 ? ", " : null}
              <Link href={`/players/${p.playerId}`} className="font-semibold text-foreground/90 underline-offset-2 hover:underline">
                {p.name}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}
    </div>
  );
}

export function AcquisitionEntryList({
  teamId,
  entries,
  dense = false,
}: {
  teamId: string;
  entries: TeamAcquisitionEntry[];
  dense?: boolean;
}) {
  return (
    <ul className={cn("grid gap-1.5", !dense && "sm:grid-cols-2 lg:grid-cols-3")}>
      {entries.map((entry) => (
        <li key={`${entry.key}-${entry.date}`}>
          <Link
            href={acquisitionHref(teamId, entry, entry.date)}
            className="flex items-center gap-2 rounded-md border border-border/60 frost-surface-muted px-2.5 py-1.5 hover:border-foreground/30"
          >
            {entry.playerId ? (
              <PlayerHeadshot playerId={entry.playerId} name={entry.label} teamKey={teamId} size="xs" />
            ) : (
              <TeamLogo teamKey={teamId} size="xs" />
            )}
            <span className={cn(type.bodySm, "min-w-0 flex-1 font-semibold leading-snug")}>{entry.label}</span>
            <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>
              {HOW_LABEL[entry.how]} · {entry.how === "draft" ? entry.date.slice(0, 4) : formatPlainDate(entry.date)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
