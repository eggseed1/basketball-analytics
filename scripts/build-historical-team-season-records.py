#!/usr/bin/env python3
"""
Build bundled regular-season W-L for seasons before the ESPN team board.

Stats.nba.com is disabled on Vercel and often blocked from local/CI, so History
standings for pre-2001 seasons need a static file. Source: Basketball-Reference
season standings pages (same lineage as franchise records).

Usage (repo root):
  python3 scripts/build-historical-team-season-records.py
  python3 scripts/build-historical-team-season-records.py --from 1970 --to 2001

Writes: src/data/runtime/historical-team-season-records.json
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "runtime" / "historical-team-season-records.json"
# ESPN team board starts at 2001-02; bundle everything earlier.
DEFAULT_END_START_YEAR = 2000  # last season bundled: 2000-01
DEFAULT_START_START_YEAR = 1946  # 1946-47 BAA

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

TABLE_RE = re.compile(
    r'id="((?:divs|confs)_standings_([EW]))"',
    re.I,
)
TEAM_ROW_RE = re.compile(
    r'href="/teams/([A-Z]{3})/\d+\.html"[^>]*>([^<]+)</a>'
    r'.*?data-stat="wins"[^>]*>(\d+)'
    r'.*?data-stat="losses"[^>]*>(\d+)',
    re.S,
)


def canonical_season(start_year: int) -> str:
    end = (start_year + 1) % 100
    return f"{start_year}-{end:02d}"


def fetch(url: str, attempts: int = 4) -> str:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            last = err
            time.sleep(1.5 * (attempt + 1))
    raise last  # type: ignore[misc]


def parse_standings(html: str) -> list[dict]:
    # BRef wraps large tables in comments.
    clean = html.replace("<!--", "").replace("-->", "")
    teams: list[dict] = []
    seen: set[str] = set()

    # Split on standings table markers so conference comes from the section.
    parts = TABLE_RE.split(clean)
    # parts: [pre, full_id, E|W, body, full_id, E|W, body, ...]
    i = 1
    while i + 2 < len(parts):
        conf_letter = parts[i + 1].upper()
        body = parts[i + 2]
        conference = "East" if conf_letter == "E" else "West"
        # Stop at next table-ish boundary roughly by taking until next id=
        next_id = body.find('id="')
        chunk = body if next_id < 0 else body[:next_id]
        for abbr, name, wins, losses in TEAM_ROW_RE.findall(chunk):
            key = abbr.upper()
            if key in seen:
                continue
            seen.add(key)
            teams.append(
                {
                    "brefAbbr": key,
                    "displayName": name.strip(),
                    "conference": conference,
                    "wins": int(wins),
                    "losses": int(losses),
                }
            )
        i += 3

    # Fallback: any team rows if table split failed.
    if not teams:
        for abbr, name, wins, losses in TEAM_ROW_RE.findall(clean):
            key = abbr.upper()
            if key in seen:
                continue
            seen.add(key)
            teams.append(
                {
                    "brefAbbr": key,
                    "displayName": name.strip(),
                    "conference": None,
                    "wins": int(wins),
                    "losses": int(losses),
                }
            )
    return teams


def season_urls(start_year: int, end_year: int) -> list[str]:
    """BAA through 1948-49; NBA from 1949-50 onward. Try both when unsure."""
    urls: list[str] = []
    if start_year <= 1948:
        urls.append(
            f"https://www.basketball-reference.com/leagues/BAA_{end_year}_standings.html"
        )
    urls.append(
        f"https://www.basketball-reference.com/leagues/NBA_{end_year}_standings.html"
    )
    return urls


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_year", type=int, default=DEFAULT_START_START_YEAR)
    parser.add_argument("--to", dest="to_year", type=int, default=DEFAULT_END_START_YEAR)
    parser.add_argument("--delay", type=float, default=0.85)
    args = parser.parse_args()

    prior = {}
    if OUT.exists():
        try:
            prior = json.loads(OUT.read_text(encoding="utf-8")).get("seasons") or {}
        except (OSError, ValueError):
            prior = {}

    seasons: dict[str, list[dict]] = dict(prior)
    failures: list[str] = []

    for start in range(args.from_year, args.to_year + 1):
        season = canonical_season(start)
        end_year = start + 1
        last_err: Exception | None = None
        ok = False
        for url in season_urls(start, end_year):
            try:
                html = fetch(url)
                rows = parse_standings(html)
                # Early BAA seasons had fewer than 8 clubs.
                min_teams = 6 if start <= 1949 else 8
                if len(rows) < min_teams:
                    raise RuntimeError(f"too few teams ({len(rows)})")
                seasons[season] = rows
                print(f"[ok] {season}: {len(rows)} teams")
                ok = True
                break
            except Exception as err:  # noqa: BLE001
                last_err = err
                continue
        if not ok:
            failures.append(f"{season}: {last_err}")
            print(f"[fail] {season}: {last_err}")
        time.sleep(args.delay)

    payload = {
        "source": "Basketball-Reference NBA season standings pages",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "earliestSeason": canonical_season(args.from_year),
        "latestSeason": canonical_season(args.to_year),
        "seasons": dict(sorted(seasons.items())),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[write] {OUT} ({len(payload['seasons'])} seasons)")
    if failures:
        print(f"[warn] {len(failures)} failures")
        for line in failures[:12]:
            print(f"  {line}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
