"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { userCap, userTeam } from "@/gm/lib/selectors";
import { Button } from "@/components/ui/button";
import { expertiseLabel } from "@/gm/seed/scouts";
import { TRAINER_TIERS, payLabel, trainerLabel, yearsLabel } from "@/gm/seed/coaches";
import { asAssociate, hireQuote, staffBillM, staffRoom } from "@/gm/engine/staff";
import type { GmHeadCoach } from "@/gm/types";

export default function GmStaffPage() {
  return (
    <GmShell>
      <StaffBody />
    </GmShell>
  );
}

function money(coach: GmHeadCoach): string {
  return `${payLabel(coach)} · ${yearsLabel(coach)}`;
}

function StaffBody() {
  const league = useGmStore((s) => s.league);
  const upgradeStaff = useGmStore((s) => s.upgradeStaff);
  const hireScout = useGmStore((s) => s.hireScout);
  const refreshScoutMarket = useGmStore((s) => s.refreshScoutMarket);
  const hireCoach = useGmStore((s) => s.hireCoach);
  const setTrainer = useGmStore((s) => s.setTrainer);
  if (!league) return null;
  const team = userTeam(league);
  const cap = userCap(league);
  const coach = team.staff.headCoach;
  const associate = team.staff.associate;
  const scout = team.staff.scout;
  const market = league.scoutMarket ?? [];
  const coaches = league.coachMarket ?? [];
  const room = staffRoom(team, cap.overTax);
  const dead = team.staff.dead ?? [];

  const quoteFor = (hired: GmHeadCoach, seat: "head" | "associate") => {
    const next = seat === "associate" ? asAssociate(hired) : hired;
    return {
      next,
      quote: hireQuote(team, cap.overTax, { salaryM: next.salaryM ?? 0 }, seat),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Staff</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Coaches, scouts and trainers are paid by the owner. None of it counts on the cap.
            A tax bill leaves less room. Letting a coach go with years left means paying 80% of what remains.
          </p>
        </div>
        <p className="text-sm font-medium">
          ${staffBillM(team).toFixed(1)}M of ${room.budgetM.toFixed(1)}M
          <span className="ml-2 text-muted-foreground">
            {room.roomM >= 0 ? `$${room.roomM.toFixed(1)}M open` : `$${Math.abs(room.roomM).toFixed(1)}M over`}
          </span>
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-border p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Head coach</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{coach.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{money(coach)}</p>
          {coach.trait ? <p className="mt-3 text-sm">{coach.trait}</p> : null}
          {coach.tradeoff ? <p className="mt-1 text-sm text-muted-foreground">{coach.tradeoff}</p> : null}
          <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <li>Offense {coach.offenseBonus.toFixed(1)}</li>
            <li>Defense {coach.defenseBonus.toFixed(1)}</li>
            <li>Growth {coach.developmentBonus.toFixed(1)}</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            That system is the default on the coaching page until you change it. The ratings still apply after that.
          </p>
        </article>

        <article className="rounded-xl border border-border p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Associate</p>
          {associate ? (
            <>
              <h3 className="mt-1 text-xl font-semibold tracking-tight">{associate.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{money(associate)}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Adds a slice of his offense, defense and growth on top of the head coach.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No associate. A former head coach on the bench costs less and covers the head coach&apos;s weak side.
            </p>
          )}
          {dead.length ? (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {dead.map((row) => (
                <li key={`${row.name}-${row.yearsLeft}`}>
                  Still paying {row.name} ${row.annualM.toFixed(1)}M, {row.yearsLeft} {row.yearsLeft === 1 ? "year" : "years"} left
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Coaches between jobs</h3>
        <ul className="grid gap-2 lg:grid-cols-2">
          {coaches.map((hired) => {
            const head = quoteFor(hired, "head");
            const bench = quoteFor(hired, "associate");
            return (
              <li key={hired.id ?? hired.name} className="rounded-xl border border-border p-4">
                <p className="font-semibold">{hired.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Head coach {money(hired)}. Associate {payLabel(bench.next)} for 2 years.
                </p>
                <p className="mt-2 text-sm">{hired.trait}</p>
                <p className="mt-1 text-sm text-muted-foreground">{hired.tradeoff}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Offense {hired.offenseBonus.toFixed(1)} · Defense {hired.defenseBonus.toFixed(1)} · Growth {hired.developmentBonus.toFixed(1)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={!head.quote.ok} onClick={() => hireCoach(hired.id ?? "", "head")}>
                    Hire as head coach
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!bench.quote.ok || associate?.name === hired.name}
                    onClick={() => hireCoach(hired.id ?? "", "associate")}
                  >
                    Hire as associate
                  </Button>
                </div>
                {!head.quote.ok ? <p className="mt-2 text-sm text-muted-foreground">{head.quote.reason}</p> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-border p-4">
          <h3 className="font-medium">Training staff</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {trainerLabel(team.staff.trainer?.level ?? team.staff.trainerLevel)} · $
            {(team.staff.trainer?.salaryM ?? 0).toFixed(1)}M. A better staff shortens injuries. It does not stop them.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TRAINER_TIERS.map((tier) => {
              const quote = hireQuote(team, cap.overTax, tier, "trainer");
              const current = (team.staff.trainer?.level ?? team.staff.trainerLevel) === tier.level;
              return (
                <Button
                  key={tier.level}
                  size="sm"
                  variant={current ? "secondary" : "outline"}
                  disabled={current || !quote.ok}
                  onClick={() => setTrainer(tier.level)}
                >
                  {trainerLabel(tier.level)} · ${tier.salaryM.toFixed(1)}M
                </Button>
              );
            })}
          </div>
        </article>

        <article className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">Director of scouting</h3>
              {scout ? (
                <>
                  <p className="mt-1 font-semibold">{scout.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {scout.yearsExperience} years · {expertiseLabel(scout.expertise)} · Eye {scout.eye}/5 · $
                    {scout.salaryM.toFixed(1)}M
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{scout.bio}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No director hired. Draft fog stays heavy.</p>
              )}
            </div>
            {scout ? (
              <Button size="sm" variant="outline" disabled={scout.eye >= 5} onClick={() => upgradeStaff("scout")}>
                Raise the eye · +$0.4M
              </Button>
            ) : null}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Available hires</p>
              <Button size="sm" variant="ghost" onClick={() => refreshScoutMarket()}>
                Refresh market
              </Button>
            </div>
            <ul className="grid gap-2">
              {market.map((s) => {
                const quote = hireQuote(team, cap.overTax, s, "scout");
                return (
                  <li key={s.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {s.yearsExperience} yrs · {expertiseLabel(s.expertise)} · Eye {s.eye}/5 · ${s.salaryM.toFixed(1)}M
                    </p>
                    <Button className="mt-2" size="sm" disabled={scout?.id === s.id || !quote.ok} onClick={() => hireScout(s.id)}>
                      Hire
                    </Button>
                    {!quote.ok && scout?.id !== s.id ? (
                      <p className="mt-2 text-sm text-muted-foreground">{quote.reason}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </article>
      </div>
    </div>
  );
}
