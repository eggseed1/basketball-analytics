"""
Bake player accolades for Cloudflare Workers from stats.nba.com playerawards.

Workers can't reach stats.nba.com, and neither can GitHub runners, so this runs
on a home machine (scripts/local/stats-nba-refresh.sh) with curl_cffi's Chrome
TLS fingerprint. Run from the repo root:

    python3 -m venv /tmp/nbavenv && /tmp/nbavenv/bin/pip install curl_cffi
    /tmp/nbavenv/bin/python scripts/build-runtime-player-awards.py          # recent players
    /tmp/nbavenv/bin/python scripts/build-runtime-player-awards.py --full   # every player (~1 h)

The default run refetches players whose careers reached the last two seasons
and keeps every other player's rows from the previous bake, so it needs a
previous --full bake. `slugs` (NBA id -> Basketball-Reference slug) is carried
over unchanged from the previous file; legend routing still depends on it.

Writes src/data/runtime/player-awards-snapshot.json only when it changed.
"""

import gzip
import json
import os
import sys
import time
from datetime import datetime, timezone

from curl_cffi import requests

ROOT = os.getcwd()
OUT = os.path.join(ROOT, "src", "data", "runtime", "player-awards-snapshot.json")
SOURCE = "stats.nba.com/playerawards"

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

# Must match descriptions in src/content/awards/catalog.ts.
DESCRIPTIONS = {
    "NBA Most Valuable Player",
    "NBA Finals Most Valuable Player",
    "NBA Defensive Player of the Year",
    "NBA Rookie of the Year",
    "All-NBA",
    "All-Defensive Team",
    "NBA All-Star",
}
TEAM_NOTES = {"1": "1st Team", "2": "2nd Team", "3": "3rd Team"}

DELAY_S = float(os.environ.get("NBA_STATS_DELAY", "0.5"))
PROBE_TIMEOUT = float(os.environ.get("NBA_STATS_PROBE_TIMEOUT", "15"))
# More failures than this means a block or outage, not a few flaky players.
MAX_FAILURE_SHARE = 0.02


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
                time.sleep(2.0 * (attempt + 1))
    raise last


def result_rows(payload):
    rs = payload["resultSets"][0]
    headers = rs["headers"]
    return [dict(zip(headers, row)) for row in rs["rowSet"]]


def current_season_start(now):
    return now.year if now.month >= 9 else now.year - 1


def all_players(season_start):
    season = f"{season_start}-{str(season_start + 1)[2:]}"
    return result_rows(
        fetch(
            "commonallplayers",
            {"LeagueID": "00", "Season": season, "IsOnlyCurrentSeason": "0"},
        )
    )


def award_rows(person_id):
    rows = []
    seen = set()
    for row in result_rows(fetch("playerawards", {"PlayerID": person_id})):
        description = str(row.get("DESCRIPTION") or "").strip()
        season = str(row.get("SEASON") or "").strip()
        if description not in DESCRIPTIONS or not season:
            continue
        key = (description, season)
        if key in seen:
            continue
        seen.add(key)
        note = TEAM_NOTES.get(str(row.get("ALL_NBA_TEAM_NUMBER") or "").strip())
        rows.append([description, season, note] if note else [description, season])
    rows.sort(key=lambda r: (r[0], r[1]))
    return rows


def read_prior():
    try:
        with open(OUT, encoding="utf8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def main():
    full = "--full" in sys.argv[1:]
    prior = read_prior() or {}
    if not full and prior.get("source") != SOURCE:
        print("[player-awards] no previous stats.nba.com bake; run with --full first")
        return 1

    try:
        fetch("playerawards", {"PlayerID": "893"}, attempts=1, timeout=PROBE_TIMEOUT)
    except Exception as error:  # noqa: BLE001
        print(f"[player-awards] stats.nba.com unreachable ({error}); keeping the last bake")
        return 1

    now = datetime.now(timezone.utc)
    recent_from = current_season_start(now) - 1
    roster = all_players(current_season_start(now))
    if len(roster) < 4000:
        print(f"[player-awards] player list has only {len(roster)} rows; keeping the last bake")
        return 1

    display = {str(p["PERSON_ID"]): str(p.get("DISPLAY_FIRST_LAST") or "").strip() for p in roster}
    targets = [
        str(p["PERSON_ID"])
        for p in roster
        if full or int(str(p.get("TO_YEAR") or "0") or 0) >= recent_from
    ]

    prior_players = prior.get("players") or {}
    target_set = set(targets)
    players = {} if full else {k: v for k, v in prior_players.items() if k not in target_set}
    failed = []
    started = time.time()
    for i, person_id in enumerate(targets, 1):
        try:
            rows = award_rows(person_id)
        except Exception:  # noqa: BLE001
            failed.append(person_id)
            rows = prior_players.get(person_id) or []
        if rows:
            players[person_id] = rows
        if i % 250 == 0:
            print(
                f"[player-awards] {i}/{len(targets)} players, {len(players)} with awards, "
                f"{len(failed)} failed, {int(time.time() - started)}s"
            )
        time.sleep(DELAY_S)

    if len(failed) > max(5, MAX_FAILURE_SHARE * len(targets)):
        print(f"[player-awards] {len(failed)} of {len(targets)} players failed; keeping the last bake")
        return 1

    prior_names = prior.get("names") or {}
    players = dict(sorted(players.items(), key=lambda kv: int(kv[0])))
    names = {pid: prior_names.get(pid) or display.get(pid) or "" for pid in players}
    names = {pid: name for pid, name in names.items() if name}
    payload = {
        "version": 3,
        "generatedAt": now.isoformat().replace("+00:00", "Z"),
        "source": SOURCE,
        "playerCount": len(players),
        "names": names,
        "slugs": prior.get("slugs") or {},
        "players": players,
    }

    def body(p):
        return json.dumps(
            {"source": p.get("source"), "names": p.get("names"), "slugs": p.get("slugs"), "players": p.get("players")},
            sort_keys=True,
        )

    if prior and body(prior) == body(payload):
        print(f"[player-awards] unchanged ({len(players)} players)")
        return 0

    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with open(OUT, "w", encoding="utf8") as fh:
        fh.write(text)
    gz = len(gzip.compress(text.encode("utf8")))
    print(
        f"[player-awards] wrote {len(players)} players from {len(targets)} fetched "
        f"({len(failed)} failed, kept prior rows), {len(text)} bytes, gzip ~{gz}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
