import Link from "next/link";

import { acquisitionHref } from "@/components/acquisitions/acquisition-story";
import { TreeScroller } from "@/components/acquisitions/tree-scroller";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";
import type { AcquisitionStory, Arrival, ForwardNode, OriginNode, PathAsset } from "@/trades/acquisition-types";
import { teamNameAt } from "@/trades/team-era-names";

type Names = Record<string, string>;

function monthYear(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function exitText(node: ForwardNode, names: Names): string {
  const d = node.departure;
  const team = (id: string, date?: string) => teamNameAt(id, date, names);
  switch (d.how) {
    case "trade":
      return `${d.toTeamId ? `Traded to the ${team(d.toTeamId, d.date)}` : "Traded"} · ${monthYear(d.date)}`;
    case "waived":
      return `Waived · ${monthYear(d.date)}`;
    case "left":
      return `${d.via === "claim" ? "Claimed by" : "Signed with"} the ${team(d.toTeamId, d.date)} · ${monthYear(d.date)}`;
    case "next-seen":
      return `Next seen with the ${team(d.teamId, d.date)} · ${monthYear(d.date)}`;
    case "used":
      return d.candidates.length === 1
        ? `Used on ${d.candidates[0]!.label}, ${ordinal(d.candidates[0]!.pick)} in ${d.year}`
        : `Used in the ${d.year} draft`;
    case "pending":
      return `${d.year} draft still to come`;
    case "here":
      return "On the roster now";
    default:
      return "Trail ends in the log";
  }
}

function arrivalText(a: Arrival, teamId: string, names: Names, assetKey: string): string {
  const drafted = a.how === "draft" || a.how === "signing" || a.how === "first-seen" ? a.draftedBy : undefined;
  if (drafted) return `Drafted ${ordinal(drafted.pick)} in ${drafted.year} by the ${teamNameAt(drafted.teamId, `${drafted.year}-06-26`, names)}`;
  switch (a.how) {
    case "trade":
      return `${a.fromTeamId ? `From the ${teamNameAt(a.fromTeamId, a.date, names)}` : "In a trade"} · ${monthYear(a.date)}`;
    case "draft":
      return a.draft ? `Drafted ${ordinal(a.draft.pick)} in ${a.draft.year}` : `Drafted in ${a.date.slice(0, 4)}`;
    case "signing":
      return `Signed · ${monthYear(a.date)}`;
    case "claim":
      return `Claimed off waivers · ${monthYear(a.date)}`;
    case "first-seen":
      return `First logged · ${monthYear(a.date)}`;
    default:
      return assetKey.startsWith("pick:") ? "Likely their own pick" : "Arrival not logged";
  }
}

function AssetCard({
  asset,
  teamId,
  detail,
  primary = false,
}: {
  asset: PathAsset;
  teamId: string;
  detail: string;
  primary?: boolean;
}) {
  return (
    <div
      data-primary={primary || undefined}
      className={cn(
        "flex w-52 shrink-0 items-start gap-2 rounded-md border bg-card/80 px-2.5 py-2",
        primary ? "border-foreground/40 shadow-sm ring-1 ring-foreground/10" : "border-border/70"
      )}
    >
      {asset.playerId ? (
        <PlayerHeadshot playerId={asset.playerId} name={asset.label} teamKey={teamId} size="xs" className="mt-0.5 shrink-0" />
      ) : (
        <span
          aria-hidden
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-[10px] font-semibold text-muted-foreground"
        >
          {asset.nonPlayer ? "Pk" : asset.label.charAt(0)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {asset.playerId ? (
          <Link
            href={acquisitionHref(teamId, asset)}
            className={cn(type.bodySm, "block truncate font-semibold leading-snug underline-offset-2 hover:underline")}
            title={asset.label}
          >
            {asset.label}
          </Link>
        ) : (
          <span className={cn(type.bodySm, "block leading-snug", !asset.nonPlayer && "font-semibold")} title={asset.label}>
            {asset.label.charAt(0).toUpperCase() + asset.label.slice(1)}
          </span>
        )}
        <span className={cn(type.caption, "block leading-snug text-muted-foreground")}>{detail}</span>
      </div>
      <TeamLogo teamKey={teamId} size="xs" className="mt-0.5 shrink-0 opacity-80" />
    </div>
  );
}

const STUB = "w-5 shrink-0 border-t border-border";
const RIGHT_ITEM =
  "relative py-1 pl-5 before:absolute before:inset-y-0 before:left-0 before:border-l before:border-border first:before:top-1/2 last:before:bottom-1/2 after:absolute after:left-0 after:top-1/2 after:w-5 after:border-t after:border-border";
const LEFT_ITEM =
  "relative py-1 pr-5 before:absolute before:inset-y-0 before:right-0 before:border-l before:border-border first:before:top-1/2 last:before:bottom-1/2 after:absolute after:right-0 after:top-1/2 after:w-5 after:border-t after:border-border";

function ForwardBranch({ node, names, primary = false }: { node: ForwardNode; names: Names; primary?: boolean }) {
  return (
    <div className="flex items-center">
      <AssetCard asset={node.asset} teamId={node.teamId} detail={exitText(node, names)} primary={primary} />
      {node.next.length ? (
        <>
          <span aria-hidden className={STUB} />
          <ul className="flex flex-col">
            {node.next.map((child) => (
              <li key={`${child.asset.key}-${child.since}`} className={RIGHT_ITEM}>
                <ForwardBranch node={child} names={names} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function OriginBranch({ node, names }: { node: OriginNode; names: Names }) {
  return (
    <div className="flex flex-row-reverse items-center">
      <AssetCard
        asset={node.asset}
        teamId={node.teamId}
        detail={node.repeat ? "Same trade as a piece above" : arrivalText(node.arrival, node.teamId, names, node.asset.key)}
      />
      {node.origins.length ? (
        <>
          <span aria-hidden className={STUB} />
          <ul className="flex flex-col">
            {node.origins.map((child) => (
              <li key={child.asset.key} className={LEFT_ITEM}>
                <OriginBranch node={child} names={names} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function ArrivalHub({ story, names }: { story: AcquisitionStory; names: Names }) {
  const a = story.arrival;
  const label =
    a.how === "trade" ? "Trade" : a.how === "draft" ? "Draft" : a.how === "signing" ? "Signing" : a.how === "claim" ? "Waiver claim" : a.how === "first-seen" ? "First logged" : "Arrival";
  return (
    <div className="flex w-36 shrink-0 flex-col items-center gap-1 rounded-full border border-dashed border-foreground/30 bg-foreground/[0.03] px-3 py-2 text-center">
      <span className="flex items-center gap-1">
        {a.how === "trade" && a.fromTeamId ? (
          <>
            <TeamLogo teamKey={a.fromTeamId} size="xs" />
            <span aria-hidden className="text-muted-foreground">→</span>
          </>
        ) : null}
        <TeamLogo teamKey={story.teamId} size="xs" />
      </span>
      <span className={cn(type.caption, "font-semibold uppercase tracking-wide")}>{label}</span>
      {"date" in a ? (
        <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>{monthYear(a.date)}</span>
      ) : null}
    </div>
  );
}

/** Left to right: what the team gave up and where it came from, the move, then where he led. */
export function AcquisitionTree({ story, names }: { story: AcquisitionStory; names: Names }) {
  return (
    <TreeScroller className="overflow-x-auto rounded-md border border-border/60 bg-foreground/[0.015] p-3 sm:p-4">
      <div className="flex w-max min-w-full items-center">
        {story.origins.length ? (
          <>
            <ul className="flex flex-col">
              {story.origins.map((node) => (
                <li key={node.asset.key} className={LEFT_ITEM}>
                  <OriginBranch node={node} names={names} />
                </li>
              ))}
            </ul>
            <span aria-hidden className={STUB} />
          </>
        ) : null}
        <ArrivalHub story={story} names={names} />
        <span aria-hidden className={STUB} />
        <ForwardBranch node={story.afterwards} names={names} primary />
      </div>
    </TreeScroller>
  );
}
