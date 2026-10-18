/**
 * Tables in the Ask DRBL agent's read-only database (D1 binding ASK_DB).
 * scripts/build-ask-db.ts creates them from the bundled runtime snapshots, and
 * the agent's system prompt describes them from this same list.
 */

export type AskColumn = { name: string; type: "TEXT" | "INTEGER" | "REAL"; about: string };
export type AskTable = { name: string; about: string; columns: AskColumn[]; indexes?: string[][] };

const nameKey: AskColumn = {
  name: "name_key",
  type: "TEXT",
  about: "Lowercase player name without accents, punctuation or Jr/Sr/II/III. Join tables on this.",
};

export const ASK_TABLES: AskTable[] = [
  {
    name: "players",
    about: "One row per player with every id we know. Use it to resolve a name before querying other tables.",
    columns: [
      { name: "name", type: "TEXT", about: "Display name" },
      nameKey,
      { name: "espn_id", type: "TEXT", about: "ESPN athlete id (player page URL /players/{espn_id})" },
      { name: "nba_id", type: "TEXT", about: "NBA.com person id" },
      { name: "bref_id", type: "TEXT", about: "Basketball Reference slug, e.g. jamesle01" },
      { name: "team", type: "TEXT", about: "Latest team abbreviation" },
      { name: "first_season", type: "TEXT", about: "First season, e.g. 2019-20" },
      { name: "last_season", type: "TEXT", about: "Latest season" },
    ],
    indexes: [["name_key"], ["espn_id"], ["nba_id"], ["bref_id"]],
  },
  {
    name: "player_seasons",
    about:
      "Regular-season box and advanced stats per player, season and team, 1996-97 onward. Per-game stats are per game; shooting and rate stats are fractions (0.585 = 58.5%) unless noted. A player who played for several teams has one combined row whose team is like '2TM'.",
    columns: [
      { name: "season", type: "TEXT", about: "e.g. 2024-25" },
      { name: "name", type: "TEXT", about: "Player name" },
      nameKey,
      { name: "espn_id", type: "TEXT", about: "ESPN athlete id" },
      { name: "team", type: "TEXT", about: "Team abbreviation, or 2TM/3TM for combined rows" },
      { name: "pos", type: "TEXT", about: "Position" },
      { name: "age", type: "INTEGER", about: "Age that season" },
      { name: "gp", type: "INTEGER", about: "Games played" },
      { name: "gs", type: "INTEGER", about: "Games started" },
      { name: "mpg", type: "REAL", about: "Minutes per game" },
      { name: "minutes", type: "INTEGER", about: "Total minutes" },
      { name: "pts", type: "REAL", about: "Points per game" },
      { name: "trb", type: "REAL", about: "Rebounds per game" },
      { name: "orb", type: "REAL", about: "Offensive rebounds per game" },
      { name: "drb", type: "REAL", about: "Defensive rebounds per game" },
      { name: "ast", type: "REAL", about: "Assists per game" },
      { name: "stl", type: "REAL", about: "Steals per game" },
      { name: "blk", type: "REAL", about: "Blocks per game" },
      { name: "tov", type: "REAL", about: "Turnovers per game" },
      { name: "pf", type: "REAL", about: "Personal fouls per game" },
      { name: "fgm", type: "REAL", about: "Field goals made per game" },
      { name: "fga", type: "REAL", about: "Field goal attempts per game" },
      { name: "fg_pct", type: "REAL", about: "Field goal percentage (fraction)" },
      { name: "fg3m", type: "REAL", about: "Threes made per game" },
      { name: "fg3a", type: "REAL", about: "Three attempts per game" },
      { name: "fg3_pct", type: "REAL", about: "Three-point percentage (fraction)" },
      { name: "efg_pct", type: "REAL", about: "Effective field goal percentage (fraction)" },
      { name: "ftm", type: "REAL", about: "Free throws made per game" },
      { name: "fta", type: "REAL", about: "Free throw attempts per game" },
      { name: "ft_pct", type: "REAL", about: "Free throw percentage (fraction)" },
      { name: "ts_pct", type: "REAL", about: "True shooting percentage (fraction)" },
      { name: "usg_pct", type: "REAL", about: "Usage rate, percent (19.6 = 19.6%)" },
      { name: "per", type: "REAL", about: "Player efficiency rating" },
      { name: "ws", type: "REAL", about: "Win shares" },
      { name: "ws48", type: "REAL", about: "Win shares per 48 minutes" },
      { name: "bpm", type: "REAL", about: "Box plus/minus" },
      { name: "obpm", type: "REAL", about: "Offensive box plus/minus" },
      { name: "dbpm", type: "REAL", about: "Defensive box plus/minus" },
      { name: "vorp", type: "REAL", about: "Value over replacement player" },
      { name: "ast_pct", type: "REAL", about: "Assist percentage, percent" },
      { name: "trb_pct", type: "REAL", about: "Rebound percentage, percent" },
      { name: "stl_pct", type: "REAL", about: "Steal percentage, percent" },
      { name: "blk_pct", type: "REAL", about: "Block percentage, percent" },
      { name: "tov_pct", type: "REAL", about: "Turnover percentage, percent" },
      { name: "ortg", type: "REAL", about: "Offensive rating (points produced per 100 possessions)" },
      { name: "drtg", type: "REAL", about: "Defensive rating (points allowed per 100 possessions)" },
    ],
    indexes: [["season"], ["name_key"], ["espn_id"]],
  },
  {
    name: "drbl_ratings",
    about:
      "DRBL, this site's impact rating, per player season from 2018-19. drbl_per100 is points per 100 possessions compared with an average player. wins_above_r1 is WAR1, that rate times playing time, on a win scale. Zero is an average player, not a replacement player. A roster sum is not the team's win total.",
    columns: [
      { name: "season", type: "TEXT", about: "e.g. 2024-25" },
      { name: "name", type: "TEXT", about: "Player name" },
      nameKey,
      { name: "nba_id", type: "TEXT", about: "NBA.com person id" },
      { name: "team_id", type: "TEXT", about: "NBA team id" },
      { name: "drbl_per100", type: "REAL", about: "DRBL per 100 possessions" },
      { name: "possessions", type: "INTEGER", about: "Possessions played" },
      { name: "offense", type: "REAL", about: "DRBL-O, offensive half of the playmaking diagnostic, in points versus a role-matched reference. Not a percentage and not a piece of DRBL/100. Higher is better." },
      { name: "defense", type: "REAL", about: "DRBL-D, defensive half of the playmaking diagnostic, in points versus a role-matched reference. Not a percentage and not a piece of DRBL/100. Higher is better. Positive here does not mean the season was above average; drbl_per100 decides that." },
      { name: "playmaking", type: "REAL", about: "DRBL-P, the possession diagnostic that offense and defense split. Not a third skill and not a percentage. Do not rank by the minimum of offense, defense, and playmaking." },
      { name: "lineup", type: "REAL", about: "DRBL-Ln component" },
      { name: "box_prior", type: "REAL", about: "DRBL-B component" },
      { name: "r1_points", type: "REAL", about: "DRBL rate times possessions, in points (R1 Points)" },
      { name: "wins_above_r1", type: "REAL", about: "WAR1. Value above an average player, on a win scale. Not VORP and not one standings win." },
    ],
    indexes: [["season"], ["name_key"], ["nba_id"]],
  },
  {
    name: "impact_ratings",
    about:
      "Outside impact metrics per player season. source is 'darko' (Kostya Medvedovsky's DPM, 1996-97 on) or 'raptor' (FiveThirtyEight, through 2021-22). Points per 100 possessions versus average.",
    columns: [
      { name: "season", type: "TEXT", about: "e.g. 2024-25" },
      { name: "source", type: "TEXT", about: "darko or raptor" },
      { name: "name", type: "TEXT", about: "Player name" },
      nameKey,
      { name: "player_id", type: "TEXT", about: "NBA id for darko; source id for raptor" },
      { name: "total", type: "REAL", about: "Points per 100 versus an average player, both ends together. This is how good the player is in DARKO or RAPTOR." },
      { name: "offense", type: "REAL", about: "Offensive points per 100 versus an average player. Zero is average. With defense, this is the split that shows a hole." },
      { name: "defense", type: "REAL", about: "Defensive points per 100 versus an average player. Higher is better. The weaker of offense and defense is the hole in the game." },
      { name: "war", type: "REAL", about: "RAPTOR wins above replacement (raptor only)" },
    ],
    indexes: [["season", "source"], ["name_key"]],
  },
  {
    name: "standings",
    about: "Final or current regular-season standings, 2024-25 onward.",
    columns: [
      { name: "season", type: "TEXT", about: "e.g. 2025-26" },
      { name: "team", type: "TEXT", about: "Team abbreviation" },
      { name: "team_name", type: "TEXT", about: "Full team name" },
      { name: "conference", type: "TEXT", about: "East or West" },
      { name: "conf_rank", type: "INTEGER", about: "Rank in conference" },
      { name: "wins", type: "INTEGER", about: "Wins" },
      { name: "losses", type: "INTEGER", about: "Losses" },
      { name: "win_pct", type: "REAL", about: "Win percentage (fraction)" },
      { name: "games_behind", type: "REAL", about: "Games behind the conference leader" },
      { name: "ppg", type: "REAL", about: "Points scored per game" },
      { name: "opp_ppg", type: "REAL", about: "Points allowed per game" },
      { name: "differential", type: "REAL", about: "Point differential per game" },
      { name: "home_record", type: "TEXT", about: "Home W-L" },
      { name: "road_record", type: "TEXT", about: "Road W-L" },
      { name: "last_ten", type: "TEXT", about: "Last ten games W-L" },
      { name: "streak", type: "TEXT", about: "Current streak, e.g. W3" },
    ],
    indexes: [["season"]],
  },
  {
    name: "contracts",
    about:
      "Current contracts, one row per player per contract season. salary is in US dollars. option is 'player' or 'team' when that year is an option; not_guaranteed is 1 when the year isn't guaranteed. For guaranteed money, exclude not_guaranteed = 1 and option = 'team' (team options aren't guaranteed until picked up); player options count. Rows can include dead money for waived players.",
    columns: [
      { name: "team", type: "TEXT", about: "Team abbreviation" },
      { name: "name", type: "TEXT", about: "Player name" },
      nameKey,
      { name: "bref_id", type: "TEXT", about: "Basketball Reference slug" },
      { name: "age", type: "INTEGER", about: "Age" },
      { name: "season", type: "TEXT", about: "Contract season, e.g. 2026-27" },
      { name: "salary", type: "INTEGER", about: "Salary for that season, USD" },
      { name: "option", type: "TEXT", about: "player, team or null" },
      { name: "not_guaranteed", type: "INTEGER", about: "1 when not guaranteed" },
      { name: "guaranteed_total", type: "INTEGER", about: "Total guaranteed money left on the deal, USD" },
    ],
    indexes: [["team"], ["name_key"], ["bref_id"]],
  },
  {
    name: "contract_value",
    about:
      "DRBL contract value model: what each current contract is worth in on-court value versus what it pays. surplus = worth - salary over the remaining years, USD. percentile ranks surplus league-wide (100 = best value).",
    columns: [
      { name: "team", type: "TEXT", about: "Team abbreviation" },
      { name: "name", type: "TEXT", about: "Player name" },
      nameKey,
      { name: "bref_id", type: "TEXT", about: "Basketball Reference slug" },
      { name: "salary", type: "INTEGER", about: "Remaining salary, USD" },
      { name: "worth", type: "INTEGER", about: "Modeled on-court worth, USD" },
      { name: "surplus", type: "INTEGER", about: "worth - salary, USD" },
      { name: "surplus_low", type: "INTEGER", about: "Low end of the surplus range, USD" },
      { name: "surplus_high", type: "INTEGER", about: "High end of the surplus range, USD" },
      { name: "percentile", type: "REAL", about: "League percentile of surplus" },
      { name: "seasons", type: "TEXT", about: "Comma-separated contract seasons valued" },
    ],
    indexes: [["team"], ["name_key"]],
  },
  {
    name: "transactions",
    about:
      "NBA transactions (trades, signings, waivers, extensions, two-way deals) from 2001 on. description is the league's one-line summary.",
    columns: [
      { name: "date", type: "TEXT", about: "YYYY-MM-DD" },
      { name: "season", type: "TEXT", about: "League year, e.g. 2026-27" },
      { name: "team", type: "TEXT", about: "Team abbreviation" },
      { name: "type", type: "TEXT", about: "One of: trade, signing, waive, release, extension, option, draft, other" },
      { name: "description", type: "TEXT", about: "One-line summary naming the players" },
    ],
    indexes: [["date"], ["team"], ["type"]],
  },
  {
    name: "awards",
    about:
      "Player honors: All-NBA, All-Defensive, All-Rookie, All-Star, MVP, DPOY, ROY, 6MOY, MIP, Finals MVP, champion, and others.",
    columns: [
      { name: "name", type: "TEXT", about: "Player name" },
      nameKey,
      { name: "nba_id", type: "TEXT", about: "NBA.com person id" },
      { name: "bref_id", type: "TEXT", about: "Basketball Reference slug" },
      {
        name: "award",
        type: "TEXT",
        about:
          "Exactly one of: NBA Most Valuable Player, NBA Finals Most Valuable Player, NBA Defensive Player of the Year, NBA Rookie of the Year, All-NBA, All-Defensive Team, NBA All-Star",
      },
      { name: "season", type: "TEXT", about: "e.g. 1991-92" },
      { name: "detail", type: "TEXT", about: "Team or placement, e.g. 1st Team" },
    ],
    indexes: [["name_key"], ["award", "season"]],
  },
];

/** Lowercase, accent-free name used to join sources that spell names differently. */
export function nameKeyOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function askSchemaDdl(): string {
  const out: string[] = [];
  for (const table of ASK_TABLES) {
    out.push(`DROP TABLE IF EXISTS ${table.name};`);
    out.push(
      `CREATE TABLE ${table.name} (${table.columns.map((c) => `${c.name} ${c.type}`).join(", ")});`
    );
    for (const cols of table.indexes ?? []) {
      out.push(`CREATE INDEX idx_${table.name}_${cols.join("_")} ON ${table.name} (${cols.join(", ")});`);
    }
  }
  return out.join("\n");
}

/** Compact schema text for the model's system prompt. */
export function askSchemaPrompt(): string {
  return ASK_TABLES.map(
    (t) => `${t.name}: ${t.about}\n${t.columns.map((c) => `  ${c.name} ${c.type}: ${c.about}`).join("\n")}`
  ).join("\n\n");
}
