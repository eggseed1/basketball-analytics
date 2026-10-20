"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";

import { TeamLogo } from "@/components/brand/team-logo";
import { TeamIdentity } from "@/components/teams/team-identity";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import type { FranchiseHistory } from "@/data/franchises/history";
import {
  franchiseTitleCount,
  franchiseWinPct,
} from "@/data/queries/franchises";
import { textLinkClassName, type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamHistoryHref } from "@/lib/team-identity";
import { cn } from "@/lib/utils";

const thBase =
  "py-2 font-semibold text-[12px] uppercase tracking-[0.08em] text-muted-foreground";
const tdBase = "type-caption py-2 tabular-nums";

type SortKey =
  | "name"
  | "titles"
  | "finals"
  | "playoffApps"
  | "rsWins"
  | "rsPct"
  | "founded";

function defaultDir(key: SortKey): "asc" | "desc" {
  if (key === "name" || key === "founded") return "asc";
  return "desc";
}

function sortValue(f: FranchiseHistory, key: SortKey): string | number {
  switch (key) {
    case "name":
      return f.name;
    case "titles":
      return franchiseTitleCount(f);
    case "finals":
      return f.finalsAppearances;
    case "playoffApps":
      return f.playoffAppearances;
    case "rsWins":
      return f.regularSeasonWins;
    case "rsPct":
      return franchiseWinPct(f);
    case "founded":
      return f.firstSeason;
  }
}

export function FranchiseHistoryTable({
  franchises,
}: {
  franchises: FranchiseHistory[];
}) {
  const t = useTranslations("Franchises");
  const [sortKey, setSortKey] = useState<SortKey>("titles");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [conf, setConf] = useState<"all" | "East" | "West">("all");

  const rows = useMemo(() => {
    const base =
      conf === "all"
        ? franchises
        : franchises.filter((f) => f.conference === conf);
    return [...base].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = Number(av) - Number(bv);
      }
      if (cmp === 0) cmp = franchiseTitleCount(b) - franchiseTitleCount(a);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [franchises, conf, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultDir(key));
  };

  const columns: Array<{
    key: SortKey;
    label: string;
    align: "left" | "right";
  }> = [
    { key: "name", label: t("colFranchise"), align: "left" },
    { key: "titles", label: t("colTitles"), align: "right" },
    { key: "finals", label: t("colFinals"), align: "right" },
    { key: "playoffApps", label: t("colPlayoffs"), align: "right" },
    { key: "rsWins", label: t("colWins"), align: "right" },
    { key: "rsPct", label: t("colPct"), align: "right" },
    { key: "founded", label: t("colFounded"), align: "left" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ChoiceTrack>
        {(["all", "East", "West"] as const).map((c) => (
          <ChoiceChip key={c} active={conf === c} onClick={() => setConf(c)}>
            {c === "all" ? t("all") : c === "East" ? t("east") : t("west")}
          </ChoiceChip>
        ))}
      </ChoiceTrack>

      <div className="sports-card overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead className="border-b border-border/40 bg-secondary/50">
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key;
                const Icon = sortDir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={column.key}
                    aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      thBase,
                      column.key === "name" && "pl-3 pr-2",
                      column.key === "founded" && "pl-2 pr-3",
                      column.align === "right" && "px-1",
                      column.align === "right" ? "text-right" : "text-left"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      className={cn(
                        "inline-flex items-baseline gap-1 text-[12px] font-semibold uppercase tracking-[0.08em]",
                        column.align === "right" && "ml-auto",
                        active ? "text-foreground" : "hover:text-foreground"
                      )}
                    >
                      {column.align === "right" && active ? (
                        <Icon className="size-3 shrink-0 self-center" aria-hidden />
                      ) : null}
                      {column.label}
                      {column.align === "left" && active ? (
                        <Icon className="size-3 shrink-0 self-center" aria-hidden />
                      ) : null}
                      <span className="sr-only">
                        {active
                          ? `Sorted ${sortDir === "asc" ? "ascending" : "descending"}`
                          : "Sort"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const titles = franchiseTitleCount(f);
              const name = `${f.city} ${f.name}`;
              return (
                <tr
                  key={f.id}
                  className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                >
                  <td className="min-w-[11.5rem] py-2 pl-3 pr-2">
                    <TeamIdentity
                      teamKey={f.abbr}
                      href={teamHistoryHref(f.abbr)}
                      label={name}
                      nameClassName="flex min-w-0 items-center gap-2 whitespace-nowrap no-underline hover:no-underline"
                    >
                      <span className="shrink-0">
                        <TeamLogo teamKey={f.abbr} size="xs" />
                      </span>
                      <span className={cn(type.bodySm, textLinkClassName, "truncate")}>
                        {name}
                      </span>
                    </TeamIdentity>
                  </td>
                  <td className={cn(tdBase, "px-1 text-right font-bold")}>{titles}</td>
                  <td className={cn(tdBase, "px-1 text-right")}>{f.finalsAppearances}</td>
                  <td className={cn(tdBase, "px-1 text-right")}>{f.playoffAppearances}</td>
                  <td className={cn(tdBase, "px-1 text-right")}>{formatNumber(f.regularSeasonWins)}</td>
                  <td className={cn(tdBase, "px-1 text-right")}>{formatPct(franchiseWinPct(f))}</td>
                  <td className={cn(tdBase, "pl-2 pr-3 text-muted-foreground")}>{f.firstSeason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
