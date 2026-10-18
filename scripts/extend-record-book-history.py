#!/usr/bin/env python3
"""
Replace record-book leaders with published lists that start in 1946-47.

Basketball-Reference leader pages cover single games, seasons, and careers.
Wikipedia's win-streak list covers the 33-game Lakers run and the rest.
Lines those pages do not publish stay on the NBA Stats game logs from 1996-97,
and the card says so.

  ~/.cache/drbl-stats-runner/venv/bin/python scripts/extend-record-book-history.py
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone

from curl_cffi import requests

SNAP = os.path.join("src", "data", "runtime", "record-book-snapshot.json")
CACHE = os.path.join("data", "cache", "record-book", "bref")
DELAY = float(os.environ.get("BREF_DELAY", "1.1"))
BREF = "https://www.basketball-reference.com/leaders/{slug}.html"
WIKI = "https://en.wikipedia.org/wiki/List_of_NBA_longest_winning_streaks"

# record id -> (bref slug, blurb, decimals)
PLAYER_PAGES: dict[str, tuple[str, str, int]] = {}


def add_pair(prefix: str, slug: str, blurb: str, decimals: int) -> None:
    PLAYER_PAGES[f"regular-{prefix}"] = (slug, blurb, decimals)
    playoff_blurb = blurb.replace("regular season", "playoffs")
    PLAYER_PAGES[f"playoffs-{prefix}"] = (f"{slug}_p", playoff_blurb, decimals)


GAME_BLURB = "NBA/BAA regular season, from the Basketball-Reference single-game list. The list runs back to 1946-47."
SEASON_BLURB = "NBA/BAA regular season, from the Basketball-Reference season list. Qualified seasons only, back to 1946-47."
CAREER_BLURB = "NBA/BAA career total from Basketball-Reference. Seasons before a stat was recorded are not in the total. Steals and blocks start in 1973-74. Threes start in 1979-80."

for key, slug in (
    ("game-pts", "pts_game"),
    ("game-reb", "trb_game"),
    ("game-ast", "ast_game"),
    ("game-stl", "stl_game"),
    ("game-blk", "blk_game"),
    ("game-fg3m", "fg3_game"),
    ("game-ftm", "ft_game"),
    ("game-fgm", "fg_game"),
    ("game-oreb", "orb_game"),
    ("game-dreb", "drb_game"),
    ("game-tov", "tov_game"),
    ("game-min", "mp_game"),
):
    add_pair(key, slug, GAME_BLURB, 0)

for key, slug, decimals in (
    ("season-pts", "pts_season", 0),
    ("season-reb", "trb_season", 0),
    ("season-ast", "ast_season", 0),
    ("season-stl", "stl_season", 0),
    ("season-blk", "blk_season", 0),
    ("season-fg3m", "fg3_season", 0),
    ("season-ppg", "pts_per_g_season", 1),
    ("season-rpg", "trb_per_g_season", 1),
    ("season-apg", "ast_per_g_season", 1),
    ("season-spg", "stl_per_g_season", 2),
    ("season-bpg", "blk_per_g_season", 2),
    ("season-ts", "ts_pct_season", 1),
    ("season-td", "trp_dbl_season", 0),
    ("season-dd", "dbl_dbl_season", 0),
):
    add_pair(key, slug, SEASON_BLURB, decimals)

for key, slug in (
    ("pts", "pts_career"),
    ("reb", "trb_career"),
    ("ast", "ast_career"),
    ("stl", "stl_career"),
    ("blk", "blk_career"),
    ("fg3m", "fg3_career"),
    ("td", "trp_dbl_career"),
):
    PLAYER_PAGES[f"career-{key}"] = (slug, CAREER_BLURB, 0)


def fetch(url: str, cache_name: str) -> str | None:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, cache_name)
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return open(path, encoding="utf8").read()
    last = None
    for attempt in range(6):
        try:
            res = requests.get(url, impersonate="chrome", timeout=45, headers={"Accept": "text/html"})
            if res.status_code == 404:
                return None
            if res.status_code == 429:
                wait = 20 + attempt * 15
                print(f"429 {cache_name}, waiting {wait}s", flush=True)
                time.sleep(wait)
                continue
            if res.status_code != 200:
                raise RuntimeError(f"HTTP {res.status_code}")
            open(path, "w", encoding="utf8").write(res.text)
            time.sleep(DELAY)
            return res.text
        except Exception as error:  # noqa: BLE001
            last = error
            time.sleep(3 + attempt * 2)
    raise RuntimeError(f"{url} failed: {last}")


def cells_of(row: str) -> list[str]:
    found = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
    out = []
    for cell in found:
        text = re.sub(r"<[^>]+>", "", cell)
        text = text.replace("&nbsp;", " ").replace("&#39;", "'").replace("&amp;", "&")
        text = re.sub(r"\s+", " ", text).strip()
        out.append(text)
    return out


def first_table(html: str) -> str:
    html = html.replace("<!--", "").replace("-->", "")
    match = re.search(r'<table[^>]*class="[^"]*stats_table[^"]*"[^>]*>.*?</table>', html, re.S)
    if not match:
        match = re.search(r"<table[^>]*>.*?</table>", html, re.S)
    return match.group(0) if match else ""


def slug_of(row: str) -> str:
    match = re.search(r'href="/players/[a-z]/([a-z0-9]+)\.html"', row)
    return match.group(1) if match else ""


def clean_name(name: str) -> str:
    name = re.sub(r"^.*?\|", "", name)
    name = re.sub(r"\s*\(\d+\)$", "", name)
    name = re.sub(r"[\*\^†‡§]+$", "", name)
    return name.strip()


def parse_value(raw: str) -> float | None:
    text = raw.replace(",", "").replace("%", "").strip()
    if not text or text in {"-", "—"}:
        return None
    # Minutes sometimes arrive as 69:00.
    if ":" in text:
        mins, secs = text.split(":", 1)
        try:
            return int(mins) + int(secs) / 60
        except ValueError:
            return None
    try:
        return float(text)
    except ValueError:
        return None


def season_from_date(iso: str) -> str:
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})", iso)
    if not match:
        return ""
    year, month = int(match.group(1)), int(match.group(2))
    start = year if month >= 8 else year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def parse_player_leaders(html: str, old_index: dict) -> list[dict]:
    table = first_table(html)
    leaders = []
    for row in re.findall(r"<tr[^>]*>.*?</tr>", table, re.S):
        if "<td" not in row:
            continue
        cells = cells_of(row)
        if len(cells) < 3:
            continue
        # Rank, player, value, then date or season, then team.
        name = clean_name(cells[1])
        value = parse_value(cells[2])
        if not name or value is None:
            continue
        # True shooting arrives as a fraction (.700). Counting stats do not.
        if value < 1:
            value *= 100
        extra = cells[3] if len(cells) > 3 else ""
        team = cells[4] if len(cells) > 4 else ""
        date = extra if re.fullmatch(r"\d{4}-\d{2}-\d{2}", extra) else ""
        season = extra if re.fullmatch(r"\d{4}-\d{2}", extra) else season_from_date(date)
        detail_bits = [bit for bit in (extra, team) if bit and bit != date]
        detail = " · ".join(detail_bits)
        prior = old_index.get((norm(name), date))
        leaders.append(
            {
                "playerId": (prior or {}).get("playerId") or "",
                "brefId": slug_of(row),
                "name": name,
                "team": team or (prior or {}).get("team") or "",
                "opponent": (prior or {}).get("opponent") or "",
                "date": date,
                "season": season or (prior or {}).get("season") or "",
                "gameId": (prior or {}).get("gameId") or "",
                "value": round(value, 3),
                "detail": detail or (prior or {}).get("detail") or "",
            }
        )
        if len(leaders) >= 12:
            break
    return leaders


def parse_team_rows(html: str) -> list[tuple[float, str, str, str]]:
    """Return (value, name, season, detail) from a team leader page."""
    table = first_table(html)
    rows = []
    for row in re.findall(r"<tr[^>]*>.*?</tr>", table, re.S):
        cells = cells_of(row)
        if len(cells) < 3:
            continue
        value = parse_value(cells[0])
        if value is None:
            continue
        name = clean_name(cells[1])
        season = cells[2].replace("–", "-")
        detail = cells[3] if len(cells) > 3 else ""
        rows.append((value, name, season, detail))
    return rows


def page_window(html: str) -> str:
    """Year the Basketball-Reference page says its list starts, or empty."""
    match = re.search(r"leaders since the (\d{4}(?:-\d{2})?) season", html)
    return match.group(1) if match else ""


MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
}


def iso_from_prose(text: str) -> str:
    match = re.search(
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})",
        text,
    )
    if not match:
        return ""
    month = MONTHS[match.group(1)]
    return f"{match.group(3)}-{month:02d}-{int(match.group(2)):02d}"


def load_aliases() -> dict[str, dict]:
    path = os.path.join("src", "data", "runtime", "player-id-aliases-snapshot.json")
    with open(path, encoding="utf8") as handle:
        rows = json.load(handle).get("aliases") or []
    by_name: dict[str, dict] = {}
    for row in rows:
        key = norm(row.get("playerName") or "")
        if not key:
            continue
        current = by_name.get(key)
        if current and current.get("brefSlug"):
            continue
        by_name[key] = row
    return by_name


def wiki_single_games(html: str, aliases: dict[str, dict], old_index: dict) -> tuple[list[dict], list[dict]]:
    """Regular-season and playoff rows. Green cells are the playoff games."""
    tables = re.findall(r'<table class="wikitable.*?">.*?</table>', html, re.S)
    table = ""
    for candidate in tables:
        if "Player" in candidate and candidate.count("<tr") > 10:
            table = candidate
            break
    regular: list[dict] = []
    playoffs: list[dict] = []
    carried: float | None = None
    for row in re.findall(r"<tr[^>]*>.*?</tr>", table, re.S):
        texts = cells_of(row)
        if not texts or texts[0] in {"Player", "Rebounds", "Assists", "Blocks", "Steals"}:
            continue
        playoff = "AFE6BA" in row
        if re.fullmatch(r"\d+", texts[0]):
            carried = float(texts[0])
            body = texts[1:]
        elif carried is None:
            continue
        else:
            body = texts
        name = re.sub(r"\s*\(\d+\)$", "", clean_name(body[0] if body else ""))
        if not name or not re.search(r"[A-Za-z]", name):
            continue
        date = ""
        for cell in body:
            date = iso_from_prose(cell)
            if date:
                break
        team = ""
        for cell in body[1:]:
            if iso_from_prose(cell) or re.search(r"\d+\s*[–-]\s*\d+", cell):
                continue
            if re.search(r"[A-Za-z]", cell):
                team = cell
                break
        alias = aliases.get(norm(name)) or {}
        prior = old_index.get((norm(name), date))
        leader = {
            "playerId": (prior or {}).get("playerId") or str(alias.get("nbaPlayerId") or ""),
            "brefId": (alias.get("brefSlug") or "").lower(),
            "name": name,
            "team": team,
            "opponent": "",
            "date": date,
            "season": season_from_date(date),
            "gameId": (prior or {}).get("gameId") or "",
            "value": carried,
            "detail": team,
        }
        (playoffs if playoff else regular).append(leader)
    return regular, playoffs


def wiki_column(headers: list[str], needles: tuple[str, ...], require_all: bool = True) -> int:
    for index, header in enumerate(headers):
        low = header.lower()
        hits = [needle in low for needle in needles]
        if (all(hits) if require_all else any(hits)):
            return index
    return -1


def wiki_ranked(html: str, value_needles: tuple[str, ...], aliases: dict[str, dict]) -> list[dict]:
    """A Wikipedia ranking whose header row names the player and the value."""
    tables = re.findall(r'<table class="wikitable.*?">.*?</table>', html, re.S)
    for table in tables:
        rows = re.findall(r"<tr[^>]*>.*?</tr>", table, re.S)
        headers: list[str] | None = None
        leaders = []
        for row in rows:
            texts = cells_of(row)
            if not texts:
                continue
            if headers is None:
                if any("player" in cell.lower() or cell.lower() == "name" for cell in texts):
                    headers = texts
                continue
            if len(texts) < len(headers):
                continue
            name_at = wiki_column(headers, ("player", "name"), require_all=False)
            value_at = wiki_column(headers, value_needles)
            if name_at < 0 or value_at < 0 or name_at >= len(texts) or value_at >= len(texts):
                continue
            value = parse_value(texts[value_at])
            name = re.sub(r"\s*\(\d+\)$", "", clean_name(texts[name_at]))
            if value is None or not name or not re.search(r"[A-Za-z]", name):
                continue
            season_at = wiki_column(headers, ("season",))
            team_at = wiki_column(headers, ("team",))
            season = ""
            if season_at >= 0 and season_at < len(texts):
                found = re.search(r"\d{4}[-–]\d{2}", texts[season_at])
                season = found.group(0).replace("–", "-") if found else ""
            team = texts[team_at] if team_at >= 0 and team_at < len(texts) else ""
            team_header = headers[team_at].lower() if team_at >= 0 else ""
            if "played" in team_header or "years" in team_header or len(team) > 48:
                team = ""
            alias = aliases.get(norm(name)) or {}
            leaders.append(
                {
                    "playerId": str(alias.get("nbaPlayerId") or ""),
                    "brefId": (alias.get("brefSlug") or "").lower(),
                    "name": name,
                    "team": team if season else "",
                    "opponent": "",
                    "date": "",
                    "season": season,
                    "gameId": "",
                    "value": round(value, 3),
                    "detail": " · ".join(bit for bit in (season, team) if bit and not bit.lower().startswith("team(")),
                }
            )
            if len(leaders) >= 12:
                break
        if len(leaders) >= 3:
            return leaders
    return []


def wiki_win_seasons(html: str) -> list[dict]:
    tables = re.findall(r'<table class="wikitable.*?">.*?</table>', html, re.S)
    leaders = []
    for table in tables:
        for row in re.findall(r"<tr[^>]*>.*?</tr>", table, re.S):
            texts = cells_of(row)
            if len(texts) < 9 or not re.fullmatch(r"\.\d+", texts[0]):
                continue
            wins = parse_value(texts[1])
            if wins is None:
                continue
            season = texts[8].replace("–", "-")
            leaders.append(
                {
                    "playerId": "",
                    "name": texts[7],
                    "team": "",
                    "opponent": "",
                    "date": "",
                    "season": season if re.fullmatch(r"\d{4}-\d{2}", season) else "",
                    "gameId": "",
                    "value": wins,
                    "detail": f"{int(wins)}-{texts[2]} · {season}",
                }
            )
    leaders.sort(key=lambda item: (-item["value"], item["season"], item["name"]))
    return leaders[:12]


def wiki_streaks(html: str) -> tuple[list[dict], list[dict]]:
    html = html.replace("<!--", "").replace("-->", "")
    tables = re.findall(r'<table class="wikitable.*?">.*?</table>', html, re.S)
    parsed: list[list[dict]] = []
    for table in tables:
        leaders = []
        for row in re.findall(r"<tr[^>]*>.*?</tr>", table, re.S):
            cells = cells_of(row)
            if len(cells) < 4 or not re.match(r"^\d+", cells[0]):
                continue
            games_raw = cells[1]
            match = re.match(r"(\d+)", games_raw)
            if not match:
                continue
            games = int(match.group(1))
            team = clean_name(cells[2])
            season = cells[3].replace("–", "-").replace("—", "-")
            found = re.search(r"\d{4}-\d{2}", season)
            season = found.group(0) if found else ""
            season_label = cells[3].replace("–", "-").replace("—", "-").replace("*", " ")
            season_label = re.sub(r"\s+", " ", season_label).strip(" ,")
            detail = f"{games_raw} wins, {season_label}"
            if "(" in games_raw:
                detail += ". The published streak crosses two seasons."
            leaders.append(
                {
                    "playerId": "",
                    "name": team,
                    "team": "",
                    "opponent": "",
                    "date": "",
                    "season": season[:7] if re.match(r"\d{4}-\d{2}", season) else "",
                    "gameId": "",
                    "value": games,
                    "detail": detail,
                }
            )
        if leaders:
            parsed.append(leaders)
    regular = parsed[0] if parsed else []
    playoffs = parsed[1] if len(parsed) > 1 else []
    return regular[:12], playoffs[:12]


def main() -> None:
    with open(SNAP, encoding="utf8") as f:
        book = json.load(f)
    old_index = {}
    for rec in book["records"]:
        for leader in rec["leaders"]:
            if leader.get("date") and leader.get("gameId"):
                old_index[(norm(leader["name"]), leader["date"])] = leader

    replaced = 0
    by_id = {rec["id"]: rec for rec in book["records"]}
    for rec_id, (slug, blurb, decimals) in PLAYER_PAGES.items():
        rec = by_id.get(rec_id)
        if rec is None:
            continue
        if not os.path.exists(os.path.join(CACHE, f"{slug}.html")):
            print("skip uncached", slug, flush=True)
            continue
        html = fetch(BREF.format(slug=slug), f"{slug}.html")
        if not html:
            print("missing", slug, flush=True)
            continue
        leaders = parse_player_leaders(html, old_index)
        if len(leaders) < 3:
            print("short", slug, len(leaders), flush=True)
            continue
        window = page_window(html)
        partial = "game" in rec_id and bool(window) and not window.startswith("194")
        if partial:
            blurb = f"Basketball-Reference single-game list. That page starts in {window}, so earlier games are not on it."
        elif window and not window.startswith("194"):
            blurb = blurb.rstrip(".") + f". The published list starts in {window}."
        rec["leaders"] = leaders
        rec["blurb"] = blurb
        rec["decimals"] = decimals
        rec["coverage"] = "partial" if partial else "all-time"
        replaced += 1
        print(f"{rec_id}: {leaders[0]['value']} {leaders[0]['name']}", flush=True)

    # Team season wins and points per game. The wins page is ordered by win
    # percentage, so the win total is read from the record in the notes.
    for rec_id, slug, kind in (
        ("regular-team-season-wins", "team_wins", "wins"),
        ("playoffs-team-season-wins", "team_post_wins", "wins"),
        ("regular-team-season-ppg", "team_pts", "ppg"),
    ):
        rec = by_id.get(rec_id)
        if rec and not os.path.exists(os.path.join(CACHE, f"{slug}.html")):
            print("skip uncached", slug, flush=True)
            continue
        html = fetch(BREF.format(slug=slug), f"{slug}.html") if rec else None
        if not rec or not html:
            continue
        rows = parse_team_rows(html)
        leaders = []
        peak = rows[0][0] if rows else 0
        for value, name, season, detail in rows:
            if kind == "ppg" and peak - value > 20:
                break
            shown = value
            text = detail
            if kind == "wins":
                win = re.match(r"(\d+)", detail or "")
                if not win:
                    continue
                shown = float(win.group(1))
                text = detail
            leaders.append(
                {
                    "playerId": "",
                    "name": name,
                    "team": "",
                    "opponent": "",
                    "date": "",
                    "season": season if re.match(r"\d{4}-\d{2}", season) else "",
                    "gameId": "",
                    "value": round(shown, 3),
                    "detail": " · ".join(bit for bit in (text, season) if bit),
                }
            )
            if len(leaders) >= 12:
                break
        if kind == "wins":
            leaders.sort(key=lambda item: (-item["value"], item["season"], item["name"]))
        if len(leaders) >= 3:
            rec["leaders"] = leaders
            rec["blurb"] = "From the Basketball-Reference team season list, back to 1946-47."
            rec["decimals"] = 1 if kind == "ppg" else 0
            rec["coverage"] = "all-time"
            replaced += 1
            print(f"{rec_id}: {leaders[0]['value']} {leaders[0]['name']}", flush=True)

    aliases = load_aliases()
    wiki_games = {
        "reb": "https://en.wikipedia.org/wiki/List_of_NBA_single-game_rebounding_leaders",
        "ast": "https://en.wikipedia.org/wiki/List_of_NBA_single-game_assists_leaders",
        "blk": "https://en.wikipedia.org/wiki/List_of_NBA_single-game_blocks_leaders",
        "stl": "https://en.wikipedia.org/wiki/List_of_NBA_single-game_steals_leaders",
    }
    wiki_blurbs = {
        "reb": "From the Wikipedia single-game rebounding list, back to the start of the league.",
        "ast": "From the Wikipedia single-game assists list, back to the start of the league.",
        "blk": "From the Wikipedia single-game blocks list. The league started recording blocks in 1973-74.",
        "stl": "From the Wikipedia single-game steals list. The league started recording steals in 1973-74.",
    }
    for key, url in wiki_games.items():
        html = fetch(url, f"wiki-{key}.html")
        if not html:
            continue
        regular, playoff = wiki_single_games(html, aliases, old_index)
        for scope, leaders in (("regular", regular), ("playoffs", playoff)):
            rec = by_id.get(f"{scope}-game-{key}")
            if not rec or not leaders:
                continue
            current = rec["leaders"][0]["value"] if rec["leaders"] else 0
            if leaders[0]["value"] < current:
                print(f"wiki {scope}-{key} {leaders[0]['value']} is under the current {current}", flush=True)
                continue
            if scope == "playoffs" and len(leaders) < 3:
                print(f"wiki playoff {key} has only {len(leaders)} rows", flush=True)
                continue
            rec["leaders"] = leaders[:12]
            rec["blurb"] = wiki_blurbs[key]
            rec["decimals"] = 0
            rec["coverage"] = "all-time"
            replaced += 1
            print(f"wiki {scope}-game-{key}: {leaders[0]['value']} {leaders[0]['name']}", flush=True)

    def use_ranked(rec_id: str, leaders: list[dict], blurb: str, title: str, decimals: int) -> None:
        nonlocal replaced
        rec = by_id.get(rec_id)
        if not rec or len(leaders) < 3:
            return
        if rec.get("coverage") == "all-time" and not rec_id.startswith("career"):
            if rec_id in {"regular-season-ppg", "regular-team-season-wins"}:
                rec["blurb"] = blurb
                rec["title"] = title
            return
        rec["leaders"] = leaders[:12]
        rec["blurb"] = blurb
        rec["title"] = title
        rec["decimals"] = decimals
        rec["coverage"] = "all-time"
        replaced += 1
        print(f"wiki {rec_id}: {leaders[0]['value']} {leaders[0]['name']}", flush=True)

    ranked_pages = [
        ("career-pts", "https://en.wikipedia.org/wiki/List_of_NBA_career_scoring_leaders", "wiki-career-pts.html", ("total points",), "Career points", "From the Wikipedia career scoring list, back to the start of the league."),
        ("career-reb", "https://en.wikipedia.org/wiki/List_of_NBA_career_rebounding_leaders", "wiki-career-reb.html", ("total rebounds",), "Career rebounds", "From the Wikipedia career rebounding list, back to the start of the league."),
        ("career-ast", "https://en.wikipedia.org/wiki/List_of_NBA_career_assists_leaders", "wiki-career-ast.html", ("total assists",), "Career assists", "From the Wikipedia career assists list, back to the start of the league."),
        ("career-stl", "https://en.wikipedia.org/wiki/List_of_NBA_career_steals_leaders", "wiki-career-stl.html", ("total steals",), "Career steals", "From the Wikipedia career steals list. The league started recording steals in 1973-74."),
        ("career-blk", "https://en.wikipedia.org/wiki/List_of_NBA_career_blocks_leaders", "wiki-career-blk.html", ("total blocks",), "Career blocks", "From the Wikipedia career blocks list. The league started recording blocks in 1973-74."),
        ("career-fg3m", "https://en.wikipedia.org/wiki/List_of_NBA_career_3-point_scoring_leaders", "wiki-career-3.html", ("total", "3-point"), "Career threes", "From the Wikipedia career threes list. Threes start in 1979-80."),
        ("career-td", "https://en.wikipedia.org/wiki/List_of_NBA_career_triple-double_leaders", "wiki-career-td.html", ("total triple",), "Career triple-doubles", "From the Wikipedia career triple-double list."),
        ("regular-season-reb", "https://en.wikipedia.org/wiki/List_of_NBA_single-season_rebounding_leaders", "wiki-season-reb.html", ("total rebounds",), "Rebounds in a season"),
        ("regular-season-ast", "https://en.wikipedia.org/wiki/List_of_NBA_single-season_assists_leaders", "wiki-season-ast.html", ("total assists",), "Assists in a season"),
        ("regular-season-stl", "https://en.wikipedia.org/wiki/List_of_NBA_single-season_steals_leaders", "wiki-season-stl.html", ("total steals",), "Steals in a season"),
        ("regular-season-blk", "https://en.wikipedia.org/wiki/List_of_NBA_single-season_blocks_leaders", "wiki-season-blk.html", ("total blocks",), "Blocks in a season"),
        ("regular-season-fg3m", "https://en.wikipedia.org/wiki/List_of_NBA_single-season_3-point_field_goal_leaders", "wiki-season-3.html", ("total", "3-point"), "Threes in a season"),
        ("regular-season-td", "https://en.wikipedia.org/wiki/List_of_NBA_single-season_triple-double_leaders", "wiki-season-td.html", ("triple-double",), "Triple-doubles in a season"),
    ]
    season_blurb = "From the Wikipedia single-season list, back to the start of the league."
    for rec_id, url, cache_name, needles, title, *rest in ranked_pages:
        html = fetch(url, cache_name)
        if not html:
            print("no page", cache_name, flush=True)
            continue
        leaders = wiki_ranked(html, needles, aliases)
        blurb = rest[0] if rest else season_blurb
        use_ranked(rec_id, leaders, blurb, title, 0)

    scoring = fetch("https://en.wikipedia.org/wiki/List_of_NBA_single-season_scoring_leaders", "wiki-season-pts.html")
    if scoring:
        use_ranked(
            "regular-season-ppg",
            wiki_ranked(scoring, ("points per game",), aliases),
            "Points per game, from the Wikipedia single-season scoring list.",
            "Points per game",
            1,
        )

    wins_html = fetch("https://en.wikipedia.org/wiki/List_of_NBA_teams_by_single_season_win_percentage", "wiki-win-pct.html")
    if wins_html:
        use_ranked(
            "regular-team-season-wins",
            wiki_win_seasons(wins_html),
            "Wins in a season, from the Wikipedia list of the best single-season records.",
            "Wins in a season",
            0,
        )

    nuggets = {
        "playerId": "",
        "name": "Denver Nuggets",
        "team": "",
        "opponent": "",
        "date": "",
        "season": "1981-82",
        "gameId": "",
        "value": 126.5,
        "detail": "1981-82",
    }
    ppg = by_id.get("regular-team-season-ppg")
    if ppg and ppg.get("coverage") != "all-time" and ppg["leaders"] and ppg["leaders"][0]["value"] < 126.5:
        ppg["leaders"] = [nuggets]
        ppg["blurb"] = "Wikipedia lists the Nuggets at 126.5 points per game in 1981-82. The page does not give the full ranking, so the other seasons are left off."
        ppg["decimals"] = 1
        ppg["coverage"] = "all-time"
        replaced += 1
        print("wiki regular-team-season-ppg: 126.5 Denver Nuggets", flush=True)

    wiki = fetch(WIKI, "wiki-win-streaks.html")
    if wiki:
        regular, playoff = wiki_streaks(wiki)
        for rec_id, leaders in (("regular-team-win-streak", regular), ("playoffs-team-win-streak", playoff)):
            rec = by_id.get(rec_id)
            if rec and leaders:
                rec["leaders"] = leaders
                rec["blurb"] = "From the Wikipedia list of the longest streaks. A note on the line marks a streak that crossed two seasons."
                rec["decimals"] = 0
                rec["coverage"] = "all-time"
                replaced += 1
                print(f"{rec_id}: {leaders[0]['value']} {leaders[0]['name']}", flush=True)

    # 60- and 70-point counts are complete when the single-game list reaches the 50s.
    for scope, slug in (("regular", "pts_game"), ("playoffs", "pts_game_p")):
        html = fetch(BREF.format(slug=slug), f"{slug}.html")
        if not html:
            continue
        leaders = parse_player_leaders(html, old_index)
        # parse_player_leaders stops at 12. Re-parse without the cap by calling a fuller walk.
        table = first_table(html)
        values = []
        full = []
        for row in re.findall(r"<tr[^>]*>.*?</tr>", table, re.S):
            cells = cells_of(row)
            if len(cells) < 3:
                continue
            value = parse_value(cells[2])
            if value is None:
                continue
            values.append(value)
            if len(full) < 8:
                name = clean_name(cells[1])
                extra = cells[3] if len(cells) > 3 else ""
                team = cells[4] if len(cells) > 4 else ""
                date = extra if re.match(r"\d{4}-\d{2}-\d{2}", extra) else ""
                full.append(
                    {
                        "playerId": "",
                        "brefId": slug_of(row),
                        "name": name,
                        "team": team,
                        "opponent": "",
                        "date": date,
                        "season": season_from_date(date),
                        "gameId": "",
                        "value": value,
                        "detail": " · ".join(bit for bit in (date, team) if bit),
                    }
                )
        if not values or min(values) > 59:
            print("points list does not reach 59", scope, min(values) if values else None, flush=True)
            continue
        for threshold, shape_id in ((60, f"{scope}-pts60"), (70, f"{scope}-pts70")):
            shape = next((item for item in book["shapes"] if item["id"] == shape_id), None)
            if not shape:
                continue
            count = sum(1 for value in values if value >= threshold)
            examples = [item for item in full if item["value"] >= threshold][:8]
            # full only kept 8 overall, so rebuild examples from a second pass if needed
            if threshold == 70 and len(examples) < min(8, count):
                examples = []
                for row in re.findall(r"<tr[^>]*>.*?</tr>", table, re.S):
                    cells = cells_of(row)
                    if len(cells) < 3:
                        continue
                    value = parse_value(cells[2])
                    if value is None or value < threshold:
                        continue
                    extra = cells[3] if len(cells) > 3 else ""
                    date = extra if re.match(r"\d{4}-\d{2}-\d{2}", extra) else ""
                    examples.append(
                        {
                            "playerId": "",
                            "brefId": slug_of(row),
                            "name": clean_name(cells[1]),
                            "team": cells[4] if len(cells) > 4 else "",
                            "opponent": "",
                            "date": date,
                            "season": season_from_date(date),
                            "gameId": "",
                            "value": value,
                            "detail": " · ".join(bit for bit in (date, cells[4] if len(cells) > 4 else "") if bit),
                        }
                    )
                    if len(examples) >= 8:
                        break
            shape["count"] = count
            shape["examples"] = examples or shape["examples"]
            shape["window"] = ""
            print(f"{shape_id}: {count}", flush=True)

    for shape in book["shapes"]:
        shape.setdefault("window", "since 1996-97")

    for rec in book["records"]:
        if rec.get("coverage") in {"all-time", "partial"}:
            continue
        rec["coverage"] = "since-1996"
        if "1996-97" not in rec["blurb"]:
            rec["blurb"] = rec["blurb"].rstrip(".") + ". Counted from NBA Stats game logs, 1996-97 on. Earlier seasons are not in this list."

    pts = by_id["regular-game-pts"]["leaders"][0]
    if pts["value"] != 100 or "Chamberlain" not in pts["name"]:
        raise SystemExit(f"points high is not Wilt's 100: {pts}")
    reb = by_id["regular-game-reb"]["leaders"][0]
    if reb["value"] < 50 or "Chamberlain" not in reb["name"]:
        raise SystemExit(f"rebound high looks short: {reb}")
    blocks = by_id["regular-game-blk"]["leaders"][0]
    if blocks["value"] < 17 or "Smith" not in blocks["name"]:
        raise SystemExit(f"block high looks short: {blocks}")
    steals = by_id["regular-game-stl"]["leaders"]
    if steals[0]["value"] < 11 or not any("Kenon" in leader["name"] for leader in steals[:4]):
        raise SystemExit(f"steal high looks short: {steals[:3]}")
    streak = by_id["regular-team-win-streak"]["leaders"][0]
    if streak["value"] != 33 or "Lakers" not in streak["name"]:
        raise SystemExit(f"win streak is not the 33-game Lakers run: {streak}")
    career_pts = by_id["career-pts"]["leaders"][0]
    if career_pts["value"] < 42000 or "James" not in career_pts["name"]:
        raise SystemExit(f"career points look short: {career_pts}")
    if by_id["career-reb"]["leaders"][0]["value"] < 20000:
        raise SystemExit(f"career rebounds look short: {by_id['career-reb']['leaders'][0]}")
    if by_id["career-ast"]["leaders"][0]["value"] < 14000:
        raise SystemExit(f"career assists look short: {by_id['career-ast']['leaders'][0]}")
    if by_id["regular-season-ppg"]["leaders"][0]["value"] < 45:
        raise SystemExit(f"season scoring rate looks short: {by_id['regular-season-ppg']['leaders'][0]}")
    if by_id["regular-team-season-ppg"]["leaders"][0]["value"] < 126:
        raise SystemExit(f"team scoring rate looks short: {by_id['regular-team-season-ppg']['leaders'][0]}")

    known_slugs = {}
    for rec in book["records"]:
        for leader in rec["leaders"]:
            if leader.get("brefId"):
                known_slugs.setdefault(norm(leader["name"]), leader["brefId"])
    for rec in book["records"]:
        for leader in rec["leaders"]:
            if not leader.get("brefId"):
                slug = known_slugs.get(norm(leader["name"]))
                if slug:
                    leader["brefId"] = slug

    book["fromSeason"] = "1946-47"
    book["source"] = "Basketball-Reference leaderboards, Wikipedia win streaks, NBA Stats game logs"
    book["builtAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    book["note"] = (
        "Single games, seasons, careers, and team streaks run back to the 1946-47 BAA season, from Basketball-Reference and Wikipedia. "
        "A Basketball-Reference single-game page that starts in 1983-84 says so on the card. "
        "Plus-minus, combined box totals, player streaks, and most rare-line counts are counted from NBA Stats game logs, 1996-97 through "
        f"{book['throughSeason']}. Those cards say so too."
    )
    tmp = SNAP + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(book, f, separators=(",", ":"))
    os.replace(tmp, SNAP)
    print(f"updated {replaced} lists", flush=True)


if __name__ == "__main__":
    main()
