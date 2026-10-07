"""
Bake NBA play types (Synergy) and team on/off splits for Cloudflare Workers.

stats.nba.com stalls plain Node/curl clients, so this uses curl_cffi's Chrome
TLS fingerprint. Run from the repo root:

    python3 -m venv /tmp/nbavenv && /tmp/nbavenv/bin/pip install curl_cffi
    /tmp/nbavenv/bin/python scripts/build-runtime-playtype-onoff-snapshot.py [season ...]

Seasons that fail to load keep their previous rows in the snapshot. If one
quick probe gets no answer (stats.nba.com blocks GitHub runners), nothing is
fetched or written, instead of spending ~10 minutes on timeouts and retries.
"""

import gzip
import json
import os
import sys
import time
from datetime import datetime, timezone

from curl_cffi import requests

ROOT = os.getcwd()
PLAY_OUT = os.path.join(ROOT, "src", "data", "runtime", "play-type-snapshot.json")
ONOFF_OUT = os.path.join(ROOT, "src", "data", "runtime", "on-off-snapshot.json")

DEFAULT_SEASONS = ["2022-23", "2023-24", "2024-25", "2025-26"]

# Order is the column order in the snapshot rows.
PLAY_TYPES = [
    "Isolation",
    "PRBallHandler",
    "PRRollman",
    "Postup",
    "Spotup",
    "Handoff",
    "Cut",
    "OffScreen",
    "Transition",
    "OffRebound",
    "Misc",
]

TEAM_IDS = [str(1610612737 + i) for i in range(30)]

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}


PROBE_TIMEOUT = float(os.environ.get("NBA_STATS_PROBE_TIMEOUT", "15"))


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
            if attempt + 1 < attempts:
                time.sleep(1.5 * (attempt + 1))
    raise last


def stats_reachable():
    try:
        fetch("commonplayerinfo", {"LeagueID": "00", "PlayerID": "2544"}, attempts=1, timeout=PROBE_TIMEOUT)
        return True
    except Exception as error:  # noqa: BLE001
        print(f"[nba-stats] unreachable, keeping committed snapshots: {error}")
        return False


def result_set(payload, name=None):
    sets = payload.get("resultSets") or []
    for rs in sets:
        if name is None or rs.get("name") == name:
            headers = rs["headers"]
            return [dict(zip(headers, row)) for row in rs["rowSet"]]
    return []


def play_type_season(season):
    """Row: [nbaId, totalPoss, poss0, pts0, poss1, pts1, ...] in PLAY_TYPES order."""
    per_player = {}
    # Per (player, team): possessions implied by POSS / POSS_PCT, one estimate per type.
    team_totals = {}
    for index, play_type in enumerate(PLAY_TYPES):
        payload = fetch(
            "synergyplaytypes",
            {
                "LeagueID": "00",
                "PerMode": "Totals",
                "PlayType": play_type,
                "PlayerOrTeam": "P",
                "SeasonType": "Regular Season",
                "SeasonYear": season,
                "TypeGrouping": "offensive",
            },
        )
        rows = result_set(payload)
        if not rows:
            raise RuntimeError(f"{play_type}: empty")
        for row in rows:
            pid = str(row["PLAYER_ID"])
            poss = int(row.get("POSS") or 0)
            pts = int(row.get("PTS") or 0)
            cells = per_player.setdefault(pid, [0] * (2 * len(PLAY_TYPES)))
            cells[2 * index] += poss
            cells[2 * index + 1] += pts
            share = row.get("POSS_PCT") or 0
            if poss > 0 and share > 0:
                team_totals.setdefault((pid, str(row["TEAM_ID"])), []).append(poss / share)
        time.sleep(0.8)

    totals = {}
    for (pid, _team), estimates in team_totals.items():
        estimates.sort()
        totals[pid] = totals.get(pid, 0) + estimates[len(estimates) // 2]

    out = []
    for pid, cells in per_player.items():
        tracked = sum(cells[0::2])
        total = max(tracked, round(totals.get(pid, 0)))
        out.append([pid, total, *cells])
    return out


def on_off_season(season):
    """Row: [nbaId, teamId, gp, onMin, onOrtg, onDrtg, offMin, offOrtg, offDrtg]."""
    out = []
    for team_id in TEAM_IDS:
        payload = fetch(
            "teamplayeronoffsummary",
            {
                "LeagueID": "00",
                "MeasureType": "Base",
                "PerMode": "Totals",
                "PaceAdjust": "N",
                "PlusMinus": "N",
                "Rank": "N",
                "Season": season,
                "SeasonType": "Regular Season",
                "TeamID": team_id,
                "Month": "0",
                "OpponentTeamID": "0",
                "Period": "0",
                "LastNGames": "0",
                "PORound": "0",
                "DateFrom": "",
                "DateTo": "",
                "GameSegment": "",
                "Location": "",
                "Outcome": "",
                "SeasonSegment": "",
                "VsConference": "",
                "VsDivision": "",
            },
        )
        on_rows = result_set(payload, "PlayersOnCourtTeamPlayerOnOffSummary")
        off_rows = {
            str(r["VS_PLAYER_ID"]): r
            for r in result_set(payload, "PlayersOffCourtTeamPlayerOnOffSummary")
        }
        for on in on_rows:
            pid = str(on["VS_PLAYER_ID"])
            off = off_rows.get(pid)
            if not off or not on.get("MIN") or not off.get("MIN"):
                continue
            out.append(
                [
                    pid,
                    team_id,
                    int(on.get("GP") or 0),
                    round(float(on["MIN"])),
                    round(float(on["OFF_RATING"]), 1),
                    round(float(on["DEF_RATING"]), 1),
                    round(float(off["MIN"])),
                    round(float(off["OFF_RATING"]), 1),
                    round(float(off["DEF_RATING"]), 1),
                ]
            )
        time.sleep(0.6)
    return out


ZONE_PROBE_PLAYERS = ["203999", "201939", "2544", "1628983"]


def league_zone_season(season):
    """League FGM/FGA by SHOT_ZONE_BASIC from shotchartdetail's LeagueAverages set."""
    for player_id in ZONE_PROBE_PLAYERS:
        payload = fetch(
            "shotchartdetail",
            {
                "LeagueID": "00",
                "PlayerID": player_id,
                "TeamID": "0",
                "GameID": "",
                "Season": season,
                "SeasonType": "Regular Season",
                "ContextMeasure": "FGA",
                "PlayerPosition": "",
                "DateFrom": "",
                "DateTo": "",
                "GameSegment": "",
                "LastNGames": "0",
                "Location": "",
                "Month": "0",
                "OpponentTeamID": "0",
                "Outcome": "",
                "Period": "0",
                "RookieYear": "",
                "SeasonSegment": "",
                "VsConference": "",
                "VsDivision": "",
                "AheadBehind": "",
                "ClutchTime": "",
                "PointDiff": "",
                "RangeType": "0",
                "StartPeriod": "1",
                "EndPeriod": "10",
                "StartRange": "0",
                "EndRange": "28800",
            },
        )
        rows = result_set(payload, "LeagueAverages")
        if not rows:
            continue
        zones = {}
        for row in rows:
            zone = row.get("SHOT_ZONE_BASIC")
            if not zone:
                continue
            cur = zones.setdefault(zone, [0, 0])
            cur[0] += int(row.get("FGM") or 0)
            cur[1] += int(row.get("FGA") or 0)
        if zones:
            return zones
        time.sleep(0.8)
    raise RuntimeError("no LeagueAverages rows")


def load(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def write(path, payload, label):
    body = json.dumps(payload, separators=(",", ":"))
    with open(path, "w") as fh:
        fh.write(body)
    size = len(gzip.compress(body.encode()))
    print(f"[{label}] wrote {path} (gzip ~{size} bytes, seasons={list(payload['seasons'])})")


def main():
    seasons = sys.argv[1:] or DEFAULT_SEASONS
    now = datetime.now(timezone.utc).isoformat()
    play = load(PLAY_OUT)
    onoff = load(ONOFF_OUT)
    play_seasons = dict(play.get("seasons") or {})
    onoff_seasons = dict(onoff.get("seasons") or {})
    league_zones = dict(play.get("leagueShotZones") or {})

    if not stats_reachable():
        return

    zones_only = os.environ.get("ZONES_ONLY") == "1"
    for season in seasons:
        try:
            league_zones[season] = league_zone_season(season)
            print(f"[league-zones] {season}: {sorted(league_zones[season])}")
        except Exception as error:  # noqa: BLE001
            print(f"[league-zones] {season} skipped: {error}")
        if zones_only:
            continue
        try:
            play_seasons[season] = play_type_season(season)
            print(f"[play-types] {season}: {len(play_seasons[season])} players")
        except Exception as error:  # noqa: BLE001
            print(f"[play-types] {season} skipped: {error}")
        try:
            onoff_seasons[season] = on_off_season(season)
            print(f"[on-off] {season}: {len(onoff_seasons[season])} player-team rows")
        except Exception as error:  # noqa: BLE001
            print(f"[on-off] {season} skipped: {error}")

    keep = sorted(set(DEFAULT_SEASONS) | set(seasons))
    write(
        PLAY_OUT,
        {
            "version": 1,
            "generatedAt": now,
            "playTypes": PLAY_TYPES,
            "seasons": {s: play_seasons[s] for s in keep if s in play_seasons},
            # zone -> [FGM, FGA], league-wide regular season.
            "leagueShotZones": {s: league_zones[s] for s in keep if s in league_zones},
        },
        "play-types",
    )
    write(
        ONOFF_OUT,
        {
            "version": 1,
            "generatedAt": now,
            "seasons": {s: onoff_seasons[s] for s in keep if s in onoff_seasons},
        },
        "on-off",
    )


if __name__ == "__main__":
    main()
