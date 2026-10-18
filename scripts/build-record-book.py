#!/usr/bin/env python3
"""
Build the site record book from NBA Stats league game logs.

The book starts at 1996-97, the first season those logs cover. It does not
include earlier games. Play-in games are left out. Career totals are only the
games inside the book.

  ~/.cache/drbl-stats-runner/venv/bin/python scripts/build-record-book.py

Raw responses are cached under data/cache/record-book/ (gitignored).
The site snapshot is src/data/runtime/record-book-snapshot.json.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone

from curl_cffi import requests

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}
CACHE = os.path.join("data", "cache", "record-book")
OUT = os.path.join("src", "data", "runtime", "record-book-snapshot.json")
DELAY_S = float(os.environ.get("NBA_STATS_DELAY", "0.35"))
KEEP = 12


def seasons() -> list[str]:
    # 1996-97 through 2026-27. An empty current season is skipped later.
    return [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2027)]


def fetch(endpoint: str, params: dict) -> dict:
    last = None
    for attempt in range(5):
        try:
            res = requests.get(
                f"https://stats.nba.com/stats/{endpoint}",
                params=params,
                headers=HEADERS,
                impersonate="chrome",
                timeout=120,
            )
            if res.status_code != 200:
                raise RuntimeError(f"HTTP {res.status_code}")
            return res.json()
        except Exception as error:  # noqa: BLE001
            last = error
            time.sleep(2 + 3 * attempt)
    raise RuntimeError(f"{endpoint} {params.get('Season')} {params.get('SeasonType')} failed: {last}")


def rows_of(payload: dict) -> tuple[list[str], list[list]]:
    rs = payload["resultSets"][0]
    return rs["headers"], rs["rowSet"]


def cache_path(kind: str, scope: str, season: str) -> str:
    return os.path.join(CACHE, f"{kind}-{scope}-{season}.json")


def load_log(kind: str, scope: str, season: str, season_type: str) -> list[dict]:
    path = cache_path(kind, scope, season)
    if os.path.exists(path) and os.path.getsize(path) > 20:
        with open(path, encoding="utf8") as f:
            return json.load(f)
    payload = fetch(
        "leaguegamelog",
        {
            "Counter": 0,
            "Direction": "ASC",
            "LeagueID": "00",
            "PlayerOrTeam": "P" if kind == "player" else "T",
            "Season": season,
            "SeasonType": season_type,
            "Sorter": "DATE",
        },
    )
    headers, rowset = rows_of(payload)
    index = {name: i for i, name in enumerate(headers)}

    def cell(row, name):
        i = index.get(name)
        if i is None or i >= len(row):
            return None
        return row[i]

    out = []
    for row in rowset:
        if kind == "player":
            out.append(
                {
                    "pid": str(cell(row, "PLAYER_ID") or ""),
                    "name": cell(row, "PLAYER_NAME") or "",
                    "abbr": cell(row, "TEAM_ABBREVIATION") or "",
                    "gid": str(cell(row, "GAME_ID") or ""),
                    "date": str(cell(row, "GAME_DATE") or "")[:10],
                    "matchup": cell(row, "MATCHUP") or "",
                    "wl": cell(row, "WL") or "",
                    "min": cell(row, "MIN"),
                    "fgm": cell(row, "FGM"),
                    "fga": cell(row, "FGA"),
                    "fg3m": cell(row, "FG3M"),
                    "fg3a": cell(row, "FG3A"),
                    "ftm": cell(row, "FTM"),
                    "fta": cell(row, "FTA"),
                    "oreb": cell(row, "OREB"),
                    "dreb": cell(row, "DREB"),
                    "reb": cell(row, "REB"),
                    "ast": cell(row, "AST"),
                    "stl": cell(row, "STL"),
                    "blk": cell(row, "BLK"),
                    "tov": cell(row, "TOV"),
                    "pts": cell(row, "PTS"),
                    "pm": cell(row, "PLUS_MINUS"),
                    "season": season,
                    "scope": scope,
                }
            )
        else:
            out.append(
                {
                    "abbr": cell(row, "TEAM_ABBREVIATION") or "",
                    "name": cell(row, "TEAM_NAME") or "",
                    "gid": str(cell(row, "GAME_ID") or ""),
                    "date": str(cell(row, "GAME_DATE") or "")[:10],
                    "matchup": cell(row, "MATCHUP") or "",
                    "wl": cell(row, "WL") or "",
                    "fgm": cell(row, "FGM"),
                    "fga": cell(row, "FGA"),
                    "fg3m": cell(row, "FG3M"),
                    "ftm": cell(row, "FTM"),
                    "fta": cell(row, "FTA"),
                    "reb": cell(row, "REB"),
                    "ast": cell(row, "AST"),
                    "stl": cell(row, "STL"),
                    "blk": cell(row, "BLK"),
                    "tov": cell(row, "TOV"),
                    "pts": cell(row, "PTS"),
                    "season": season,
                    "scope": scope,
                }
            )
    os.makedirs(CACHE, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(out, f, separators=(",", ":"))
    os.replace(tmp, path)
    time.sleep(DELAY_S)
    return out


def num(v) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v)
    if ":" in s:
        mins, secs = s.split(":", 1)
        try:
            return int(mins) + int(secs) / 60
        except ValueError:
            return None
    try:
        return float(s)
    except ValueError:
        return None


def opp_of(matchup: str, abbr: str) -> str:
    parts = str(matchup).replace("vs.", "@").split("@")
    for part in parts:
        side = part.strip()
        if side and side != abbr:
            return side
    return ""


def box_line(r: dict) -> str:
    bits = [f"{int(r['pts'])} pts"]
    for key, label in (("reb", "reb"), ("ast", "ast"), ("stl", "stl"), ("blk", "blk"), ("fg3m", "3PM"), ("tov", "TOV")):
        v = num(r.get(key))
        if v is None:
            continue
        bits.append(f"{int(v)} {label}")
    where = r.get("matchup") or r.get("abbr") or ""
    return ", ".join(bits) + (f" · {where}" if where else "")


def consider(buckets: dict, key: str, value: float | None, leader: dict, order: str = "high") -> None:
    if value is None:
        return
    arr = buckets.setdefault(key, [])
    arr.append((value, leader))
    if len(arr) > 60:
        if order == "low":
            arr.sort(key=lambda item: (item[0], item[1]["date"], item[1]["name"]))
        else:
            arr.sort(key=lambda item: (-item[0], item[1]["date"], item[1]["name"]))
        del arr[KEEP * 3 :]


def trim(arr: list, order: str) -> list[dict]:
    if order == "low":
        arr.sort(key=lambda item: (item[0], item[1]["date"], item[1]["name"]))
    else:
        arr.sort(key=lambda item: (-item[0], item[1]["date"], item[1]["name"]))
    if not arr:
        return []
    cutoff = arr[min(7, len(arr) - 1)][0]
    kept = []
    for value, leader in arr:
        if order == "low" and value > cutoff and len(kept) >= 8:
            break
        if order == "high" and value < cutoff and len(kept) >= 8:
            break
        if len(kept) >= 15:
            break
        kept.append({**leader, "value": round(value, 3)})
    return kept


def leader_from_player(r: dict, detail: str) -> dict:
    return {
        "playerId": r["pid"],
        "name": r["name"],
        "team": r["abbr"],
        "opponent": opp_of(r["matchup"], r["abbr"]),
        "date": r["date"],
        "season": r["season"],
        "gameId": r["gid"],
        "detail": detail,
    }


def leader_from_team(r: dict, detail: str) -> dict:
    return {
        "playerId": "",
        "name": r["name"] or r["abbr"],
        "team": r["abbr"],
        "opponent": opp_of(r["matchup"], r["abbr"]),
        "date": r["date"],
        "season": r["season"],
        "gameId": r["gid"],
        "detail": detail,
    }


def record(rid: str, group: str, scope: str, title: str, blurb: str, leaders: list, decimals: int = 0, order: str = "high") -> dict:
    return {
        "id": rid,
        "group": group,
        "scope": scope,
        "title": title,
        "blurb": blurb,
        "decimals": decimals,
        "order": order,
        "leaders": leaders,
    }


def shape_row(r: dict) -> dict:
    return leader_from_player(r, box_line(r))


def main() -> None:
    scopes = [("regular", "Regular Season"), ("playoffs", "Playoffs")]
    player_rows: list[dict] = []
    team_rows: list[dict] = []
    included: list[str] = []
    for season in seasons():
        got = False
        for scope, season_type in scopes:
            players = load_log("player", scope, season, season_type)
            teams = load_log("team", scope, season, season_type)
            print(f"{season} {scope}: {len(players)} player rows, {len(teams)} team rows", flush=True)
            if players or teams:
                got = True
            player_rows.extend(players)
            team_rows.extend(teams)
        if got:
            included.append(season)
        elif season != seasons()[-1]:
            raise SystemExit(f"missing logs for {season}")

    if not player_rows:
        raise SystemExit("no player rows")

    buckets: dict[str, list] = {}
    shapes: dict[str, dict] = {}

    def add_shape(key: str, title: str, scope: str, r: dict, rank_value: float) -> None:
        slot = shapes.setdefault(key, {"id": key, "scope": scope, "title": title, "count": 0, "examples": []})
        slot["count"] += 1
        consider_examples = slot["examples"]
        consider_examples.append((rank_value, shape_row(r)))
        if len(consider_examples) > 40:
            consider_examples.sort(key=lambda item: (-item[0], item[1]["date"]))
            del consider_examples[20:]

    season_acc: dict[tuple, dict] = {}
    career_acc: dict[str, dict] = {}
    # streaks within a season: (scope, pid, season) -> state
    streak_best: dict[str, list] = {}

    def bump_streak(key: str, pid_state: dict, ok: bool, r: dict, label: str) -> None:
        if ok:
            if pid_state["run"] == 0:
                pid_state["start"] = r["date"]
                pid_state["startTeam"] = r["abbr"]
            pid_state["run"] += 1
            pid_state["end"] = r["date"]
            pid_state["endTeam"] = r["abbr"]
            pid_state["name"] = r["name"]
            pid_state["pid"] = r["pid"]
            pid_state["season"] = r["season"]
            if pid_state["run"] > pid_state["best"]:
                pid_state["best"] = pid_state["run"]
                pid_state["bestStart"] = pid_state["start"]
                pid_state["bestEnd"] = pid_state["end"]
                pid_state["bestTeam"] = pid_state["endTeam"]
        else:
            pid_state["run"] = 0

    streak_state: dict[tuple, dict] = {}
    streak_kinds = [
        ("pts20", "20 or more points", lambda r: (num(r["pts"]) or 0) >= 20),
        ("pts30", "30 or more points", lambda r: (num(r["pts"]) or 0) >= 30),
        ("pts40", "40 or more points", lambda r: (num(r["pts"]) or 0) >= 40),
        ("reb10", "10 or more rebounds", lambda r: (num(r["reb"]) or 0) >= 10),
        ("ast10", "10 or more assists", lambda r: (num(r["ast"]) or 0) >= 10),
        ("dd", "a double-double", lambda r: sum(1 for k in ("pts", "reb", "ast") if (num(r[k]) or 0) >= 10) >= 2),
        ("td", "a triple-double", lambda r: sum(1 for k in ("pts", "reb", "ast") if (num(r[k]) or 0) >= 10) >= 3),
        ("threes5", "5 or more threes", lambda r: (num(r["fg3m"]) or 0) >= 5),
    ]

    player_rows.sort(key=lambda r: (r["season"], r["date"], r["gid"], r["pid"]))

    for r in player_rows:
        played = num(r["min"])
        if played is None or played <= 0:
            continue
        pts = num(r["pts"]) or 0
        reb = num(r["reb"]) or 0
        ast = num(r["ast"]) or 0
        stl = num(r["stl"]) or 0
        blk = num(r["blk"]) or 0
        fg3m = num(r["fg3m"]) or 0
        fg3a = num(r["fg3a"]) or 0
        fgm = num(r["fgm"]) or 0
        fga = num(r["fga"]) or 0
        ftm = num(r["ftm"]) or 0
        fta = num(r["fta"]) or 0
        oreb = num(r["oreb"])
        dreb = num(r["dreb"])
        tov = num(r["tov"])
        pm = num(r["pm"])
        minutes = played
        scope = r["scope"]
        base = leader_from_player(r, box_line(r))

        singles = {
            "pts": pts,
            "reb": reb,
            "ast": ast,
            "stl": stl,
            "blk": blk,
            "fg3m": fg3m,
            "ftm": ftm,
            "fgm": fgm,
            "oreb": oreb,
            "dreb": dreb,
            "tov": tov,
            "pm": pm,
            "min": minutes,
            "pra": pts + reb + ast,
            "pr": pts + reb,
            "pa": pts + ast,
            "stocks": stl + blk,
        }
        for key, value in singles.items():
            consider(buckets, f"{scope}-game-{key}", value, base)

        if fg3m == 0 and pts >= 30:
            consider(buckets, f"{scope}-game-pts-no-three", pts, base)
        if fg3a >= 8 and fg3m == fg3a:
            consider(buckets, f"{scope}-game-perfect-threes", fg3m, base)
        if fga >= 12 and fgm == fga:
            consider(buckets, f"{scope}-game-perfect-fg", fgm, base)
        if (tov or 0) == 0 and minutes >= 30 and (pts >= 25 or ast >= 10):
            consider(buckets, f"{scope}-game-clean", pts + ast, base)

        scope_word = "regular-season" if scope == "regular" else "playoff"
        checks = [
            (pts >= 50, f"{scope}-pts50", f"50 or more points, {scope_word}", pts),
            (pts >= 60, f"{scope}-pts60", f"60 or more points, {scope_word}", pts),
            (pts >= 70, f"{scope}-pts70", f"70 or more points, {scope_word}", pts),
            (reb >= 20, f"{scope}-reb20", f"20 or more rebounds, {scope_word}", reb),
            (reb >= 25, f"{scope}-reb25", f"25 or more rebounds, {scope_word}", reb),
            (ast >= 18, f"{scope}-ast18", f"18 or more assists, {scope_word}", ast),
            (ast >= 20, f"{scope}-ast20", f"20 or more assists, {scope_word}", ast),
            (stl >= 8, f"{scope}-stl8", f"8 or more steals, {scope_word}", stl),
            (blk >= 10, f"{scope}-blk10", f"10 or more blocks, {scope_word}", blk),
            (fg3m >= 10, f"{scope}-threes10", f"10 or more threes, {scope_word}", fg3m),
            (fg3m >= 12, f"{scope}-threes12", f"12 or more threes, {scope_word}", fg3m),
            (pts >= 5 and reb >= 5 and ast >= 5 and stl >= 5 and blk >= 5, f"{scope}-five", f"5 or more in points, rebounds, assists, steals, and blocks, {scope_word}", pts),
            (pts >= 20 and reb >= 20, f"{scope}-20reb", f"20 points and 20 rebounds, {scope_word}", pts + reb),
            (pts >= 20 and ast >= 20, f"{scope}-20ast", f"20 points and 20 assists, {scope_word}", pts + ast),
            (pts >= 40 and reb >= 10 and ast >= 10, f"{scope}-40td", f"40-point triple-double, {scope_word}", pts),
            (stl >= 5 and blk >= 5, f"{scope}-5stocks", f"5 steals and 5 blocks, {scope_word}", stl + blk),
        ]
        for ok, key, title, rank in checks:
            if ok:
                add_shape(key, title, scope, r, rank)

        acc_key = (scope, r["pid"], r["season"])
        acc = season_acc.get(acc_key)
        if acc is None:
            acc = {
                "pid": r["pid"],
                "name": r["name"],
                "season": r["season"],
                "scope": scope,
                "abbr": r["abbr"],
                "gp": 0,
                "pts": 0,
                "reb": 0,
                "ast": 0,
                "stl": 0,
                "blk": 0,
                "fg3m": 0,
                "fgm": 0,
                "fga": 0,
                "ftm": 0,
                "fta": 0,
                "tov": 0,
                "g30": 0,
                "g40": 0,
                "g50": 0,
                "td": 0,
                "dd": 0,
                "threes5": 0,
                "ast10": 0,
                "reb15": 0,
            }
            season_acc[acc_key] = acc
        acc["gp"] += 1
        acc["abbr"] = r["abbr"]
        acc["name"] = r["name"]
        for stat in ("pts", "reb", "ast", "stl", "blk", "fg3m", "fgm", "fga", "ftm", "fta"):
            acc[stat] += num(r[stat]) or 0
        acc["tov"] += tov or 0
        if pts >= 30:
            acc["g30"] += 1
        if pts >= 40:
            acc["g40"] += 1
        if pts >= 50:
            acc["g50"] += 1
        cats = sum(1 for v in (pts, reb, ast) if v >= 10)
        if cats >= 2:
            acc["dd"] += 1
        if cats >= 3:
            acc["td"] += 1
        if fg3m >= 5:
            acc["threes5"] += 1
        if ast >= 10:
            acc["ast10"] += 1
        if reb >= 15:
            acc["reb15"] += 1

        if scope == "regular":
            car = career_acc.get(r["pid"])
            if car is None:
                car = {"pid": r["pid"], "name": r["name"], "gp": 0, "pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0, "fg3m": 0, "td": 0, "g50": 0, "seasons": set()}
                career_acc[r["pid"]] = car
            car["name"] = r["name"]
            car["gp"] += 1
            car["seasons"].add(r["season"])
            for stat in ("pts", "reb", "ast", "stl", "blk", "fg3m"):
                car[stat] += num(r[stat]) or 0
            if cats >= 3:
                car["td"] += 1
            if pts >= 50:
                car["g50"] += 1

        for kind, _label, pred in streak_kinds:
            st_key = (scope, kind, r["pid"], r["season"])
            state = streak_state.get(st_key)
            if state is None:
                state = {"run": 0, "best": 0}
                streak_state[st_key] = state
            bump_streak(kind, state, pred(r), r, _label)

    for (scope, kind, _pid, _season), state in streak_state.items():
        if state["best"] < 5:
            continue
        team = state.get("bestTeam") or ""
        start = state.get("bestStart") or ""
        end = state.get("bestEnd") or ""
        detail = f"{int(state['best'])} games, {start} to {end}"
        if state.get("startTeam") and state.get("bestTeam") and state["startTeam"] != state["bestTeam"]:
            detail += f" · {state['startTeam']} to {team}"
        elif team:
            detail += f" · {team}"
        consider(
            streak_best,
            f"{scope}-streak-{kind}",
            state["best"],
            {
                "playerId": state.get("pid") or "",
                "name": state.get("name") or "",
                "team": team,
                "opponent": "",
                "date": end,
                "season": state.get("season") or "",
                "gameId": "",
                "detail": detail,
            },
        )

    # Team games paired for margin and combined points.
    by_game: dict[str, list] = {}
    for r in team_rows:
        if num(r["pts"]) is None:
            continue
        by_game.setdefault(r["gid"], []).append(r)
    team_season: dict[tuple, dict] = {}
    team_streak: dict[tuple, dict] = {}
    for gid, sides in by_game.items():
        if len(sides) != 2:
            continue
        a, b = sides
        pa, pb = num(a["pts"]) or 0, num(b["pts"]) or 0
        if pa + pb < 40:
            continue
        for r, opp_pts in ((a, pb), (b, pa)):
            scope = r["scope"]
            margin = (num(r["pts"]) or 0) - opp_pts
            detail = f"{int(num(r['pts']) or 0)}-{int(opp_pts)} · {r['matchup']}"
            base = leader_from_team(r, detail)
            consider(buckets, f"{scope}-team-pts", num(r["pts"]), base)
            consider(buckets, f"{scope}-team-pts-low", num(r["pts"]), base, "low")
            consider(buckets, f"{scope}-team-margin", margin, base)
            consider(buckets, f"{scope}-team-combined", pa + pb, base)
            for stat, key in (("fg3m", "fg3m"), ("ast", "ast"), ("reb", "reb"), ("stl", "stl"), ("blk", "blk")):
                consider(buckets, f"{scope}-team-{key}", num(r.get(stat)), base)
            acc_key = (scope, r["abbr"], r["season"])
            acc = team_season.get(acc_key)
            if acc is None:
                acc = {"name": r["name"], "abbr": r["abbr"], "season": r["season"], "scope": scope, "w": 0, "l": 0, "pts": 0, "opp": 0, "fg3m": 0, "gp": 0}
                team_season[acc_key] = acc
            acc["gp"] += 1
            acc["pts"] += num(r["pts"]) or 0
            acc["opp"] += opp_pts
            acc["fg3m"] += num(r.get("fg3m")) or 0
            acc["name"] = r["name"] or acc["name"]
            won = r["wl"] == "W" or margin > 0
            if won:
                acc["w"] += 1
            else:
                acc["l"] += 1
            st_key = (scope, r["abbr"], r["season"])
            st = team_streak.get(st_key)
            if st is None:
                st = {"run": 0, "best": 0, "name": r["name"], "season": r["season"]}
                team_streak[st_key] = st
            if won:
                if st["run"] == 0:
                    st["start"] = r["date"]
                st["run"] += 1
                st["end"] = r["date"]
                if st["run"] > st["best"]:
                    st["best"] = st["run"]
                    st["bestStart"] = st["start"]
                    st["bestEnd"] = st["end"]
            else:
                st["run"] = 0

    def season_leader(acc: dict, detail: str) -> dict:
        return {
            "playerId": acc["pid"],
            "name": acc["name"],
            "team": acc["abbr"],
            "opponent": "",
            "date": "",
            "season": acc["season"],
            "gameId": "",
            "detail": detail,
        }

    gp_floor = {"regular": 58, "playoffs": 10}
    fga_floor = {"regular": 400, "playoffs": 80}
    for acc in season_acc.values():
        scope = acc["scope"]
        detail_gp = f"{int(acc['gp'])} games · {acc['season']}"
        base_counts = {
            "pts": acc["pts"],
            "reb": acc["reb"],
            "ast": acc["ast"],
            "stl": acc["stl"],
            "blk": acc["blk"],
            "fg3m": acc["fg3m"],
            "g30": acc["g30"],
            "g40": acc["g40"],
            "g50": acc["g50"],
            "td": acc["td"],
            "dd": acc["dd"],
            "threes5": acc["threes5"],
            "ast10": acc["ast10"],
            "reb15": acc["reb15"],
        }
        for key, value in base_counts.items():
            consider(buckets, f"{scope}-season-{key}", value, season_leader(acc, f"{int(value)} · {detail_gp}"))
        if acc["gp"] >= gp_floor[scope]:
            consider(buckets, f"{scope}-season-ppg", acc["pts"] / acc["gp"], season_leader(acc, f"{acc['pts'] / acc['gp']:.1f} points per game · {detail_gp}"))
            consider(buckets, f"{scope}-season-rpg", acc["reb"] / acc["gp"], season_leader(acc, f"{acc['reb'] / acc['gp']:.1f} rebounds per game · {detail_gp}"))
            consider(buckets, f"{scope}-season-apg", acc["ast"] / acc["gp"], season_leader(acc, f"{acc['ast'] / acc['gp']:.1f} assists per game · {detail_gp}"))
            consider(buckets, f"{scope}-season-spg", acc["stl"] / acc["gp"], season_leader(acc, f"{acc['stl'] / acc['gp']:.2f} steals per game · {detail_gp}"))
            consider(buckets, f"{scope}-season-bpg", acc["blk"] / acc["gp"], season_leader(acc, f"{acc['blk'] / acc['gp']:.2f} blocks per game · {detail_gp}"))
        tsa = acc["fga"] + 0.44 * acc["fta"]
        if acc["fga"] >= fga_floor[scope] and tsa > 0:
            ts = acc["pts"] / (2 * tsa)
            consider(buckets, f"{scope}-season-ts", ts * 100, season_leader(acc, f"{ts * 100:.1f}% true shooting · {int(acc['fga'])} FGA · {detail_gp}"))

    for car in career_acc.values():
        seasons_n = len(car["seasons"])
        detail = f"{int(car['gp'])} regular-season games · {seasons_n} seasons in this book"
        base = {
            "playerId": car["pid"],
            "name": car["name"],
            "team": "",
            "opponent": "",
            "date": "",
            "season": "",
            "gameId": "",
            "detail": detail,
        }
        for key in ("pts", "reb", "ast", "stl", "blk", "fg3m", "td", "g50"):
            consider(buckets, f"career-{key}", car[key], {**base, "detail": f"{int(car[key])} · {detail}"})

    for acc in team_season.values():
        scope = acc["scope"]
        detail = f"{acc['w']}-{acc['l']} · {acc['season']}"
        base = {
            "playerId": "",
            "name": acc["name"] or acc["abbr"],
            "team": acc["abbr"],
            "opponent": "",
            "date": "",
            "season": acc["season"],
            "gameId": "",
            "detail": detail,
        }
        consider(buckets, f"{scope}-team-season-wins", acc["w"], base)
        if acc["gp"] >= (50 if scope == "regular" else 8):
            consider(buckets, f"{scope}-team-season-diff", (acc["pts"] - acc["opp"]) / acc["gp"], {**base, "detail": f"{(acc['pts'] - acc['opp']) / acc['gp']:+.1f} point differential per game · {detail}"})
            consider(buckets, f"{scope}-team-season-ppg", acc["pts"] / acc["gp"], {**base, "detail": f"{acc['pts'] / acc['gp']:.1f} points per game · {detail}"})
            consider(buckets, f"{scope}-team-season-threes", acc["fg3m"] / acc["gp"], {**base, "detail": f"{acc['fg3m'] / acc['gp']:.1f} threes per game · {detail}"})

    for (scope, abbr, season), st in team_streak.items():
        if st["best"] < 5:
            continue
        consider(
            buckets,
            f"{scope}-team-win-streak",
            st["best"],
            {
                "playerId": "",
                "name": st["name"] or abbr,
                "team": abbr,
                "opponent": "",
                "date": st.get("bestEnd") or "",
                "season": season,
                "gameId": "",
                "detail": f"{int(st['best'])} wins in a row, {st.get('bestStart', '')} to {st.get('bestEnd', '')}",
            },
        )

    scope_label = {"regular": "Regular season", "playoffs": "Playoffs"}

    def emit_game(scope: str) -> list[dict]:
        word = "regular-season" if scope == "regular" else "playoff"
        floor_note = "One game. Play-in games are not included."
        specs = [
            ("pts", "Points in a game", 0),
            ("reb", "Rebounds in a game", 0),
            ("ast", "Assists in a game", 0),
            ("stl", "Steals in a game", 0),
            ("blk", "Blocks in a game", 0),
            ("fg3m", "Threes in a game", 0),
            ("ftm", "Free throws made in a game", 0),
            ("fgm", "Field goals made in a game", 0),
            ("oreb", "Offensive rebounds in a game", 0),
            ("dreb", "Defensive rebounds in a game", 0),
            ("tov", "Turnovers in a game", 0),
            ("pm", "Plus-minus in a game", 0),
            ("min", "Minutes in a game", 0),
            ("pra", "Points + rebounds + assists in a game", 0),
            ("pr", "Points + rebounds in a game", 0),
            ("pa", "Points + assists in a game", 0),
            ("stocks", "Steals + blocks in a game", 0),
            ("pts-no-three", "Points in a game with no threes made", 0),
            ("perfect-threes", "Threes made without a miss (at least 8 attempts)", 0),
            ("perfect-fg", "Field goals made without a miss (at least 12 attempts)", 0),
            ("clean", "Points + assists with no turnovers, in at least 30 minutes", 0),
        ]
        out = []
        for key, title, decimals in specs:
            leaders = trim(buckets.get(f"{scope}-game-{key}", []), "high")
            if not leaders:
                continue
            out.append(record(f"{scope}-game-{key}", "game", scope, title, f"{scope_label[scope]}. {floor_note}", leaders, decimals))
        return out

    def emit_season(scope: str) -> list[dict]:
        floor = gp_floor[scope]
        fga = fga_floor[scope]
        specs = [
            ("pts", "Points in a season", "Season total.", 0),
            ("reb", "Rebounds in a season", "Season total.", 0),
            ("ast", "Assists in a season", "Season total.", 0),
            ("stl", "Steals in a season", "Season total.", 0),
            ("blk", "Blocks in a season", "Season total.", 0),
            ("fg3m", "Threes in a season", "Season total.", 0),
            ("ppg", "Points per game", f"At least {floor} games.", 1),
            ("rpg", "Rebounds per game", f"At least {floor} games.", 1),
            ("apg", "Assists per game", f"At least {floor} games.", 1),
            ("spg", "Steals per game", f"At least {floor} games.", 2),
            ("bpg", "Blocks per game", f"At least {floor} games.", 2),
            ("ts", "True shooting percentage", f"At least {fga} field-goal attempts. True shooting is points / (2 x (FGA + 0.44 x FTA)).", 1),
            ("g30", "30-point games in a season", "Games with 30 or more points.", 0),
            ("g40", "40-point games in a season", "Games with 40 or more points.", 0),
            ("g50", "50-point games in a season", "Games with 50 or more points.", 0),
            ("td", "Triple-doubles in a season", "Points, rebounds, and assists all 10 or more.", 0),
            ("dd", "Double-doubles in a season", "Two of points, rebounds, and assists at 10 or more.", 0),
            ("threes5", "Games with 5 or more threes", "Season count.", 0),
            ("ast10", "Games with 10 or more assists", "Season count.", 0),
            ("reb15", "Games with 15 or more rebounds", "Season count.", 0),
        ]
        out = []
        for key, title, blurb, decimals in specs:
            leaders = trim(buckets.get(f"{scope}-season-{key}", []), "high")
            if not leaders:
                continue
            out.append(record(f"{scope}-season-{key}", "season", scope, title, f"{scope_label[scope]}. {blurb}", leaders, decimals))
        return out

    records: list[dict] = []
    for scope in ("regular", "playoffs"):
        records.extend(emit_game(scope))
        records.extend(emit_season(scope))
        for kind, label, _pred in streak_kinds:
            leaders = trim(streak_best.get(f"{scope}-streak-{kind}", []), "high")
            if not leaders:
                continue
            records.append(
                record(
                    f"{scope}-streak-{kind}",
                    "streak",
                    scope,
                    f"Consecutive games with {label}",
                    f"{scope_label[scope]}. Counted within one season, across the games he played.",
                    leaders,
                )
            )
        team_specs = [
            ("pts", "Points by a team", "high", "One team, one game."),
            ("pts-low", "Fewest points by a team", "low", "One team, one game. Games under 40 combined points are left out."),
            ("margin", "Victory margin", "high", "One team, one game."),
            ("combined", "Combined points", "high", "Both teams, one game."),
            ("fg3m", "Threes by a team", "high", "One team, one game."),
            ("ast", "Assists by a team", "high", "One team, one game."),
            ("reb", "Rebounds by a team", "high", "One team, one game."),
            ("stl", "Steals by a team", "high", "One team, one game."),
            ("blk", "Blocks by a team", "high", "One team, one game."),
        ]
        for key, title, order, blurb in team_specs:
            raw = buckets.get(f"{scope}-team-{key}", [])
            if order == "low":
                raw = [(v, L) for v, L in raw]
            leaders = trim(raw, order)
            if not leaders:
                continue
            records.append(record(f"{scope}-team-{key}", "team-game", scope, title, f"{scope_label[scope]}. {blurb}", leaders, 0, order))
        for key, title, blurb, decimals in (
            ("wins", "Wins in a season", "Team wins.", 0),
            ("diff", "Point differential per game", "At least 50 regular-season games, or 8 playoff games.", 1),
            ("ppg", "Points per game by a team", "At least 50 regular-season games, or 8 playoff games.", 1),
            ("threes", "Threes per game by a team", "At least 50 regular-season games, or 8 playoff games.", 1),
        ):
            leaders = trim(buckets.get(f"{scope}-team-season-{key}", []), "high")
            if not leaders:
                continue
            records.append(record(f"{scope}-team-season-{key}", "team-season", scope, title, f"{scope_label[scope]}. {blurb}", leaders, decimals))
        leaders = trim(buckets.get(f"{scope}-team-win-streak", []), "high")
        if leaders:
            records.append(
                record(
                    f"{scope}-team-win-streak",
                    "streak",
                    scope,
                    "Consecutive team wins",
                    f"{scope_label[scope]}. Within one season.",
                    leaders,
                )
            )

    career_specs = [
        ("pts", "Points"),
        ("reb", "Rebounds"),
        ("ast", "Assists"),
        ("stl", "Steals"),
        ("blk", "Blocks"),
        ("fg3m", "Threes"),
        ("td", "Triple-doubles"),
        ("g50", "50-point games"),
    ]
    for key, title in career_specs:
        leaders = trim(buckets.get(f"career-{key}", []), "high")
        if not leaders:
            continue
        records.append(
            record(
                f"career-{key}",
                "career",
                "regular",
                f"{title} since 1996-97",
                "Regular season only. Seasons before 1996-97 are not in the total. A player who debuted earlier is missing those years.",
                leaders,
            )
        )

    shape_out = []
    for key, slot in shapes.items():
        examples = trim(slot["examples"], "high")
        shape_out.append({**slot, "examples": examples})
    shape_out.sort(key=lambda s: (s["scope"], s["count"], s["id"]))

    dates = [r["date"] for r in player_rows if r.get("date")]
    through = max(dates) if dates else ""
    regular_games = len({r["gid"] for r in team_rows if r["scope"] == "regular"})
    playoff_games = len({r["gid"] for r in team_rows if r["scope"] == "playoffs"})

    # Kobe's 81 has to be in the regular-season points list. A later game can sit above it.
    pts_rec = next(r for r in records if r["id"] == "regular-game-pts")
    if not any(leader["value"] >= 81 and "Bryant" in leader["name"] for leader in pts_rec["leaders"]):
        raise SystemExit(f"Kobe's 81 is missing from the points list: {pts_rec['leaders'][:3]}")
    if pts_rec["leaders"][0]["value"] < 81:
        raise SystemExit(f"regular-season points high looks short: {pts_rec['leaders'][0]}")

    book = {
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "NBA Stats leaguegamelog",
        "fromSeason": included[0],
        "throughSeason": included[-1],
        "throughDate": through,
        "regularSeasonGames": regular_games,
        "playoffGames": playoff_games,
        "playerGameRows": len(player_rows),
        "seasons": included,
        "note": "NBA Stats game logs from 1996-97 on. Play-in games are not included. Totals labeled since 1996-97 omit anything earlier, so they are not full career totals for players who debuted before then.",
        "records": records,
        "shapes": shape_out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(book, f, separators=(",", ":"))
    os.replace(tmp, OUT)
    print(
        f"wrote {OUT}: {len(records)} records, {len(shape_out)} shapes, through {through}",
        flush=True,
    )


if __name__ == "__main__":
    main()
