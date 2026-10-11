#!/usr/bin/env python3
"""
Fill the DRBL raw cache for a past season from stats.nba.com.

The NBA CDN returns 403 for past games, and stats.nba.com drops plain HTTP
clients (including the Node fetch in drbl/download), so this uses curl_cffi
with Chrome impersonation from a home machine. It writes the files
scripts/drbl-import-historical.ts reads from cache:

  data/drbl/raw/{season}/meta/games_regular_season.json
  data/drbl/raw/games/{gameId}/playbyplay.json         (playbyplayv3, as served)
  data/drbl/raw/games/{gameId}/boxscore.stats-v3.json  (boxscoretraditionalv3, as served)

Then run `npx tsx scripts/drbl-adapt-stats-box.ts --season {season}` and
`npm run drbl:import-historical -- --from {season} --to {season}`.

  ~/.cache/drbl-stats-runner/venv/bin/python scripts/local/fetch-historical-pbp.py 2021-22
"""

import json
import os
import sys
import time

from curl_cffi import requests

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}
DELAY_S = float(os.environ.get("NBA_STATS_DELAY", "0.6"))
RAW = os.path.join("data", "drbl", "raw")


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
            return res.json()
        except Exception as error:  # noqa: BLE001 - retry any transport error
            last = error
            time.sleep(2 + 4 * attempt)
    raise RuntimeError(f"{endpoint} failed after {attempts} attempts: {last}")


def valid_json(path):
    try:
        with open(path, encoding="utf8") as f:
            json.load(f)
        return True
    except (OSError, ValueError):
        return False


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(data, f)
    os.replace(tmp, path)


def season_games(season):
    path = os.path.join(RAW, season, "meta", "games_regular_season.json")
    if valid_json(path):
        with open(path, encoding="utf8") as f:
            return json.load(f)
    data = fetch(
        "leaguegamelog",
        {
            "Counter": 0,
            "Direction": "ASC",
            "LeagueID": "00",
            "PlayerOrTeam": "T",
            "Season": season,
            "SeasonType": "Regular Season",
            "Sorter": "DATE",
        },
    )
    rs = data["resultSets"][0]
    games = {}
    for row in rs["rowSet"]:
        r = dict(zip(rs["headers"], row))
        gid = str(r["GAME_ID"])
        home = " vs. " in str(r["MATCHUP"])
        g = games.setdefault(
            gid,
            {
                "gameId": gid,
                "season": season,
                "gameDate": str(r["GAME_DATE"])[:10],
                "homeTeamId": "",
                "awayTeamId": "",
                "homeTeamTricode": "",
                "awayTeamTricode": "",
                "homeScore": 0,
                "awayScore": 0,
                "status": 3,
            },
        )
        side = "home" if home else "away"
        g[f"{side}TeamId"] = str(r["TEAM_ID"])
        g[f"{side}TeamTricode"] = str(r["TEAM_ABBREVIATION"])
        g[f"{side}Score"] = int(r["PTS"] or 0)
    out = sorted(games.values(), key=lambda g: (g["gameDate"], g["gameId"]))
    incomplete = [g["gameId"] for g in out if not g["homeTeamId"] or not g["awayTeamId"]]
    if incomplete:
        raise RuntimeError(f"{len(incomplete)} games without both teams, e.g. {incomplete[:3]}")
    write_json(path, out)
    return out


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: fetch-historical-pbp.py SEASON (e.g. 2021-22)")
    season = sys.argv[1]
    games = season_games(season)
    print(f"[historical-pbp] {season}: {len(games)} games", flush=True)
    fetched = failed = 0
    for i, g in enumerate(games):
        gid = g["gameId"]
        targets = [
            ("playbyplayv3", "playbyplay.json"),
            ("boxscoretraditionalv3", "boxscore.stats-v3.json"),
        ]
        for endpoint, name in targets:
            path = os.path.join(RAW, "games", gid, name)
            if valid_json(path):
                continue
            try:
                write_json(path, fetch(endpoint, {"GameID": gid, "StartPeriod": 0, "EndPeriod": 14}))
                fetched += 1
            except RuntimeError as error:
                failed += 1
                print(f"[historical-pbp] {gid} {endpoint}: {error}", flush=True)
            time.sleep(DELAY_S)
        if (i + 1) % 100 == 0:
            print(f"[historical-pbp] {season}: {i + 1}/{len(games)} games, fetched {fetched}, failed {failed}", flush=True)
    print(f"[historical-pbp] {season}: done, fetched {fetched}, failed {failed}", flush=True)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
