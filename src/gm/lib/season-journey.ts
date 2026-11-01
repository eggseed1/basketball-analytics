import type { GmLeagueState } from "@/gm/types";
import { flowOf, OFFSEASON_STAGES } from "@/gm/engine/season-flow-state";
import { extensionQuote } from "@/gm/engine/extensions";
import { faStageLabel } from "@/gm/engine/free-agency";
import { userTeamOptionsBlocking } from "@/gm/engine/fa-options";
import { userQoBlocking } from "@/gm/engine/fa-qualifying";
import { userRfaSheetsBlocking } from "@/gm/engine/fa-rfa";
import { pendingRookies, openingRosterChecks } from "@/gm/engine/season-flow";
import { isDraftComplete } from "@/gm/engine/draft-room";
import { tradeDeadlineDay, regularSeasonComplete } from "@/gm/engine/schedule";
import { resolveHomeStage } from "@/gm/lib/home-stage";

export type JourneyTask = { label: string; href: string; required?: boolean; action?: "open_roster_fill" };
export type SeasonJourney = { title: string; period: string; description: string; next: string; primaryLabel: string; primaryHref?: string; blocked?: boolean; primaryAction?: "open_roster_fill"; hint?: string; tasks: JourneyTask[] };

export function seasonJourney(league: GmLeagueState): SeasonJourney {
  const flow = flowOf(league);
  const stage = flow.stage;
  if (stage) {
    const row = OFFSEASON_STAGES.find(entry => entry.id === stage)!;
    const index = OFFSEASON_STAGES.indexOf(row);
    const view: SeasonJourney = { title: row.label, period: row.period, description: row.description, next: OFFSEASON_STAGES[index + 1]?.label ?? "Opening night", primaryLabel: "Continue to " + (OFFSEASON_STAGES[index + 1]?.label.toLowerCase() ?? "opening night"), tasks: [] };
    if (stage === "review") view.tasks.push({ label: "Review the season and your team plan", href: "/gm/franchise" });
    if (stage === "staff") { view.primaryLabel = "Retain staff and reveal lottery"; view.tasks.push({ label: "Hire replacements or retain your current staff", href: "/gm/staff" }); }
    if (stage === "scouting") { view.primaryLabel = "Start NBA draft"; view.tasks.push({ label: league.combineDone ? "Review workouts and your draft board" : "Run the combine or continue without it", href: "/gm/draft" }); }
    if (stage === "draft" && !isDraftComplete(league)) { view.primaryHref = "/gm/draft"; view.primaryLabel = "Go to draft night"; view.tasks.push({ label: "Make your selections or delegate the remaining picks", href: "/gm/draft", required: true }); }
    if (stage === "rookie_signing" && pendingRookies(league).length) {
      view.blocked = true; view.primaryHref = "#rookie-contracts"; view.primaryLabel = "Review rookie contracts";
      view.hint = "Sign your picks or release their rights before opening contract options.";
      view.tasks.push({ label: "Resolve " + pendingRookies(league).length + " unsigned rookie contract(s)", href: "#rookie-contracts", required: true });
    }
    if (stage === "free_agency") {
      view.title = faStageLabel(league.faMarket);
      view.next = league.faMarket?.done ? (flow.returnFromMarket ? "Opening-night roster" : "Player progression") : "Next contract or market window";
      view.primaryLabel = league.faMarket?.done ? (flow.returnFromMarket ? "Return to roster check" : "Review player progression") : "Advance contract window";
      const options = league.faMarket?.stage === "options" ? userTeamOptionsBlocking(league).length : 0;
      const qos = league.faMarket?.stage === "qualifying_offers" ? userQoBlocking(league).length : 0;
      const sheets = userRfaSheetsBlocking(league).length;
      if (options) view.tasks.push({ label: "Exercise or decline " + options + " team option(s)", href: "/gm/free-agency", required: true });
      if (qos) view.tasks.push({ label: "Tender or decline " + qos + " qualifying offer(s)", href: "/gm/free-agency", required: true });
      if (sheets) view.tasks.push({ label: "Answer " + sheets + " restricted offer sheet(s)", href: "/gm/free-agency", required: true });
      if (league.automation?.autoFreeAgency) view.tasks = view.tasks.map(task => ({ ...task, label: task.label + " (delegated)", required: false }));
      if (view.tasks.length && !league.automation?.autoFreeAgency) { view.primaryHref = "/gm/free-agency"; view.primaryLabel = "Resolve contract decisions"; }
      else view.tasks.push({ label: league.faMarket?.stage === "re_signing" ? "Negotiate with your own expiring players" : "Review offers, cap holds and roster needs", href: "/gm/free-agency" });
    }
    if (stage === "summer_league" && !flow.summerLeague) {
      view.blocked = true; view.primaryHref = "#summer-games"; view.primaryLabel = "Choose summer league plan";
      view.tasks.push({ label: "Simulate summer games or skip this optional event", href: "#summer-games", required: true });
    }
    if (stage === "training_camp") {
      const assigned = league.players.filter(player => player.teamId === league.userTeamId && player.contract && !player.injury && flow.campAssignments?.[player.id]).length;
      view.primaryLabel = flow.campResults ? "Check opening-night roster" : assigned ? "Run training camp" : "Continue without individual camps";
      view.next = flow.campResults ? "Opening-night roster" : "Camp results";
      view.hint = flow.campResults ? "Review the camp gains below before making final cuts." : assigned ? assigned + " player(s) will receive a focused camp." : "No individual camps assigned. Annual progression is already complete.";
    }
    if (stage === "roster_check") {
      view.primaryLabel = "Start next season";
      const issues = openingRosterChecks(league);
      view.blocked = issues.length > 0;
      view.tasks = issues.map(issue => ({ label: issue.message, href: issue.kind === "maximum" ? "/gm/roster" : "/gm/free-agency", action: issue.kind !== "maximum" ? "open_roster_fill" as const : undefined, required: true }));
      const first = issues[0];
      if (first?.kind === "maximum") { view.primaryHref = "/gm/roster"; view.primaryLabel = "Make roster cuts"; }
      else if (first?.kind === "healthy") { view.primaryAction = "open_roster_fill"; view.primaryLabel = "Find healthy free agents"; }
      else if (first) { view.primaryAction = "open_roster_fill"; view.primaryLabel = "Find free agents"; }
      view.hint = first ? first.message : "Start a new schedule. Your roster, contracts and development carry forward.";
      if (issues.some(issue => issue.kind === "healthy")) view.tasks.push({ label: "Review injuries before changing your roster", href: "/gm/medical" });
      view.tasks.push({ label: "Review starters and balance 240 rotation minutes", href: "/gm/lineup" });
    }
    return view;
  }
  const home = resolveHomeStage(league);
  if (home === "awards") return { title: "Season awards", period: "Regular season complete", description: "Review the winners before the postseason begins.", next: "Play-in and playoffs", primaryLabel: "Open awards night", primaryHref: "/gm", tasks: [{ label: "Acknowledge the awards show", href: "/gm", required: true }] };
  if (home === "champion") return { title: "NBA champions", period: "Finals complete", description: "Celebrate the champions, then open your summer review.", next: "Season review", primaryLabel: "Open champion ceremony", primaryHref: "/gm", tasks: [] };
  if (home === "play_in" || home === "playoffs") return { title: home === "play_in" ? "Play-in tournament" : "NBA playoffs", period: "Postseason", description: "Prepare the rotation and follow the league until a champion is decided.", next: home === "play_in" ? "Playoff bracket" : "Champion ceremony and season review", primaryLabel: "Open postseason", primaryHref: "/gm", tasks: [{ label: "Review the rotation and injuries", href: "/gm/lineup" }] };
  const games = league.schedule.filter(game => !game.postseason && !game.exhibition && game.cup !== "championship");
  const played = games.filter(game => game.played).length;
  const progress = played / Math.max(1, games.length);
  const deadline = tradeDeadlineDay(league.schedule);
  const title = regularSeasonComplete(league.schedule) ? "Regular season complete" : played === 0 ? "Opening night" : league.tradeDeadlinePassed ? "Playoff push" : league.day >= deadline - 3 ? "Trade deadline" : progress >= 0.4 ? "Midseason review" : "Regular season";
  const extensions = league.players.filter(player => player.teamId === league.userTeamId && extensionQuote(league, player).eligible).length;
  const tasks: JourneyTask[] = [{ label: "Set your rotation and development roles", href: "/gm/lineup" }];
  if (extensions) tasks.push({ label: extensions + " player(s) can discuss an extension", href: "/gm/contracts" });
  if (!league.tradeDeadlinePassed && progress >= 0.4) tasks.push({ label: "Decide whether to buy, hold or sell before the deadline", href: "/gm/trade" });
  return { title, period: "Regular season", description: league.tradeDeadlinePassed ? "Trades are closed. Prepare for the postseason and plan for expiring contracts." : "Simulate the calendar, review your team at checkpoints, and plan contracts before summer.", next: regularSeasonComplete(league.schedule) ? "Season awards" : league.tradeDeadlinePassed ? "Awards and postseason" : progress >= 0.4 ? "Trade deadline" : "Midseason review", primaryLabel: "Open season calendar", primaryHref: "/gm", tasks };
}
