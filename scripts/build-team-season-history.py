"""
Franchise records and league per-game averages from stats.nba.com.

Both come from teamyearbyyearstats (one request per franchise, defunct ones
included) plus franchiseplayers for career leaders. stats.nba.com drops
GitHub and Cloudflare clients, so this runs on the home runner
(scripts/local/stats-nba-refresh.sh) with curl_cffi. Run from the repo root:

    /tmp/nbavenv/bin/python scripts/build-team-season-history.py

Writes, only when changed:
  src/data/franchises/verified-records.json   records, titles, best/worst, leaders
  src/data/runtime/league-season-averages.json  compare tool era adjustment

Only completed seasons count. NBA Stats has no ABA seasons, so the four
ex-ABA clubs add data/franchises/aba-seasons.json to their records and
titles; their career leaders stay NBA-only. NBA Stats also lacks some early
league totals (FGA and FTM before 1982-83, rebounds 1950-51 to 1972-73, 3PA
1979-80 to 1981-82); those cells keep the value already in the file.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

from curl_cffi import requests

ROOT = os.getcwd()
RECORDS_OUT = os.path.join(ROOT, "src", "data", "franchises", "verified-records.json")
AVERAGES_OUT = os.path.join(ROOT, "src", "data", "runtime", "league-season-averages.json")
ABA_PATH = os.path.join(ROOT, "data", "franchises", "aba-seasons.json")

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}
DELAY_S = float(os.environ.get("NBA_STATS_DELAY", "0.6"))
PROBE_TIMEOUT = float(os.environ.get("NBA_STATS_PROBE_TIMEOUT", "15"))

TEAM_IDS = {
    1610612737: "atl", 1610612738: "bos", 1610612739: "cle", 1610612740: "nop",
    1610612741: "chi", 1610612742: "dal", 1610612743: "den", 1610612744: "gsw",
    1610612745: "hou", 1610612746: "lac", 1610612747: "lal", 1610612748: "mia",
    1610612749: "mil", 1610612750: "min", 1610612751: "bkn", 1610612752: "nyk",
    1610612753: "orl", 1610612754: "ind", 1610612755: "phi", 1610612756: "phx",
    1610612757: "por", 1610612758: "sac", 1610612759: "sas", 1610612760: "okc",
    1610612761: "tor", 1610612762: "uta", 1610612763: "mem", 1610612764: "was",
    1610612765: "det", 1610612766: "cha",
}

LEADER_COLUMNS = {
    "points": "PTS", "rebounds": "REB", "assists": "AST",
    "steals": "STL", "blocks": "BLK", "threes": "FG3M",
}

COUNT_COLUMNS = {
    "pts": "PTS", "trb": "REB", "orb": "OREB", "drb": "DREB", "ast": "AST",
    "stl": "STL", "blk": "BLK", "tov": "TOV", "pf": "PF", "fg": "FGM",
    "fga": "FGA", "fg3": "FG3M", "fg3a": "FG3A", "ft": "FTM", "fta": "FTA",
}
# First season the NBA tracked each stat; earlier league values stay null.
FIRST_TRACKED = {
    "trb": "1950-51", "orb": "1973-74", "drb": "1973-74", "stl": "1973-74",
    "blk": "1973-74", "tov": "1977-78", "fg3": "1979-80", "fg3a": "1979-80",
    "fg3Pct": "1979-80",
}
AVERAGE_KEYS = [
    "pts", "trb", "orb", "drb", "ast", "stl", "blk", "tov", "pf", "fg", "fga",
    "fg3", "fg3a", "ft", "fta", "fgPct", "fg3Pct", "ftPct", "efgPct", "tsPct", "ortg",
]


def fetch(endpoint, params, attempts=4, timeout=45):
    last = None
    for attempt in range(attempts):
        try:
            res = requests.get(
                f"https://stats.nba.com/stats/{endpoint}",
                params=params,
                headers=HEADERS,
                impersonate="chrome",
                timeout=timeout,
            )
            if res.status_code != 200:
                raise RuntimeError(f"HTTP {res.status_code}")
            return res.json()["resultSets"]
        except Exception as error:  # noqa: BLE001 - retry any transport error
            last = error
            if attempt + 1 < attempts:
                time.sleep(2.0 * (attempt + 1))
    raise last


def rows_of(result_set):
    return [dict(zip(result_set["headers"], row)) for row in result_set["rowSet"]]


def read_json(path):
    try:
        with open(path, encoding="utf8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def write_if_changed(path, payload, compare_keys, indent):
    prior = read_json(path) or {}
    if all(prior.get(k) == payload.get(k) for k in compare_keys):
        return False
    with open(path, "w", encoding="utf8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False, indent=indent) + "\n")
    return True


def completed(season, current_start):
    return int(season[:4]) < current_start


def season_league(season, aba):
    if aba:
        return "ABA"
    return "BAA" if int(season[:4]) <= 1948 else "NBA"


def franchise_record(team_id, seasons_rows, aba_rows, players, current_start):
    nba = [r for r in seasons_rows if completed(r["YEAR"], current_start)]
    seasons = [
        {
            "season": r["YEAR"],
            "league": season_league(r["YEAR"], False),
            "wins": int(r["WINS"]),
            "losses": int(r["LOSSES"]),
            "playoffs": (r["PO_WINS"] or 0) + (r["PO_LOSSES"] or 0) > 0,
            "divisionTitle": str(r["DIV_RANK"]) == "1",
            "finals": r["NBA_FINALS_APPEARANCE"] in ("FINALS APPEARANCE", "LEAGUE CHAMPION"),
            "champion": r["NBA_FINALS_APPEARANCE"] == "LEAGUE CHAMPION",
        }
        for r in nba
    ] + [{**r, "league": "ABA"} for r in aba_rows]
    seasons = [s for s in seasons if s["wins"] + s["losses"] > 0]
    seasons.sort(key=lambda s: s["season"], reverse=True)

    def pct(s):
        return s["wins"] / (s["wins"] + s["losses"])

    best = seasons[0]
    worst = seasons[0]
    for s in seasons[1:]:
        if pct(s) > pct(best) or (pct(s) == pct(best) and s["wins"] > best["wins"]):
            best = s
        if pct(s) < pct(worst) or (pct(s) == pct(worst) and s["wins"] < worst["wins"]):
            worst = s
    titles = sorted((int(s["season"][:4]) + 1, s["league"]) for s in seasons if s["champion"])
    leagues = sorted({s["league"] for s in seasons}, key=["NBA", "ABA", "BAA"].index)
    latest = max(nba, key=lambda r: r["YEAR"])

    leaders = {}
    for key, col in LEADER_COLUMNS.items():
        top = max(players, key=lambda p: p.get(col) or 0, default=None)
        if top and (top.get(col) or 0) > 0:
            leaders[key] = {"player": top["PLAYER"], "value": int(top[col])}

    return {
        "teamId": team_id,
        "name": f"{latest['TEAM_CITY']} {latest['TEAM_NAME']}",
        "leagues": "/".join(leagues),
        "firstSeason": seasons[-1]["season"],
        "regularSeasonWins": sum(s["wins"] for s in seasons),
        "regularSeasonLosses": sum(s["losses"] for s in seasons),
        "playoffAppearances": sum(s["playoffs"] for s in seasons),
        "divisionTitles": sum(s["divisionTitle"] for s in seasons),
        "conferenceTitles": sum(
            s["finals"] for s in seasons if s["league"] == "NBA" and int(s["season"][:4]) >= 1970
        ),
        "leagueTitles": len(titles),
        "seasonsPlayed": len(seasons),
        "lastSeason": seasons[0]["season"],
        "bestSeason": {"season": best["season"], "wins": best["wins"], "losses": best["losses"]},
        "worstSeason": {"season": worst["season"], "wins": worst["wins"], "losses": worst["losses"]},
        "finalsAppearances": sum(s["finals"] for s in seasons),
        "championships": [year for year, _ in titles],
        "championshipLeagues": {str(year): league for year, league in titles},
        "leaders": leaders,
    }


def league_averages(all_rows, current_start, prior):
    by_season = {}
    for r in all_rows:
        if completed(r["YEAR"], current_start):
            by_season.setdefault(r["YEAR"], []).append(r)

    seasons = {}
    for season in sorted(by_season):
        rows = by_season[season]
        gp = sum(r["GP"] or 0 for r in rows)
        kept = (prior.get(season) or {}) if prior else {}
        totals = {}
        for key, col in COUNT_COLUMNS.items():
            # A stat counts only when every team reports it; zeros mean "not recorded".
            totals[key] = sum(r[col] for r in rows) if all((r.get(col) or 0) > 0 for r in rows) else None

        def per_game(key):
            return round(totals[key] / gp, 1) if totals[key] is not None and gp else None

        def ratio(num, den, digits=3):
            return round(num / den, digits) if num is not None and den else None

        t = totals
        row = {key: per_game(key) for key in COUNT_COLUMNS}
        row["fgPct"] = ratio(t["fg"], t["fga"])
        row["fg3Pct"] = ratio(t["fg3"], t["fg3a"])
        row["ftPct"] = ratio(t["ft"], t["fta"])
        threes = t["fg3"] if t["fg3"] is not None else (0 if season < FIRST_TRACKED["fg3"] else None)
        row["efgPct"] = ratio(None if t["fg"] is None or threes is None else t["fg"] + 0.5 * threes, t["fga"])
        row["tsPct"] = ratio(t["pts"], None if t["fga"] is None or t["fta"] is None else 2 * (t["fga"] + 0.44 * t["fta"]))
        if None not in (t["fga"], t["fta"], t["orb"], t["drb"], t["fg"], t["tov"], t["pts"]):
            # League possessions, Basketball-Reference's team formula with team and opponent totals equal.
            poss = t["fga"] + 0.4 * t["fta"] - 1.07 * (t["orb"] / (t["orb"] + t["drb"])) * (t["fga"] - t["fg"]) + t["tov"]
            row["ortg"] = round(100 * t["pts"] / poss, 1)
        else:
            row["ortg"] = None

        out = {}
        for key in AVERAGE_KEYS:
            since = FIRST_TRACKED.get(key)
            if since and season < since:
                out[key] = None
            elif row.get(key) is not None:
                out[key] = row[key]
            else:
                out[key] = kept.get(key)
        seasons[season] = out
    return seasons


def main():
    try:
        fetch("franchisehistory", {"LeagueID": "00"}, attempts=1, timeout=PROBE_TIMEOUT)
    except Exception as error:  # noqa: BLE001
        print(f"[team-history] stats.nba.com unreachable ({error}); keeping the last bake")
        return 1

    now = datetime.now(timezone.utc)
    # A season is complete once July starts (Finals done), matching the old BRef rule.
    current_start = now.year if now.month >= 7 else now.year - 1

    history = fetch("franchisehistory", {"LeagueID": "00"})
    team_ids = sorted({int(r["TEAM_ID"]) for rs in history for r in rows_of(rs)})
    missing = [tid for tid in TEAM_IDS if tid not in team_ids]
    if missing:
        print(f"[team-history] franchise list lacks {missing}; keeping the last bake")
        return 1

    aba = (read_json(ABA_PATH) or {}).get("franchises") or {}
    if sorted(aba) != ["bkn", "den", "ind", "sas"]:
        print("[team-history] data/franchises/aba-seasons.json is missing or incomplete")
        return 1

    by_team = {}
    for tid in team_ids:
        time.sleep(DELAY_S)
        rs = fetch(
            "teamyearbyyearstats",
            {"TeamID": str(tid), "LeagueID": "00", "SeasonType": "Regular Season", "PerMode": "Totals"},
        )
        by_team[tid] = rows_of(rs[0])

    franchises = {}
    for tid, book_id in TEAM_IDS.items():
        time.sleep(DELAY_S)
        rs = fetch(
            "franchiseplayers",
            {"TeamID": str(tid), "LeagueID": "00", "SeasonType": "Regular Season", "PerMode": "Totals"},
        )
        franchises[book_id] = franchise_record(tid, by_team[tid], aba.get(book_id, []), rows_of(rs[0]), current_start)
    franchises = dict(sorted(franchises.items()))

    prior_avg = (read_json(AVERAGES_OUT) or {}).get("seasons") or {}
    seasons = league_averages([r for rows in by_team.values() for r in rows], current_start, prior_avg)
    if len(seasons) < 75:
        print(f"[team-history] only {len(seasons)} league seasons; keeping the last bake")
        return 1

    stamp = now.strftime("%Y-%m-%d")
    wrote_records = write_if_changed(
        RECORDS_OUT,
        {
            "source": "NBA Stats teamyearbyyearstats and franchiseplayers; ABA seasons from Wikipedia season lists. Career leaders count NBA games only.",
            "generatedAt": stamp,
            "franchises": franchises,
        },
        ["source", "franchises"],
        1,
    )
    wrote_averages = write_if_changed(
        AVERAGES_OUT,
        {
            "source": "NBA Stats team season totals (teamyearbyyearstats). Stats NBA Stats lacks for early seasons keep values from an earlier Basketball-Reference table.",
            "generatedAt": stamp,
            "seasons": seasons,
        },
        ["source", "seasons"],
        1,
    )
    keys = sorted(seasons)
    print(
        f"[team-history] franchises {len(franchises)} ({'wrote' if wrote_records else 'unchanged'}); "
        f"league seasons {len(seasons)} {keys[0]} to {keys[-1]} ({'wrote' if wrote_averages else 'unchanged'})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
