"use client";

import { useState, type ReactNode } from "react";

import type { GmDraftPick, GmLeagueState, GmPlayer, GmTeam } from "@/gm/types";
import { formatNumber } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

function seasonLabel(endYear: number): string {
  return `${endYear - 1}-${String(endYear).slice(2)}`;
}

function optionMark(option?: "player" | "team" | null): string {
  if (option === "player") return "PO";
  if (option === "team") return "TO";
  return "";
}

function money(value: number): string {
  return `$${formatNumber(value, 1)}M`;
}

export function GmBooks({
  league,
  team,
  summary,
}: {
  league: GmLeagueState;
  team: GmTeam;
  summary: ReactNode;
}) {
  const [view, setView] = useState<"summary" | "contracts" | "picks">("contracts");
  const players = league.players
    .filter((player) => player.teamId === team.id && player.contract)
    .sort((a, b) => (b.contract?.annualSalaryM ?? 0) - (a.contract?.annualSalaryM ?? 0));
  const seasons = [
    ...new Set(players.flatMap((player) => player.contract?.years?.map((year) => year.season) ?? [])),
  ].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Salary and assets">
        {(
          [
            ["summary", "Summary"],
            ["contracts", "Contracts"],
            ["picks", "Draft picks"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-semibold",
              view === id ? "bg-foreground text-background" : "text-muted-foreground"
            )}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "summary" ? summary : null}
      {view === "contracts" ? <ContractGrid players={players} seasons={seasons} /> : null}
      {view === "picks" ? <PickBook team={team} /> : null}
    </div>
  );
}

function ContractGrid({ players, seasons }: { players: GmPlayer[]; seasons: number[] }) {
  if (!seasons.length) {
    return <p className="text-sm text-muted-foreground">No published contract grid for this club.</p>;
  }
  const notes = players.filter((player) => player.contract?.note);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Player</th>
              {seasons.map((season) => (
                <th key={season} className="px-3 py-2">
                  {seasonLabel(season)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((player) => (
              <tr key={player.id}>
                <td className="px-3 py-2 font-medium">{player.name}</td>
                {seasons.map((season) => {
                  const cell = player.contract?.years?.find((year) => year.season === season);
                  const mark = optionMark(cell?.option);
                  return (
                    <td key={season} className="px-3 py-2 tabular-nums">
                      {cell ? (
                        <>
                          {money(cell.salaryM)}
                          {mark ? <span className="ml-1 text-xs text-muted-foreground">{mark}</span> : null}
                          {cell.guaranteed === false ? (
                            <span className="ml-1 text-xs text-muted-foreground">NG</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        A blank cell is a season with no contract. PO is a player option, TO is a team option, NG is not guaranteed.
      </p>
      {notes.length ? (
        <ul className="flex flex-col gap-2 text-sm">
          {notes.map((player) => (
            <li key={player.id}>
              <span className="font-semibold">{player.name}. </span>
              {player.contract?.note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function pickLine(pick: GmDraftPick): string {
  const origin = resolveTeamBrand(pick.originalTeamId)?.abbr ?? pick.originalTeamId.toUpperCase();
  const swap = pick.swapWithTeamId ? resolveTeamBrand(pick.swapWithTeamId)?.abbr : null;
  const round = pick.round === 1 ? "1st" : "2nd";
  return `${pick.season} ${round} · ${origin}${swap ? ` swap ${swap}` : ""}`;
}

function PickBook({ team }: { team: GmTeam }) {
  const held = [...team.draftPicks].sort((a, b) => a.season - b.season || a.round - b.round);
  const owed = [...(team.owedPicks ?? [])].sort((a, b) => a.season - b.season || a.round - b.round);
  return (
    <div className="flex flex-col gap-4">
      <PickList title="Picks this club holds" picks={held} empty="No future picks on the book." />
      <PickList title="Picks owed out" picks={owed} empty="This club has not conveyed a future pick." />
      <p className="text-xs text-muted-foreground">
        Held picks can be traded. Owed picks stay on the ledger. Terms are the published conveyance.
      </p>
    </div>
  );
}

function PickList({ title, picks, empty }: { title: string; picks: GmDraftPick[]; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {picks.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {picks.map((pick) => (
            <li key={pick.id}>
              <span className="font-medium">{pickLine(pick)}</span>
              {pick.frozen ? <span className="text-muted-foreground"> · frozen</span> : null}
              {pick.terms ? <span className="text-muted-foreground"> · {pick.terms}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
