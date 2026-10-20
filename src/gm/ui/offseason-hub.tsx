"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMyLeagueStore } from "@/gm/myleague/store";
import { useGmStore } from "@/gm/state/gm-store";
import { nextPlayablePhase } from "@/gm/myleague/phase";
import { listSalaryCapHistory } from "@/gm/myleague/cba-registry";
import { Button } from "@/components/ui/button";
import { userCap, userRecord } from "@/gm/lib/selectors";
import { formatNumber } from "@/lib/format";

const HUB_SECTIONS = [
  { id: "review", key: "hubReview", phase: "SEASON_REVIEW", href: "/gm" },
  { id: "roster", key: "hubRoster", phase: "ROSTER_DECISIONS", href: "/gm/roster" },
  { id: "staff", key: "hubStaff", phase: "STAFF_REVIEW", href: "/gm/staff" },
  { id: "draft", key: "hubDraft", phase: "DRAFT", href: "/gm/draft" },
  { id: "awards", key: "hubAwards", phase: "SEASON_REVIEW", href: "/gm/awards" },
  { id: "fa", key: "hubFa", phase: "FREE_AGENCY", href: "/gm/free-agency" },
  { id: "cap", key: "hubCap", phase: "ROSTER_DECISIONS", href: "/gm/cap" },
] as const;

export function OffseasonHub({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const openFreeAgency = useGmStore((s) => s.openFreeAgency);
  const runCpuSignings = useGmStore((s) => s.runCpuSignings);
  const advanceFaDay = useGmStore((s) => s.advanceFaDay);
  const setAutomation = useGmStore((s) => s.setAutomation);
  const myLeague = useMyLeagueStore((s) => s.myLeague);
  const simulation = useMyLeagueStore((s) => s.simulation);
  const historical = useMyLeagueStore((s) => s.historical);

  if (!league) return null;

  const record = userRecord(league);
  const cap = userCap(league);
  const phase = simulation?.phase ?? "REGULAR_SEASON";
  const upcoming = nextPlayablePhase(phase);
  const snapCount = historical ? Object.keys(historical.seasons).length : 0;
  const activeCap = listSalaryCapHistory(
    league.season,
    league.season
  )[0];

  return (
    <div className="flex flex-col gap-5">
      {embedded ? null : (
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold tracking-tight">{t("pageOffseasonTitle")}</h1>
          <p className="text-[15px] text-muted-foreground">{t("pageOffseasonBlurb")}</p>
        </header>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="sports-card p-4">
          <p className="text-[13px] font-semibold text-muted-foreground">
            {t("hubPhaseLabel")}
          </p>
          <p className="mt-1 text-[20px] font-bold tracking-tight">
            {phase.replaceAll("_", " ")}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {t("hubNextPlayable", { phase: upcoming.replaceAll("_", " ") })}
          </p>
        </div>
        <div className="sports-card p-4">
          <p className="text-[13px] font-semibold text-muted-foreground">
            {t("hubSnapshotLabel")}
          </p>
          <p className="mt-1 text-[20px] font-bold tracking-tight">
            {t("hubSeasons", { count: snapCount })}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {myLeague?.settings.realDataProviderId ?? "scaffold"} ·{" "}
            {myLeague?.settings.mode?.replaceAll("_", " ") ?? "-"}
          </p>
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-bold">{t("hubClubSnapshot")}</h2>
        <p className="text-[15px] text-muted-foreground">
          {t("hubSnapshotLine", {
            wins: record?.wins ?? 0,
            losses: record?.losses ?? 0,
            payroll: formatNumber(cap.payrollM, 1),
            cap: formatNumber(league.settings.salaryCapM, 1),
          })}
          {activeCap
            ? t("hubEraCap", {
                label: activeCap.label,
                cap: formatNumber(activeCap.salaryCapM, 1),
              })
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {league.phase === "draft" && (
            <Button onClick={() => openFreeAgency()}>{t("hubOpenFa")}</Button>
          )}
          {league.phase === "free_agency" && (
            <>
              <Button
                variant="outline"
                onClick={() => advanceFaDay()}
                disabled={Boolean(league.faMarket?.done)}
              >
                {t("hubAdvanceFa")}
              </Button>
              <Button variant="outline" onClick={() => runCpuSignings()}>
                {t("hubSimFa")}
              </Button>
              <Button onClick={() => runOffseason()}>{t("hubStartNext")}</Button>
            </>
          )}
          {league.phase === "offseason" && (
            <Button onClick={() => runOffseason()}>{t("hubOpenFa")}</Button>
          )}
          <Link
            href="/gm/draft"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-[13px] font-semibold"
          >
            {t("hubDraftBoard")}
          </Link>
          <Link
            href="/gm/free-agency"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-[13px] font-semibold"
          >
            {t("hubFreeAgency")}
          </Link>
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-bold">{t("hubSwitches")}</h2>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={league.automation?.autoDraft ?? false}
            onChange={(event) =>
              setAutomation({ autoDraft: event.target.checked })
            }
          />
          {t("hubAutoDraft")}
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={league.automation?.autoFreeAgency ?? true}
            onChange={(event) =>
              setAutomation({ autoFreeAgency: event.target.checked })
            }
          />
          {t("hubAutoFa")}
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={league.automation?.autoScout ?? false}
            onChange={(event) =>
              setAutomation({ autoScout: event.target.checked })
            }
          />
          {t("hubAutoScout")}
        </label>
        <p className="text-[12px] text-muted-foreground">
          {t("hubSwitchNote")}
        </p>
        {league.tradeDeadlinePassed && league.phase === "regular" ? (
          <p className="text-[13px] text-muted-foreground">
            {t("hubDeadline")}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold">{t("hubDesks")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {HUB_SECTIONS.map((section) => (
            <li key={section.id}>
              <Link
                href={section.href}
                className="sports-card flex h-full flex-col gap-1 p-4 transition-colors hover:bg-secondary/60"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.phase.replaceAll("_", " ")}
                </span>
                <span className="text-[16px] font-bold">{t(`${section.key}Title`)}</span>
                <span className="text-[13px] text-muted-foreground">
                  {t(`${section.key}Blurb`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="sports-card p-4">
        <h2 className="text-[15px] font-bold">{t("hubCapByYear")}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("hubCapByYearBlurb")}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-semibold">{t("hubColSeason")}</th>
                <th className="py-1 pr-3 font-semibold">{t("hubColCap")}</th>
                <th className="py-1 pr-3 font-semibold">{t("hubColTax")}</th>
                <th className="py-1 font-semibold">{t("hubColAprons")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {listSalaryCapHistory(2015)
                .slice()
                .reverse()
                .map((row) => {
                  const active = league.season === row.seasonEndYear;
                  return (
                    <tr
                      key={row.seasonEndYear}
                      className={active ? "font-semibold" : undefined}
                    >
                      <td className="py-2 pr-3">
                        {row.label}
                        {active ? t("hubActive") : ""}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        ${formatNumber(row.salaryCapM, 1)}M
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.luxuryTaxM > 0
                          ? `$${formatNumber(row.luxuryTaxM, 1)}M`
                          : "-"}
                      </td>
                      <td className="py-2 tabular-nums text-muted-foreground">
                        {row.firstApronM
                          ? `$${formatNumber(row.firstApronM, 1)}M / $${formatNumber(row.secondApronM ?? 0, 1)}M`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
