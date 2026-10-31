"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { GmBooks } from "@/gm/ui/gm-books";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { userCap, userPlayers, userTeam } from "@/gm/lib/selectors";
import { formatNumber } from "@/lib/format";
import { staffBillM } from "@/gm/engine/staff";
import { staffBudgetM } from "@/gm/seed/coaches";

export default function GmCapPage() {
  return (
    <GmShell>
      <CapBody />
    </GmShell>
  );
}

function CapBody() {
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  const renounceRights = useGmStore((s) => s.renounceRights);
  const [teamId, setTeamId] = useState<string | null>(null);
  if (!league) return null;
  const user = userTeam(league);
  const team = league.teams.find((entry) => entry.id === (teamId ?? user.id)) ?? user;
  const cap = userCap(league);
  const players = team.id === user.id ? userPlayers(league) : league.players.filter((player) => player.teamId === team.id);
  const holds = league.players.filter(
    (player) => player.rightsTeamId === league.userTeamId && player.teamId == null
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("pageCapTitle", { team: team.abbr })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pageCapBlurb")}</p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {t("capClub")}
          <select
            className="rounded-md border border-border bg-background px-2 py-2"
            value={team.id}
            onChange={(event) => setTeamId(event.target.value)}
          >
            {league.teams.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.abbr} · {entry.city}
              </option>
            ))}
          </select>
        </label>
      </div>
      <GmBooks
        league={league}
        team={team}
        summary={
          <>
      <h2 className="sr-only">{t("capSheet", { team: team.abbr })}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("capPayroll")} value={`$${formatNumber(cap.payrollM, 1)}M`} />
        <Stat
          label={t("capRoom")}
          value={`$${formatNumber(cap.capRoomM, 1)}M`}
        />
        <Stat
          label={t("capTaxLine")}
          value={`$${formatNumber(league.settings.luxuryTaxM, 1)}M`}
        />
        <Stat
          label={t("capRoster")}
          value={`${cap.rosterSize} / ${league.settings.maxRoster}`}
        />
      </div>
      <ul className="text-sm text-muted-foreground">
        <li>{cap.overCap ? t("capOverCap") : t("capUnderCap")}</li>
        <li>{cap.overTax ? t("capIntoTax") : t("capBelowTax")}</li>
        <li>{cap.overFirstApron ? t("capFirstApron") : t("capBelowFirstApron")}</li>
        <li>{cap.overSecondApron ? t("capSecondApron") : t("capBelowSecondApron")}</li>
        <li>{cap.rosterLegal ? t("capRosterLegal") : t("capRosterIllegal")}</li>
        <li>
          {t(cap.baeAvailable ? "capMleOpen" : "capMleUsed", {
            mle: formatNumber(cap.mleRemainingM, 1),
            mleMax: formatNumber(cap.nonTaxpayerMleM, 1),
            taxMle: formatNumber(cap.taxpayerMleRemainingM, 1),
            bae: formatNumber(cap.biAnnualM, 1),
            min: formatNumber(cap.minimumM, 1),
          })}
        </li>
        <li>
          {t("capHolds", {
            holds: formatNumber(cap.holdsM, 1),
            dead: formatNumber(cap.deadMoneyM, 1),
          })}
        </li>
        <li>
          {t("capStaff", {
            staff: formatNumber(staffBillM(team), 1),
            budget: formatNumber(staffBudgetM(team, cap.overTax), 1),
          })}
        </li>
      </ul>
      {holds.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("capBirdTitle")}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {holds.map((player) => (
              <li key={player.id} className="flex items-center justify-between gap-3">
                <span>
                  {t("capHoldLine", {
                    name: player.name,
                    kind: player.rightsKind ?? "",
                    amount: formatNumber(player.lastSalaryM ?? 0, 1),
                  })}
                </span>
                <GmConfirmAction label={t("capRenounce")} title={"Renounce " + player.name + "'s rights?"} confirmLabel="Renounce rights" onConfirm={() => renounceRights(player.id)}><p>Clear the ${formatNumber(player.lastSalaryM ?? 0, 2)}M cap hold. You lose his Bird signing path and any restricted matching rights.</p><p>You can still offer a legal deal with cap room or an available exception.</p></GmConfirmAction>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(team.deadMoney ?? []).length > 0 ? (
        <ul className="text-sm text-muted-foreground">
          {(team.deadMoney ?? []).map((row) => (
            <li key={row.id}>
              {t("capDeadMoneyRow", {
                label: row.label,
                amount: formatNumber(row.annualM, 1),
                years: row.yearsLeft,
              })}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("colPlayer")}</th>
              <th className="px-3 py-2">{t("capColSalary")}</th>
              <th className="px-3 py-2">{t("capColYears")}</th>
              <th className="px-3 py-2">{t("capColBird")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 tabular-nums">
                  ${formatNumber(p.contract?.annualSalaryM ?? 0, 1)}M
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {p.contract?.yearsRemaining ?? 0}
                </td>
                <td className="px-3 py-2">{p.contract?.birdRights ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
          </>
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

