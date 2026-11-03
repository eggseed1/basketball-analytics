#!/usr/bin/env python3
"""Extract every 2025-26 NBA team's Basketball-Reference positional minute
estimates from the deocheng/nba_data public workbook archive.

Provenance: basketball-reference.com/leagues/NBA_2026_play-by-play.html
Mirrored workbooks: github.com/deocheng/nba_data/tree/main/CSV
Only the 'play by play' worksheet and player position fields are extracted.
"""
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from openpyxl import load_workbook

TEAMS = "ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split()
POSITION = ("PG", "SG", "SF", "PF", "C")
OUT = Path("artifacts/gm-bref-position-source-2026.json")


def read_team(team):
    url = f"https://raw.githubusercontent.com/deocheng/nba_data/main/CSV/2025-2026{team}.xlsx"
    try:
        request = Request(url, headers={"User-Agent": "DRBL-FranchiseLab-PositionAudit/2026"})
        with urlopen(request, timeout=35) as response:
            workbook = load_workbook(
                BytesIO(response.read()), read_only=True, data_only=True
            )
        try:
            sheet = workbook["play by play"]
            sheet.reset_dimensions()
            records = []
            headers = None
            for row in sheet.iter_rows(values_only=True):
                values = list(row)
                if (
                    len(values) >= 12
                    and str(values[1]).strip() == "Player"
                    and str(values[7]).strip() == "PG%"
                    and str(values[11]).strip() == "C%"
                ):
                    headers = True
                    continue
                if not headers:
                    continue
                if str(values[0]).strip() == "Rk" and records:
                    break
                if not isinstance(values[0], (float, int)) or len(values) < 12:
                    if records:
                        break
                    continue
                name = str(values[1] or "").strip()
                original = str(values[3] or "").strip().upper()
                if not name or original not in POSITION:
                    continue
                minutes = float(values[6] or 0)
                if minutes <= 0:
                    continue
                percentages = {
                    position: float(values[7 + idx] or 0)
                    for idx, position in enumerate(POSITION)
                }
                records.append({
                    "player": name,
                    "position": original,
                    "percentages": percentages,
                    "minutes": minutes,
                    "seasonTeam": team,
                })
            if len(records) < 9:
                raise ValueError(f"short or missing play-by-play sheet: {len(records)}")
            return team, records, None
        finally:
            workbook.close()
    except Exception as err:
        return team, [], str(err)


def main():
    results = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = {pool.submit(read_team, team): team for team in TEAMS}
        for job in as_completed(jobs):
            team, rows, error = job.result()
            results[team] = {"rows": rows, "error": error}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    summary = {
        "teams": len(results),
        "success": sum(bool(x["rows"]) for x in results.values()),
        "playerTeamRows": sum(len(x["rows"]) for x in results.values()),
        "failed": {team: data["error"] for team, data in results.items() if data["error"]},
    }
    print("BREF_POSITION_WORKBOOK_SUMMARY " + json.dumps(summary))
    print("BREF_CELTICS " + json.dumps([
        {"player": x["player"], "position": x["position"], "minutes": x["minutes"],
         "percentages": x["percentages"]}
        for x in results.get("BOS", {}).get("rows", [])
    ]))
    if summary["success"] < 25:
        raise RuntimeError("Insufficient independent team position source coverage: " + str(summary))


if __name__ == "__main__":
    main()
