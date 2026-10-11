import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import {
  BlendDumbbells,
  CalibrationColumns,
  CarryoverChart,
  DrblSpreadChart,
  DrblWar1Scatter,
  OutcomeTestChart,
} from "@/components/learn/drbl-guide-charts";
import { DrblShrinkage } from "@/components/learn/drbl-shrinkage";
import { GuideNote, GuideSection } from "@/components/learn/salary-guide-charts";
import { TeamLogo } from "@/components/brand/team-logo";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import { contractValueModel } from "@/data/runtime/contract-value";
import { drblGuide } from "@/data/runtime/drbl-guide";
import { PLAYER_SURPLUS_RANKING_PATH } from "@/lib/contract-surplus";
import { type } from "@/lib/design-system";
import { P1_POINTS_PER_WIN } from "@/lib/drbl-public-labels";
import { cn } from "@/lib/utils";

import boxForwardWeights from "../../../../drbl/models/box-forward-weights.json";
import { BOX_PRIOR_CONFIG } from "../../../../drbl/models/box-prior";

export const metadata: Metadata = {
  title: "DRBL guide",
  description:
    "How DRBL/100 rates players from play-by-play and the box score, how it was tested against real final scores, and the numbers built on it: WAR1, DRBL-O, DRBL-D and contract surplus.",
};

const CONTENTS = [
  { id: "measures", label: "What it measures" },
  { id: "pieces", label: "Two readings" },
  { id: "small-samples", label: "Small samples" },
  { id: "scale", label: "Scale" },
  { id: "tested", label: "Tested" },
  { id: "carryover", label: "Season to season" },
  { id: "war1", label: "WAR1" },
  { id: "sides", label: "Offense and defense" },
  { id: "built-on", label: "Built on it" },
  { id: "seasons", label: "Seasons" },
  { id: "limits", label: "Limits" },
];

type DeeperLink = { href: string; label: string; blurb: string };

const DEEPER: Array<{ title: string; note?: string; links: DeeperLink[] }> = [
  {
    title: "The two main numbers",
    links: [
      { href: "/learn/drbl-100", label: "DRBL/100", blurb: "The full definition, formula and how to use it." },
      { href: "/learn/drbl/war1", label: "WAR1", blurb: "Season value in wins, and how R1 Points convert." },
    ],
  },
  {
    title: "Offense and defense",
    links: [
      { href: "/learn/drbl-o", label: "DRBL-O", blurb: "Value added on offense. Shown as Offense on player pages." },
      { href: "/learn/drbl-d", label: "DRBL-D", blurb: "Value added on defense. Higher is better." },
    ],
  },
  {
    title: "How it works",
    links: [
      { href: "/learn/how-drbl-works", label: "How DRBL works", blurb: "Follow one possession from play-by-play to player credit." },
      { href: "/learn/r1", label: "R1", blurb: "The role-matched baseline behind play-by-play credit and WAR1." },
    ],
  },
  {
    title: "Limits and coverage",
    links: [
      { href: "/learn/drbl-limitations", label: "Limitations", blurb: "What DRBL can't see and what it doesn't claim." },
      { href: "/learn/drbl-historical-data", label: "Historical data", blurb: "Why older seasons can have box scores but no DRBL." },
      { href: "/learn/drbl-validation", label: "Validation", blurb: "How the estimates were tested on seasons the model never saw." },
    ],
  },
  {
    title: "Diagnostics",
    note: "These appear only in season compare. They are non-additive: DRBL-P, DRBL-LN, and DRBL-B do not sum to DRBL/100.",
    links: [
      { href: "/learn/drbl-p", label: "DRBL-P", blurb: "Possession credit, the parent of DRBL-O and DRBL-D." },
      { href: "/learn/drbl-ln", label: "DRBL-LN", blurb: "Lineup context. Association with teammates, not proven off-ball value." },
      { href: "/learn/drbl-b", label: "DRBL-B", blurb: "Box score and play-by-play habits such as usage and shot mix." },
    ],
  },
];

const linkClass = "font-semibold text-foreground underline-offset-4 hover:underline";

function signed(v: number, digits = 2): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

function keep(possessions: number): string {
  return `${Math.round((possessions / (possessions + boxForwardWeights.playerShrinkK)) * 100)}%`;
}

export default function LearnDrblPage() {
  const guide = drblGuide();
  const { distribution: spread, leaders, movers, scatter, carryover, outcome, coverage } = guide;
  const sampleK = boxForwardWeights.playerShrinkK;
  const handoff = BOX_PRIOR_CONFIG.shrinkK;
  const calibration = boxForwardWeights.calibration;
  const firstScale = calibration[0]!;
  const fullScale = calibration.at(-1)!;
  const aheadTests = outcome.tests.filter((t) => t.kind === "season-ahead");
  const withinTests = outcome.tests.filter((t) => t.kind === "within-season");
  const testsWon = outcome.tests.filter((t) => t.blendR2 > t.pbpR2).length;
  const typicalMiss = outcome.tests.reduce((s, t) => s + t.blendRmse, 0) / Math.max(1, outcome.tests.length);
  const aboveTwo = spread.bins.filter((b) => b.from >= 2).reduce((s, b) => s + b.players, 0);
  const leadersUp = leaders.filter((l) => l.pbp100 != null && l.drbl100 > l.pbp100).length;
  const steadier = carryover.buckets.every((b) => b.blendToNextBlend > b.pbpToNextPbp);
  const pbpKeepsOwn = carryover.buckets.filter((b) => b.pbpToNextPbp > b.blendToNextPbp).length;
  const contract = contractValueModel();
  const drblShare = contract.projectionBasis?.drblShare ?? null;
  const basisStudy = guide.contractBasis ?? null;
  const basisRow = (key: "war1" | "mix" | "drbl") => basisStudy?.rows.find((r) => r.key === key && Number.isFinite(r.r2));
  const [basisWar1, basisMix, basisDrbl] = [basisRow("war1"), basisRow("mix"), basisRow("drbl")];
  const pct = (r2: number) => `${Math.round(r2 * 100)}%`;
  const countWord = (n: number) =>
    ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
  const war1Leader = [...scatter.points].sort((a, b) => b[5] - a[5])[0];
  const drblLeader = leaders[0];
  const firstSeason = coverage[0];
  const lastSeason = coverage.at(-1);

  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <div data-motion-stack className="flex w-full flex-col gap-6 lg:max-w-5xl">
        <Link href="/learn" className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline">
          ← Learn
        </Link>

        <header className="flex flex-col gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">DRBL numbers</p>
          <h1 className="text-[2rem] font-bold tracking-tight sm:text-[2.25rem]">How DRBL rates players</h1>
          <p className="max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            DRBL reads public play-by-play and box scores and estimates how much each player helped or hurt his
            team&apos;s scoring. DRBL/100 says how good a player is per possession. WAR1 says how much he added over a
            season. Every chart here uses the same seasons as the player pages and boards.
          </p>
          <nav aria-label="On this page" className="flex flex-wrap gap-1.5">
            {CONTENTS.map((c) => (
              <a key={c.id} href={`#${c.id}`} className="rounded-full bg-secondary px-3 py-1 text-[13px] font-semibold hover:bg-secondary/70">
                {c.label}
              </a>
            ))}
          </nav>
        </header>

        <GuideSection
          id="measures"
          eyebrow="What it measures"
          title="Points per 100 possessions, against an average player"
          lead={
            <>
              <p>
                <strong>DRBL/100</strong> estimates how many points per 100 possessions a player adds compared with an
                average player, counting offense and defense together. A player at +2 is worth about two points per 100
                possessions more than an average player in the same minutes. A player at −1 costs about one.
              </p>
              <p className="mt-2">
                Zero is the average possession, not the average player. Every player is weighted by how much he plays,
                so the league&apos;s minutes average out to {signed(spread.weightedMean)}. A blank means DRBL isn&apos;t
                published for that season, not 0.
              </p>
            </>
          }
          seeIt={[{ label: "Players sorted by DRBL/100", href: "/explore/players?sort=drbl100&dir=desc" }]}
        >
          <DrblSpreadChart distribution={spread} />
          <GuideNote>
            <p>
              In {spread.season}, {spread.players} players had at least {spread.minPossessions.toLocaleString()}{" "}
              possessions. {spread.belowZero} of them finished below zero.
              {spread.belowZero * 2 > spread.players
                ? " That's more than half, because a few stars far above zero pull the average up, and the middle of the league sits a little under it."
                : ""}{" "}
              Only{" "}
              {aboveTwo} finished at +2 or better. Weighted by minutes, ratings spread about {spread.weightedSd.toFixed(2)}{" "}
              points either side of average, so a gap of a few tenths between two players is small.
            </p>
          </GuideNote>
        </GuideSection>

        <GuideSection
          id="pieces"
          eyebrow="Two readings"
          title="Play-by-play credit and the box score, blended"
          lead={
            <>
              <p>
                The first reading is the <strong>play-by-play rate</strong>. We rebuild every possession from the
                league&apos;s public play-by-play, work out how many points it should have produced given who had the
                ball and the situation (the <Link href="/learn/r1" className={linkClass}>R1</Link> baseline), and credit
                the players on the floor for how it beat or missed that. Divided by his possessions, that&apos;s a rate
                per 100. It sees things a box score can&apos;t, but over a few hundred possessions it&apos;s noisy.
              </p>
              <p className="mt-2">
                The second reading comes from the <strong>box score</strong>: points, shot attempts, threes, free
                throws, rebounds, assists, steals, blocks, turnovers, fouls, minutes, starts and on-court net rating,
                each weighted by how well it predicted later on-court scoring margins. It settles quickly but misses
                most of what happens off the ball.
              </p>
              <p className="mt-2">
                DRBL/100 mixes the two. Early on the box score carries more of the weight; the play-by-play rate counts
                for half once a player reaches {handoff.toLocaleString()} possessions. That mix is then averaged with a
                box-score forecast of his later on-court margin.
              </p>
            </>
          }
          seeIt={leaders[0] ? [{ label: `${leaders[0].name}'s page`, href: `/players/${leaders[0].id}` }] : []}
        >
          <pre className="overflow-x-auto rounded-md bg-secondary/60 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-foreground/85">
            {`w     = N / (N + ${handoff})
mix   = w × play-by-play rate + (1 − w) × ${BOX_PRIOR_CONFIG.boxScale} × box rating
blend = ½ × mix + ½ × s × forecast
DRBL/100 = c × N / (N + ${sampleK}) × blend`}
          </pre>
          <GuideNote>
            <p>
              N is the player&apos;s possessions on offense and defense combined. s puts the forecast on the same spread
              as the mix. The last line&apos;s two factors, the small-sample pull and the scale c, have their own
              sections below.
            </p>
          </GuideNote>
          <h3 className="mt-2 text-[16px] font-bold">{spread.season}&apos;s top ten, from play-by-play rate to DRBL/100</h3>
          <GuideNote>
            <p>
              {leadersUp === leaders.length ? "All of the top ten" : `${leadersUp} of the top ten`} rate higher on
              DRBL/100 than on play-by-play alone. Their box scores and
              on-court margins back up the play-by-play credit, so the blend leans further in the same direction.
            </p>
          </GuideNote>
          <BlendDumbbells rows={leaders} label={`Top ten DRBL/100 in ${spread.season}, play-by-play rate against DRBL/100`} />
          {movers.down.length ? (
            <>
              <h3 className="mt-2 text-[16px] font-bold">The box score can pull a rating down too</h3>
              <GuideNote>
                <p>
                  These are the biggest drops from play-by-play rate to DRBL/100 among players with 3,000 or more
                  possessions in {spread.season}. In each case the box score and the forecast rated the player well
                  below his play-by-play credit.
                </p>
              </GuideNote>
              <BlendDumbbells rows={movers.down} label={`Largest drops from play-by-play rate to DRBL/100 in ${spread.season}`} />
            </>
          ) : null}
        </GuideSection>

        <GuideSection
          id="small-samples"
          eyebrow="Small samples"
          title="Small samples start near zero"
          lead={
            <p>
              A player with 200 possessions could be almost anything. So the blend is multiplied by N / (N + {sampleK}).
              At {sampleK} possessions a player keeps half of his blend. At 2,000 he keeps {keep(2000)}, and a full-time
              starter with 8,000 keeps {keep(8000)}. {sampleK} is the value that left the smallest error on later games.
              Drag the sliders to try a made-up player, or pick a real one.
            </p>
          }
        >
          <Suspense fallback={<div className="h-[42rem] animate-pulse rounded-md bg-foreground/[0.05]" />}>
            <DrblShrinkage />
          </Suspense>
        </GuideSection>

        <GuideSection
          id="scale"
          eyebrow="Scale"
          title="Early ratings are scaled down"
          lead={
            <p>
              Even after the blend, ratings from a few weeks of games overstate how far apart players are. So DRBL/100
              is multiplied by a scale, <strong>c</strong>, fit on past seasons: we checked how well the ratings of the
              ten players on the floor predicted the margin in later games, and shrank them until the predicted gaps
              matched the real ones. After {firstScale.games} league games c is {firstScale.calibration.toFixed(2)}. For a
              full season it&apos;s {fullScale.calibration.toFixed(2)}.
            </p>
          }
        >
          <CalibrationColumns points={calibration} seasonGames={1230} />
          <GuideNote>
            <p>
              Between the bars, c moves smoothly with games played, so a player&apos;s rating doesn&apos;t jump when the
              league crosses a line. Even a full season sits below 1, because a year of data still overstates the gaps
              between players a little.
            </p>
          </GuideNote>
        </GuideSection>

        <GuideSection
          id="tested"
          eyebrow="Tested"
          title="Tested against real final scores"
          lead={
            <p>
              We test each version on games it never saw. For every game, we add up the ratings of the players on the
              floor, possession by possession, and compare the margin that implies with the real final margin. One test
              uses last season&apos;s ratings to predict every game of the next season. The other rates players on the
              first 60% of a season and predicts the last 40%.
            </p>
          }
          seeIt={[{ label: "How we validate", href: "/learn/drbl-validation" }]}
        >
          <h3 className="text-[16px] font-bold">Last season&apos;s ratings, every game of the next</h3>
          <OutcomeTestChart tests={aheadTests} />
          <h3 className="mt-2 text-[16px] font-bold">First 60% of a season, predicting the last 40%</h3>
          <OutcomeTestChart tests={withinTests} />
          <GuideNote>
            <p>
              The bars show how much of the swing in final margins each rating explains beyond home-court advantage.
              DRBL/100 explains more than the play-by-play rate alone in {testsWon} of {outcome.tests.length} tests.
              Final margins swing a lot from night to night, so even the better rating misses by about{" "}
              {Math.round(typicalMiss)} points in a typical game. Hover a row for the misses side by side.
            </p>
          </GuideNote>
        </GuideSection>

        <GuideSection
          id="carryover"
          eyebrow="Season to season"
          title="Steadier from one season to the next"
          lead={
            <p>
              A rating that swings wildly from year to year is hard to trust. For every player with at least{" "}
              {carryover.minPossessions} possessions in back-to-back seasons from {carryover.seasons}, we compared each
              rating with the same player&apos;s rating a year later. The bars are correlations: 1 would mean the order
              of players never changes, 0 would mean last season tells you nothing.
            </p>
          }
        >
          <CarryoverChart buckets={carryover.buckets} />
          <GuideNote>
            <p>
              {steadier
                ? "DRBL/100 carries over more strongly at every level of playing time. "
                : "DRBL/100 carries over more strongly at most levels of playing time. "}
              Part of that comes from the box score, which is steadier by nature, so steadiness alone doesn&apos;t
              prove a rating is right. The final-score test above is what shows that.
              {pbpKeepsOwn * 2 > carryover.buckets.length
                ? " One more detail: for most groups, last season's play-by-play rate predicts next season's play-by-play rate better than DRBL/100 does. Some of the play-by-play credit seems to repeat every year without showing up in final scores, which is why we don't use it alone."
                : ""}
            </p>
          </GuideNote>
        </GuideSection>

        <GuideSection
          id="war1"
          eyebrow="WAR1"
          title="WAR1: how much, not how good"
          lead={
            <>
              <p>
                <strong>WAR1</strong> answers a different question: how much did a player add over the whole season? It
                adds up his play-by-play credit for the season in points above the R1 baseline, called{" "}
                <strong>R1 Points</strong>, and turns points into wins at a fixed rate. Minutes count, so a starter
                usually beats an equally good bench player.
              </p>
              <p className="mt-2">
                WAR1 is not traditional WAR. The name is meant as Wins Above R1, and R1 is a role-matched baseline, not
                classic replacement level.
              </p>
            </>
          }
          seeIt={[
            { label: "WAR1 explained", href: "/learn/drbl/war1" },
            { label: "Players sorted by WAR1", href: "/explore/players?sort=r1WinEquivalents&dir=desc" },
          ]}
        >
          <pre className="overflow-x-auto rounded-md bg-secondary/60 px-4 py-3 font-mono text-[12.5px] text-foreground/85">
            {`WAR1 = R1 Points / ${P1_POINTS_PER_WIN.toFixed(2)}`}
          </pre>
          <GuideNote>
            <p>
              The divisor is a fixed number of points per win (shown rounded), so ranking players by R1 Points or by
              WAR1 gives the same order. WAR1 comes straight from the play-by-play credit, without the box score, the
              small-sample pull or the scale. That&apos;s why a player can rank higher on one than the other.
            </p>
          </GuideNote>
          <DrblWar1Scatter scatter={scatter} />
          <GuideNote>
            <p>
              The two mostly agree. Dots high on the chart played heavy minutes at a good rate
              {war1Leader ? `; ${war1Leader[1]} led with ${war1Leader[5].toFixed(1)} WAR1` : ""}. Dots far right but
              lower were very good in fewer minutes or had a box score that rated them above their play-by-play credit
              {drblLeader ? `, like ${drblLeader.name} at ${signed(drblLeader.drbl100)} DRBL/100` : ""}.
            </p>
          </GuideNote>
        </GuideSection>

        <GuideSection
          id="sides"
          eyebrow="Offense and defense"
          title="Offense, defense and the diagnostics"
          lead={
            <p>
              <strong>DRBL-O</strong> and <strong>DRBL-D</strong> split the play-by-play credit by side of the ball,
              per 100 possessions on that side. Player pages show them as Offense and Defense. They tell you where a
              player&apos;s value comes from. They don&apos;t add up to DRBL/100, because DRBL/100 also carries the box
              score, the forecast and the small-sample pull.
            </p>
          }
          seeIt={[
            { label: "DRBL-O", href: "/learn/drbl-o" },
            { label: "DRBL-D", href: "/learn/drbl-d" },
          ]}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left">
              <caption className={cn(type.caption, "pb-2 text-left text-muted-foreground")}>
                {spread.season}&apos;s DRBL/100 top ten, split by side. Blank means not published, not 0.
              </caption>
              <thead>
                <tr className={cn(type.micro, "border-b border-border/60 uppercase tracking-[0.1em] text-muted-foreground")}>
                  <th className="py-1.5 pr-2 font-semibold">Player</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">DRBL/100</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Offense</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Defense</th>
                  <th className="py-1.5 text-right font-semibold">WAR1</th>
                </tr>
              </thead>
              <tbody className={cn(type.bodySm, "tabular-nums")}>
                {leaders.map((l) => (
                  <tr key={l.id} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 pr-2">
                      <Link href={`/players/${l.id}`} className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
                        <TeamLogo teamKey={nbaTeamAbbr(l.teamId).toLowerCase()} size="xs" />
                        {l.name}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-semibold">{signed(l.drbl100)}</td>
                    <td className="py-1.5 pr-2 text-right">{l.offense == null ? "—" : signed(l.offense)}</td>
                    <td className="py-1.5 pr-2 text-right">{l.defense == null ? "—" : signed(l.defense)}</td>
                    <td className="py-1.5 text-right">{l.war1 == null ? "—" : l.war1.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <GuideNote>
            <p>
              Season compare also shows three diagnostics. <strong>DRBL-P</strong> is the possession credit that
              DRBL-O and DRBL-D split. <strong>DRBL-LN</strong> is lineup context, how a player&apos;s units did with
              him, which can reflect teammates. <strong>DRBL-B</strong> reads box score and play-by-play habits such as
              usage and shot mix. They are non-additive: DRBL-P, DRBL-LN and DRBL-B don&apos;t sum to DRBL/100.
            </p>
          </GuideNote>
        </GuideSection>

        <GuideSection
          id="built-on"
          eyebrow="Built on it"
          title="Where the rest of the site uses DRBL/100"
          lead={
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                <strong>Contract surplus</strong> projects a player&apos;s future seasons from his recent history.
                {drblShare != null
                  ? ` Each past season counts ${drblShare === 1 ? "its DRBL/100, turned into wins." : `${drblShare === 0.5 ? "half from DRBL/100 and half from WAR1" : `${Math.round(drblShare * 100)}% from DRBL/100 and the rest from WAR1`}, both turned into wins.`}`
                  : " Each past season counts its WAR1."}{" "}
                What a season already played was worth, and salary played off, use WAR1. See the{" "}
                <Link href="/learn/salary#surplus" className={linkClass}>
                  salary guide
                </Link>
                .
              </li>
              <li>
                <strong>The trade machine</strong> adds up DRBL/100 for each side. A net change within 0.1 reads as
                even.
              </li>
              <li>
                <strong>Season compare</strong> treats two seasons within 0.35 DRBL/100 of each other as about the same.
              </li>
              <li>
                <strong>Grades and percentiles</strong> on player pages rank DRBL/100 against the rest of the league
                that season.
              </li>
              <li>
                <strong>Game previews</strong> and the <strong>sentiment</strong> pages compare rosters and fan opinion
                with DRBL/100.
              </li>
            </ul>
          }
          seeIt={[
            { label: "Contract surplus board", href: PLAYER_SURPLUS_RANKING_PATH },
            { label: "Trade machine", href: "/explore/teams/trade" },
            { label: "Compare players", href: "/compare" },
          ]}
        >
          {drblShare != null && drblShare > 0 && drblShare < 1 ? (
            <GuideNote>
              <p>
                Why a mix? Tested on past contracts, projections from WAR1 history alone predicted each player&apos;s
                next WAR1 a little better. Projections that leaned on DRBL/100 predicted real team records better. The
                half-and-half mix kept most of both.
              </p>
            </GuideNote>
          ) : null}
          {drblShare === 1 && basisStudy && basisWar1 && basisMix && basisDrbl ? (
            <GuideNote>
              <p>
                Why DRBL/100 alone? We refit the contract model on the seasons before each year from{" "}
                {basisStudy.seasons[0]} to {basisStudy.seasons.at(-1)}, once on WAR1, once on DRBL/100 and on mixes of
                the two. Then we checked each projection against the next season&apos;s{" "}
                {basisStudy.games.toLocaleString("en-US")} games. Projections from DRBL/100 explained{" "}
                {pct(basisDrbl.r2)} of the spread in final margins, against {pct(basisWar1.r2)} for WAR1 and{" "}
                {pct(basisMix.r2)} for the half-and-half mix we used before.
                {basisDrbl.teamR != null && basisWar1.teamR != null
                  ? ` They also tracked team records more closely (correlation ${basisDrbl.teamR.toFixed(2)}, against ${basisWar1.teamR.toFixed(2)} for WAR1).`
                  : ""}{" "}
                DRBL/100 did better than WAR1 in{" "}
                {basisStudy.drblBetterSeasons === basisStudy.seasons.length
                  ? `all ${countWord(basisStudy.seasons.length)}`
                  : `${countWord(basisStudy.drblBetterSeasons)} of ${countWord(basisStudy.seasons.length)}`}{" "}
                seasons. WAR1 history still predicts next season&apos;s WAR1 more closely, since that&apos;s the same
                measure.
              </p>
            </GuideNote>
          ) : null}
        </GuideSection>

        {firstSeason && lastSeason ? (
          <GuideSection
            id="seasons"
            eyebrow="Seasons"
            title={`Seasons covered: ${firstSeason.season} to ${lastSeason.season}`}
            lead={
              <p>
                DRBL is published for every regular season from {firstSeason.season} on. Older seasons show box scores
                but no DRBL, and a blank there means not published, not 0. {firstSeason.season} has fewer games because
                it was a 72-game season.
                {coverage.some((c) => c.games === 1225)
                  ? " Seasons showing 1,225 games are missing five neutral-site games from the play-by-play part. When we checked, adding them back moved the play-by-play rate by less than 0.01 on average."
                  : ""}
              </p>
            }
            seeIt={[{ label: "Why older seasons are blank", href: "/learn/drbl-historical-data" }]}
          >
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {coverage.map((c) => (
                <li key={c.season} className="flex flex-col rounded-md border border-border/60 px-3 py-2">
                  <span className="text-[15px] font-bold tabular-nums">{c.season}</span>
                  <span className={cn(type.caption, "text-muted-foreground tabular-nums")}>
                    {c.games.toLocaleString()} games · {c.players} players
                  </span>
                </li>
              ))}
            </ul>
          </GuideSection>
        ) : null}

        <GuideSection
          id="limits"
          eyebrow="Limits"
          title="What DRBL doesn't do"
          lead={
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                It can&apos;t see much of what happens away from the ball, especially on defense. The box score carries
                most of the weight early in a season, and it misses the same things.
              </li>
              <li>
                A rating is an estimate. Two players a few tenths apart are close to even, and the small-sample pull can
                briefly mute a real hot start.
              </li>
              <li>
                It measures what happened in a player&apos;s role and minutes. It doesn&apos;t say how he would do in a
                different role or on a different team.
              </li>
              <li>
                Seasons without published DRBL stay blank. They never count as zero. See{" "}
                <Link href="/learn/drbl-limitations" className={linkClass}>
                  limitations
                </Link>{" "}
                for the full list.
              </li>
            </ul>
          }
        />

        <section className="flex flex-col gap-5">
          <h2 className="text-[18px] font-bold">Go deeper</h2>
          {DEEPER.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.title}</h3>
              {group.note ? <p className="text-[14px] text-muted-foreground">{group.note}</p> : null}
              <ul className="sports-card divide-y divide-black/5 dark:divide-white/10">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-secondary/50">
                      <span className="text-[15px] font-semibold">{item.label}</span>
                      <span className="text-[14px] text-muted-foreground">{item.blurb}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="sports-card mb-8 px-4 py-4">
          <h2 className="text-[16px] font-semibold">See it on the board</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/explore/players?sort=drbl100&dir=desc"
              className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-[14px] font-medium text-background"
            >
              Sort by DRBL/100
            </Link>
            <Link
              href="/explore/players?sort=r1WinEquivalents&dir=desc"
              className="rounded-md border border-border px-3 py-1.5 text-[14px] font-medium hover:bg-secondary"
            >
              Sort by WAR1
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
