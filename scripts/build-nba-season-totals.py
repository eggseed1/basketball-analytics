"""
Fetch regular-season box score totals from stats.nba.com, one file per season,
for scripts/build-season-tables.ts to turn into the season tables snapshot.

stats.nba.com drops requests from GitHub and Cloudflare, so this runs on a home
machine (scripts/local/stats-nba-refresh.sh) with curl_cffi's Chrome TLS
fingerprint. Run from the repo root:

    python3 -m venv /tmp/nbavenv && /tmp/nbavenv/bin/pip install curl_cffi
    /tmp/nbavenv/bin/python scripts/build-nba-season-totals.py              # missing seasons only
    /tmp/nbavenv/bin/python scripts/build-nba-season-totals.py 2026-27      # refetch one season too

Seven requests per season. Files go to $DRBL_SEASON_TOTALS_DIR
(default ~/.cache/drbl-season-totals/v1), outside the repo: they hold raw
NBA totals and aren't published. A season with no games yet writes nothing.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

from curl_cffi import requests

FIRST_SEASON_START = 1996
OUT_DIR = os.path.expanduser(
    os.environ.get("DRBL_SEASON_TOTALS_DIR", "~/.cache/drbl-season-totals/v1")
)
SOURCE = "stats.nba.com"

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}
DELAY_S = float(os.environ.get("NBA_STATS_DELAY", "0.6"))

COUNTS = ["FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TOV", "PF", "PTS"]


def fetch(endpoint, params, attempts=4, timeout=90):
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
            time.sleep(DELAY_S)
            return res.json()
        except Exception as error:  # noqa: BLE001 - retry any transport error
            last = error
            if attempt + 1 < attempts:
                time.sleep(3.0 * (attempt + 1))
    raise last


def result_rows(payload):
    rs = payload["resultSets"][0] if "resultSets" in payload else payload["resultSet"]
    headers = rs["headers"]
    return [dict(zip(headers, row)) for row in rs["rowSet"]]


def season_label(start):
    return f"{start}-{str(start + 1)[2:]}"


def dash_params(season, **extra):
    params = {
        "LeagueID": "00",
        "Season": season,
        "SeasonType": "Regular Season",
        "PerMode": "Totals",
        "MeasureType": "Base",
        "Month": 0,
        "OpponentTeamID": 0,
        "PaceAdjust": "N",
        "Period": 0,
        "PlusMinus": "N",
        "Rank": "N",
        "LastNGames": 0,
        "TeamID": 0,
    }
    params.update(extra)
    return params


def num(value):
    try:
        return float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def stints_from_game_logs(season):
    """Per player-team totals from every player game, with the first game date for stint order."""
    rows = result_rows(
        fetch("playergamelogs", {"LeagueID": "00", "Season": season, "SeasonType": "Regular Season"})
    )
    stints = {}
    for row in rows:
        key = (int(row["PLAYER_ID"]), int(row["TEAM_ID"]))
        stint = stints.get(key)
        if stint is None:
            stint = {
                "pid": key[0],
                "name": row["PLAYER_NAME"],
                "teamId": key[1],
                "team": row["TEAM_ABBREVIATION"],
                "first": row["GAME_DATE"][:10],
                "gp": 0,
                "min": 0.0,
                **{c.lower(): 0.0 for c in COUNTS},
            }
            stints[key] = stint
        stint["first"] = min(stint["first"], row["GAME_DATE"][:10])
        stint["gp"] += 1
        stint["min"] += num(row["MIN"])
        for c in COUNTS:
            stint[c.lower()] += num(row[c])
    out = list(stints.values())
    for s in out:
        s["min"] = round(s["min"], 2)
    return out


def team_totals(season):
    base = {int(r["TEAM_ID"]): r for r in result_rows(fetch("leaguedashteamstats", dash_params(season)))}
    opp = {
        int(r["TEAM_ID"]): r
        for r in result_rows(fetch("leaguedashteamstats", dash_params(season, MeasureType="Opponent")))
    }
    teams = []
    for team_id, b in base.items():
        o = opp.get(team_id, {})
        teams.append(
            {
                "teamId": team_id,
                "name": b["TEAM_NAME"],
                "gp": int(b["GP"]),
                "w": int(b["W"]),
                "l": int(b["L"]),
                "min": num(b["MIN"]),
                **{c.lower(): num(b[c]) for c in COUNTS},
                "opp": {c.lower(): num(o.get(f"OPP_{c}")) for c in COUNTS},
            }
        )
    return teams


def player_season_extras(season):
    """Age, games started and on-court ratings, one row per player for the whole season."""
    extras = {}
    for r in result_rows(fetch("leaguedashplayerstats", dash_params(season))):
        extras[int(r["PLAYER_ID"])] = {"age": r.get("AGE")}
    for r in result_rows(fetch("leaguedashplayerstats", dash_params(season, StarterBench="Starters"))):
        extras.setdefault(int(r["PLAYER_ID"]), {})["gs"] = int(r["GP"])
    for r in result_rows(fetch("leaguedashplayerstats", dash_params(season, MeasureType="Advanced"))):
        e = extras.setdefault(int(r["PLAYER_ID"]), {})
        e["onOrtg"] = r.get("OFF_RATING")
        e["onDrtg"] = r.get("DEF_RATING")
    return {str(k): v for k, v in extras.items()}


def listed_positions():
    rows = result_rows(
        fetch("playerindex", {"LeagueID": "00", "Season": season_label(current_season_start()), "Historical": 1})
    )
    return {str(int(r["PERSON_ID"])): r.get("POSITION") or "" for r in rows}


def current_season_start(now=None):
    now = now or datetime.now(timezone.utc)
    return now.year if now.month >= 9 else now.year - 1


def write_json(path, payload):
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    os.replace(tmp, path)


def bake_season(season):
    stints = stints_from_game_logs(season)
    if not stints:
        print(f"{season}: no games yet, skipped")
        return False
    payload = {
        "season": season,
        "source": SOURCE,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stints": stints,
        "teams": team_totals(season),
        "players": player_season_extras(season),
    }
    write_json(os.path.join(OUT_DIR, f"{season}.json"), payload)
    print(f"{season}: {len(stints)} stints, {len(payload['teams'])} teams")
    return True


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    refresh = set(sys.argv[1:])
    last_start = current_season_start()
    seasons = [season_label(y) for y in range(FIRST_SEASON_START, last_start + 1)]
    todo = [s for s in seasons if s in refresh or not os.path.exists(os.path.join(OUT_DIR, f"{s}.json"))]
    failures = []
    for season in todo:
        try:
            bake_season(season)
        except Exception as error:  # noqa: BLE001 - keep the last good file for that season
            failures.append(season)
            print(f"{season}: failed ({error}); keeping the last file", file=sys.stderr)
    if todo:
        write_json(os.path.join(OUT_DIR, "positions.json"), {"source": SOURCE, "positions": listed_positions()})
    print(f"done: {len(todo) - len(failures)} fetched, {len(failures)} failed, dir {OUT_DIR}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
