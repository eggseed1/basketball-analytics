#!/usr/bin/env python3
"""Fetch 2025-26 five-position minute shares from Basketball-Reference's
league-wide play-by-play table; fail closed on missing/incorrect data.

Basketball-Reference position percentages are *estimates* of on-court role,
not definitive career identity. The Franchise Lab audit corroborates them
against ESPN five-spot depth charts and manual-reviewed player identities.
"""
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Comment

SOURCE = "https://www.basketball-reference.com/leagues/NBA_2026_play-by-play.html"
TEAMS = "ATL BOS BRK CHI CHO CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHO POR SAC SAS TOR UTA WAS".split()
POS = ("PG", "SG", "SF", "PF", "C")
OUT = Path("artifacts/gm-bref-position-source-2026.json")
ALIASES = {"BKN": "BRK", "CHA": "CHO", "PHX": "PHO", "BRK": "BRK", "CHO": "CHO", "PHO": "PHO"}

def plain(cell):
    return cell.get_text(" ", strip=True).replace("\u00a0", " ")

def identify_header(cells):
    keys = [plain(cell).replace(" ", "") for cell in cells]
    return keys if all(s in keys for s in ("Player", "Team", "Pos", "MP", "PG%", "SG%", "SF%", "PF%", "C%")) else None

def extract_table(soup):
    candidate = None
    for table in soup.select("table"):
        headers = None
        for tr in table.select("tr"):
            cells = tr.find_all(["th", "td"], recursive=False)
            if not cells:
                continue
            found = identify_header(cells)
            if found:
                headers = found
                continue
            if not headers:
                continue
            values = [plain(cell) for cell in cells]
            if len(values) != len(headers):
                continue
            row = dict(zip(headers, values))
            if row.get("Player") and row.get("Team") and row.get("Pos") in POS:
                minutes_text = row.get("MP", "0").replace(",", "")
                if not re.match(r"^\d+(?:\.\d+)?$", minutes_text):
                    continue
                minutes = float(minutes_text)
                if minutes <= 0:
                    continue
                try:
                    pct = {p: float(row[p + "%"].replace("%", "") or 0) for p in POS}
                except ValueError:
                    continue
                if not 90 <= sum(pct.values()) <= 110:
                    continue
                team = ALIASES.get(row["Team"], row["Team"])
                if team not in TEAMS and not re.match(r"^[2-5]TM$", team):
                    continue
                result = {
                    "player": row["Player"],
                    "position": row["Pos"],
                    "percentages": pct,
                    "minutes": minutes,
                    "seasonTeam": team,
                }
                if candidate is None:
                    candidate = []
                candidate.append(result)
        if candidate and len(candidate) >= 300:
            return candidate
        candidate = None
    return []

def main():
    req = Request(SOURCE, headers={
        "User-Agent": "Mozilla/5.0 (compatible; DRBL position source verifier)",
        "Accept": "text/html,application/xhtml+xml",
    })
    with urlopen(req, timeout=45) as r:
        html = r.read()
    soup = BeautifulSoup(html, "html.parser")
    rows = extract_table(soup)
    if len(rows) < 300:
        # Some Basketball-Reference tables are embedded in HTML comments.
        for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
            if "PG%" in comment and "SF%" in comment and "<table" in comment:
                rows = extract_table(BeautifulSoup(str(comment), "html.parser"))
                if len(rows) >= 300:
                    break
    if len(rows) < 300:
        raise RuntimeError(f"League-wide positional table missing/short ({len(rows)})")
    all_players = {r["player"] for r in rows}
    if len(all_players) < 300 or not any("Joki" in n for n in all_players):
        raise RuntimeError("League source did not pass player identity sanity checks")
    result = {t: {"rows": [], "error": None} for t in TEAMS}
    for row in rows:
        if row["seasonTeam"] in result:
            result[row["seasonTeam"]]["rows"].append(row)
    success = sum(bool(v["rows"]) for v in result.values())
    if success < 28:
        raise RuntimeError(f"Only {success} NBA teams had actual position records")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print("BREF_POSITION_WORKBOOK_SUMMARY " + json.dumps({
        "source": SOURCE, "teams": 30, "success": success,
        "playerTeamRows": len(rows), "uniquePlayers": len(all_players),
    }))
    print("BREF_CELTICS " + json.dumps([
        {"player": x["player"], "position": x["position"], "percentages": x["percentages"]}
        for x in result["BOS"]["rows"]
    ]))
if __name__ == "__main__":
    main()
