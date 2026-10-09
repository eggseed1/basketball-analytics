import type { Metadata } from "next";
import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { SalaryPayoffChart } from "@/components/charts/salary-payoff-chart";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import {
  CapGrowthBars,
  CapStrip,
  ContractAnatomy,
  ContractValueRanges,
  FirstRoundPicksChart,
  GuideNote,
  GuideSection,
  LeagueBooksBars,
  OptionClip,
  SurplusBandsChart,
  WorthByYearChart,
  WorthScatterChart,
} from "@/components/learn/salary-guide-charts";
import { SalaryWorthCalculator } from "@/components/learn/salary-worth-calculator";
import {
  capHistory,
  capLines,
  capZone,
  contractExamples,
  contractPrices,
  firstRoundPicks,
  leagueBooks,
  longContractExample,
  optionExamples,
  payoffExamples,
  surplusBySalary,
  teamPayrolls,
  worthByYearAhead,
  worthScatter,
} from "@/data/queries/salary-learn";
import { PLAYER_SURPLUS_RANKING_PATH, teamSurplusRankingHref } from "@/lib/contract-surplus";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { teamSalaryHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";
import { type } from "@/lib/design-system";

export const metadata: Metadata = {
  title: "Salary & contracts guide",
  description:
    "How the NBA salary cap, tax and aprons work, how contracts are built, and how DRBL prices what a player's play is worth.",
};

const PAYOFF_BOARD = "/explore/players/visualizations?view=payoff";

const CONTENTS = [
  { id: "cap", label: "Cap lines" },
  { id: "cap-growth", label: "Cap growth" },
  { id: "contracts", label: "Contracts" },
  { id: "worth", label: "Worth" },
  { id: "surplus", label: "Surplus" },
  { id: "paid-off", label: "Paid off" },
  { id: "picks", label: "Draft picks" },
  { id: "limits", label: "Limits" },
];

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function LearnSalaryPage() {
  const lines = capLines();
  const payrolls = teamPayrolls();
  const history = capHistory();
  const examples = contractExamples();
  const books = leagueBooks();
  const prices = contractPrices();
  const scatter = worthScatter();
  const bands = surplusBySalary();
  const yearsAhead = worthByYearAhead();
  const longDeal = longContractExample();
  const options = optionExamples();
  const payoff = payoffExamples();
  const picks = firstRoundPicks();

  const priciest = payrolls.at(-1);
  const cheapest = payrolls[0];
  const zoneCount = (zone: ReturnType<typeof capZone>) =>
    lines ? payrolls.filter((t) => capZone(t.payroll, lines) === zone).length : 0;
  const overTax = zoneCount("tax") + zoneCount("apron1") + zoneCount("apron2");

  const firstCap = history[0];
  const officialCaps = history.filter((h) => !h.projected);
  const latestCap = officialCaps.at(-1);
  const lastProjected = history.at(-1);
  const growth = latestCap && firstCap ? latestCap.cap / firstCap.cap : null;
  const sampleSalary = 40e6;

  const anatomySeasons = [...new Set(examples.flatMap((e) => e.seasons.map((s) => s.season)))].sort();
  const firstBooks = books[0];
  const thirdBooks = books[2];

  const deepestBand = [...bands].sort((a, b) => a.surplus - b.surplus)[0];
  const cheapBand = bands[0];
  const firstYear = yearsAhead[0];
  const fourthYear = yearsAhead[3];
  const longDealDrift = longDeal
    ? { first: longDeal.years[0], last: longDeal.years.at(-1)! }
    : null;
  const playerOption = options.find((o) => o.kind === "player");
  const teamOption = options.find((o) => o.kind === "team");

  const mostPicks = picks.teams[0];
  const totalFrozen = picks.teams.reduce((s, t) => s + t.frozen, 0);
  const totalConditional = picks.teams.reduce((s, t) => s + t.conditional, 0);
  const totalAcquired = picks.teams.reduce((s, t) => s + t.acquired, 0);

  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <div data-motion-stack className="flex w-full flex-col gap-6 lg:max-w-5xl">
        <Link href="/learn" className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline">
          ← Learn
        </Link>

        <header className="flex flex-col gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Salary & contracts</p>
          <h1 className="text-[2rem] font-bold tracking-tight sm:text-[2.25rem]">How NBA money works</h1>
          <p className="max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            Every chart on this page is drawn from the same payrolls, contracts and DRBL seasons behind the team salary
            pages and the contract boards. Read it top to bottom, or jump to the part a page sent you here for.
          </p>
          <nav aria-label="On this page" className="flex flex-wrap gap-1.5">
            {CONTENTS.map((c) => (
              <a key={c.id} href={`#${c.id}`} className="rounded-full bg-secondary px-3 py-1 text-[13px] font-semibold hover:bg-secondary/70">
                {c.label}
              </a>
            ))}
          </nav>
        </header>

        {lines ? (
          <GuideSection
            id="cap"
            eyebrow="Cap lines"
            title={`Four lines every payroll is measured against in ${lines.season}`}
            lead={
              <>
                <p>
                  The <strong>salary cap</strong> is {formatUsdCompact(lines.cap)}. A team under it can sign free agents
                  outright with the room it has left. Over it, a team can still re-sign its own players and use
                  exceptions, so going over is normal. The <strong>luxury tax</strong> line is{" "}
                  {formatUsdCompact(lines.tax)}; a team above it when the season ends pays a tax on every dollar over,
                  and the rate climbs the further over it goes.
                </p>
                <p className="mt-2">
                  The <strong>first apron</strong> ({formatUsdCompact(lines.apron1)}) and <strong>second apron</strong>{" "}
                  ({formatUsdCompact(lines.apron2)}) sit above the tax. Each one takes tools away: smaller exceptions,
                  tighter trade rules, and above the second apron, a first-round pick seven years out can be frozen so it
                  can&apos;t be traded.
                  {lines.minimum ? ` At the bottom, every team has to spend at least ${formatUsdCompact(lines.minimum)}.` : ""}
                </p>
              </>
            }
            seeIt={[
              ...(priciest ? [{ label: `${priciest.abbr} payroll`, href: teamSalaryHref(priciest.key) }] : []),
              ...(cheapest ? [{ label: `${cheapest.abbr} payroll`, href: teamSalaryHref(cheapest.key) }] : []),
            ]}
          >
            <CapStrip lines={lines} teams={payrolls} />
            <GuideNote>
              <p>
                Each logo is one team&apos;s salary listed for {lines.season}. {overTax} of 30 teams are over the tax
                line right now, and {zoneCount("under-cap")} are under the cap. Payrolls move all year through trades
                and signings, and the tax is only charged on the payroll at season&apos;s end, so this is where teams
                stand today, not a bill.
              </p>
            </GuideNote>
          </GuideSection>
        ) : null}

        {firstCap && latestCap && growth ? (
          <GuideSection
            id="cap-growth"
            eyebrow="Cap growth"
            title="The same salary is a smaller share every year"
            lead={
              <p>
                The cap was {formatUsdCompact(firstCap.cap)} in {firstCap.season} and is {formatUsdCompact(latestCap.cap)}{" "}
                in {latestCap.season}, about {growth.toFixed(1)} times bigger. A {formatUsdCompact(sampleSalary)} salary
                was {pct((sampleSalary / firstCap.cap) * 100)} of the cap then and is {pct((sampleSalary / latestCap.cap) * 100)}{" "}
                now. That&apos;s why we compare salaries and value as shares of the cap, and why a flat contract gets
                cheaper for the team in every year it runs.
              </p>
            }
          >
            <CapGrowthBars points={history} salary={sampleSalary} />
            <GuideNote>
              <p>
                Solid bars are official caps. Dashed bars through {lastProjected?.season} are projections at the{" "}
                {(((history[officialCaps.length]?.cap ?? 0) / latestCap.cap - 1) * 100).toFixed(2)}% a year our contract
                model assumes. The league sets each new cap from revenue, so those can land higher or lower. Hover a bar
                to see what {formatUsdCompact(sampleSalary)} would be worth against that cap.
              </p>
            </GuideNote>
          </GuideSection>
        ) : null}

        {examples.length ? (
          <GuideSection
            id="contracts"
            eyebrow="Contracts"
            title="Reading a contract, year by year"
            lead={
              <p>
                A contract is a row of yearly salaries. Most years are <strong>guaranteed</strong>: the player is paid
                even if he&apos;s waived. Some carry an <strong>option</strong>. On a <strong>player option</strong> the
                player decides whether to play the year or become a free agent. On a <strong>team option</strong> the
                team decides whether to keep him. A year that isn&apos;t <strong>fully guaranteed</strong> can be avoided,
                in full or in part, by waiving him before a set date. These three real contracts each show one feature.
              </p>
            }
            seeIt={examples.slice(0, 2).map((ex) => ({ label: `${ex.abbr} contracts`, href: teamSalaryHref(ex.teamKey, "contracts") }))}
          >
            <ContractAnatomy examples={examples} seasons={anatomySeasons} />
            {firstBooks ? (
              <>
                <h3 className="mt-2 text-[16px] font-bold">Salary already on the books</h3>
                <GuideNote>
                  <p>
                    Add up every contract and you get the money each season already has committed. {firstBooks.season}{" "}
                    has {formatUsdCompact(firstBooks.total)} signed across {firstBooks.players} players.
                    {thirdBooks
                      ? ` By ${thirdBooks.season} it's ${formatUsdCompact(thirdBooks.total)} across ${thirdBooks.players}, because most of those seasons haven't been negotiated yet.`
                      : ""}{" "}
                    The dashed mark is 30 teams at the cap. Real payrolls run above it because most teams are over the
                    cap, so a season far below the mark still has most of its money unsigned. That&apos;s why future
                    payrolls on team pages look low.
                  </p>
                </GuideNote>
                <LeagueBooksBars books={books} caps={history} />
              </>
            ) : null}
          </GuideSection>
        ) : null}

        <GuideSection
          id="worth"
          eyebrow="Worth"
          title="Putting a price on a player's play"
          lead={
            <>
              <p>
                To say whether a contract is good, we need a price for what a player gives. We start from{" "}
                <strong>replacement level</strong>: how well players paid close to the minimum actually play. That kind
                of player costs the league minimum, {formatUsdCompact(prices.minimum)} in {prices.season}. Each{" "}
                <strong>win above replacement</strong> is priced at the league average over the last six seasons: all
                the salary teams paid above the minimum, divided by all the wins above replacement they got for it. That
                comes to {(prices.share * 100).toFixed(2)}% of the cap, or {formatUsdCompact(prices.pricePerWin)} a win
                this season.
              </p>
              <p className="mt-2">
                Wins come from <Link href="/learn/drbl/war1" className="font-semibold text-foreground underline-offset-4 hover:underline">WAR1</Link>,
                adjusted down to replacement level. A player at or below replacement is worth the minimum, never less.
                Move the sliders to see how the two pieces add up.
              </p>
            </>
          }
          seeIt={[{ label: "Contract surplus board", href: PLAYER_SURPLUS_RANKING_PATH }]}
        >
          <SalaryWorthCalculator season={prices.season} pricePerWin={prices.pricePerWin} minimum={prices.minimum} />
          {scatter ? (
            <>
              <h3 className="mt-2 text-[16px] font-bold">Last season, every player at once</h3>
              <GuideNote>
                <p>
                  Here is the same math for {scatter.season} with that season&apos;s price of{" "}
                  {formatUsdCompact(scatter.pricePerWin)} a win. Worth here is what each player actually produced over
                  the full season, so injuries and lost minutes pull a dot down.
                </p>
              </GuideNote>
              <WorthScatterChart data={scatter} />
            </>
          ) : null}
        </GuideSection>

        <GuideSection
          id="surplus"
          eyebrow="Surplus"
          title="Surplus: worth minus salary over the whole deal"
          lead={
            <p>
              <strong>Contract surplus</strong> runs the worth math for every season left on a contract and subtracts
              the salary. Future seasons need a projection of the player&apos;s wins, so we weight his last three DRBL
              seasons (the latest counts most), pull small samples toward average, apply an aging curve, and estimate
              his minutes. Each year gets an 80% range, and in back-tests about 80% of real outcomes landed inside it.
            </p>
          }
          seeIt={[
            { label: "Players ranked by surplus", href: PLAYER_SURPLUS_RANKING_PATH },
            { label: "Teams ranked by surplus", href: teamSurplusRankingHref() },
          ]}
        >
          {longDeal && longDealDrift ? (
            <>
              <h3 className="text-[16px] font-bold">
                <span className="inline-flex items-center gap-1.5">
                  <TeamLogo teamKey={longDeal.teamKey} size="xs" />
                  {longDeal.name}
                </span>
                , the biggest salary with four or more seasons left
              </h3>
              <GuideNote>
                <p>
                  His projected worth falls from {formatUsdCompact(longDealDrift.first.worth)} in {longDealDrift.first.season}{" "}
                  to {formatUsdCompact(longDealDrift.last.worth)} in {longDealDrift.last.season} as he ages, while the
                  salary {longDealDrift.last.salary > longDealDrift.first.salary ? "rises" : "stays about level"} from{" "}
                  {formatUsdCompact(longDealDrift.first.salary)} to {formatUsdCompact(longDealDrift.last.salary)}. The
                  ranges widen too, because the further out a season is, the less we know. Added up, the
                  deal projects at {formatUsdSignedCompact(longDeal.surplus)}, with a range from{" "}
                  {formatUsdSignedCompact(longDeal.surplusLow)} to {formatUsdSignedCompact(longDeal.surplusHigh)}.
                </p>
              </GuideNote>
              <ContractValueRanges example={longDeal} />
            </>
          ) : null}

          {options.length ? (
            <>
              <h3 className="mt-2 text-[16px] font-bold">Options cut off one side of the range</h3>
              <GuideNote>
                <p>
                  An option year isn&apos;t valued like a guaranteed one, because whoever holds the option picks the
                  better outcome for themselves. We count only the side the team is stuck with or gets to keep.
                  {playerOption && teamOption
                    ? ` Both examples are real option years whose ranges straddle the salary, so either choice could happen.`
                    : ""}
                </p>
              </GuideNote>
              <div className="grid gap-3 md:grid-cols-2">
                {options.map((o) => (
                  <OptionClip key={o.kind} example={o} />
                ))}
              </div>
            </>
          ) : null}

          <h3 className="mt-2 text-[16px] font-bold">Where the surplus is</h3>
          <GuideNote>
            <p>
              Grouping every contract we can estimate by this season&apos;s salary shows the pattern behind the boards.{" "}
              {cheapBand.positive} of {cheapBand.contracts} deals {cheapBand.label.toLowerCase()} project positive, for{" "}
              {formatUsdSignedCompact(cheapBand.surplus)} together. {deepestBand.label} is the deepest hole at{" "}
              {formatUsdSignedCompact(deepestBand.surplus)}, with {deepestBand.positive} of {deepestBand.contracts}{" "}
              deals in the green. The price of a win is a league average, and the rules hold rookie-scale and minimum
              salaries down, so cheap deals tend to land above it and big ones below. A negative number on a
              star&apos;s contract doesn&apos;t make the signing a mistake.
            </p>
          </GuideNote>
          <SurplusBandsChart bands={bands} />

          {firstYear && fourthYear ? (
            <>
              <h3 className="mt-2 text-[16px] font-bold">Later years are worth less per dollar</h3>
              <GuideNote>
                <p>
                  Across all contracts, each salary dollar in {firstYear.season} buys about $
                  {(firstYear.worth / firstYear.salary).toFixed(2)} of projected worth. By {fourthYear.season} it&apos;s $
                  {(fourthYear.worth / fourthYear.salary).toFixed(2)}, because the players signed that far out are older
                  and the salaries tend to rise. The last bar covers few contracts, so read it loosely.
                </p>
              </GuideNote>
              <WorthByYearChart rows={yearsAhead} />
            </>
          ) : null}
        </GuideSection>

        {payoff ? (
          <GuideSection
            id="paid-off"
            eyebrow="Paid off"
            title="Salary paid off: the same math, one night at a time"
            lead={
              <p>
                <strong>Salary paid off</strong> applies the worth math as a season happens. Each night it adds up the
                wins a player has produced so far, prices them, and divides by his salary for the year. The dotted line
                is how much of the salary has been paid out by that date. A player above it is ahead of his contract; a
                player at 100% has covered the whole year. Here are four {payoff.season} players chosen to show the range.
              </p>
            }
            seeIt={[{ label: "Salary paid off board", href: PAYOFF_BOARD }]}
          >
            <SalaryPayoffChart
              dates={payoff.dates}
              pace={payoff.pace}
              lines={payoff.lines}
              title={`Salary paid off, ${payoff.season}`}
            />
            <ul className="grid gap-2 sm:grid-cols-2">
              {payoff.lines.map((line) => (
                <li key={line.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
                  <TeamLogo teamKey={line.teamId} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className={cn(type.bodySm, "block font-semibold")}>
                      {line.href ? (
                        <Link href={line.href} className="underline-offset-4 hover:underline">
                          {line.name}
                        </Link>
                      ) : (
                        line.name
                      )}
                    </span>
                    <span className={cn(type.caption, "block text-muted-foreground")}>
                      {line.why} · {formatUsdCompact(line.salary)} salary
                    </span>
                  </span>
                  <span className="text-[15px] font-bold tabular-nums">{Math.round(line.pct.at(-1) ?? 0)}%</span>
                </li>
              ))}
            </ul>
            <GuideNote>
              <p>
                The line shows what a season&apos;s play was worth, not whether the signing was smart. A player can run
                far behind because of an injury, and the contract can still look fine over its whole length.
              </p>
            </GuideNote>
          </GuideSection>
        ) : null}

        {picks.teams.length ? (
          <GuideSection
            id="picks"
            eyebrow="Draft picks"
            title={`First-round picks, ${picks.years[0]} to ${picks.years.at(-1)}`}
            lead={
              <p>
                Picks are the other currency in team building. Every team starts with one first-rounder a year, then
                trades them away or collects more. {totalAcquired} of the firsts on file now belong to a team other than
                the one that made them. {mostPicks ? `${mostPicks.abbr} holds the most, with ${mostPicks.own + mostPicks.acquired}.` : ""}
              </p>
            }
            seeIt={mostPicks ? [{ label: `${mostPicks.abbr} draft picks`, href: teamSalaryHref(mostPicks.key, "picks") }] : []}
          >
            <FirstRoundPicksChart years={picks.years} teams={picks.teams} />
            <GuideNote>
              <p>
                Many traded picks come with <strong>protections</strong>. &ldquo;If 1-5&rdquo; means the pick stays with
                the original team if it lands in the top five, often rolling over to the next year. {totalConditional} held
                firsts carry a condition like that. <strong>Swap rights</strong> let a team trade its pick for another
                team&apos;s if that one is better. {totalFrozen ? `${totalFrozen} ${totalFrozen === 1 ? "pick is" : "picks are"} frozen right now because the team was over the second apron.` : ""}{" "}
                Hover a team for its count, or open its draft picks page for every pick and its exact terms.
              </p>
            </GuideNote>
          </GuideSection>
        ) : null}

        <GuideSection
          id="limits"
          eyebrow="Limits"
          title="What these numbers don't do"
          lead={
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                Payrolls are the salaries listed for each player. They aren&apos;t official cap sheets: cap holds, dead
                money from stretched contracts, and incentive details aren&apos;t included.
              </li>
              <li>
                Worth and surplus are estimates with ranges. The middle number is our best guess, and the range is the
                honest part.
              </li>
              <li>
                Contracts we can&apos;t value, such as a player with too little DRBL history, are left out of totals.
                They never count as zero.
              </li>
              <li>
                A salary fitting under a line or into an exception isn&apos;t a ruling that a trade or signing is legal.
                See{" "}
                <Link href="/learn/salary-fit-vs-legality" className="font-semibold text-foreground underline-offset-4 hover:underline">
                  salary fit vs trade legality
                </Link>
                .
              </li>
              <li>
                Worth prices on-court play. It leaves out ticket sales, marketing and how scarce stars are.
              </li>
            </ul>
          }
        />
      </div>
    </main>
  );
}
