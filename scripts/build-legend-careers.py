"""
Legend careers (pre-1996-97 players) from stats.nba.com.

Rewrites public/runtime/legend-careers/{letter}.json, keyed by Basketball-
Reference slug because legend routes still use bref:{slug}:
  - NBA seasons and bios come from playercareerstats, commonplayerinfo and
    drafthistory, cached once per player in data/cache/nba-legends/ (retired
    players don't change).
  - NBA Stats has no ABA seasons. ABA rows already in the shards stay as they
    are, marked "ABA" in column 26, and are never refetched.
  - The advanced rows ("a") stay as they are until the site-wide decision on
    BRef metrics (WS/BPM/VORP).
  - Players with no NBA person id keep only their ABA rows. A few early
    players NBA Stats has no record of, and ids whose fetch keeps failing,
    keep their existing entry unchanged.

stats.nba.com drops GitHub and Cloudflare clients; run on the home machine:

    ~/.cache/drbl-stats-runner/venv/bin/python scripts/build-legend-careers.py          # fetch missing, then emit
    ~/.cache/drbl-stats-runner/venv/bin/python scripts/build-legend-careers.py --emit   # emit from cache only
"""

import json
import os
import re
import sys
import time

from curl_cffi import requests

ROOT = os.getcwd()
SHARD_DIR = os.path.join(ROOT, "public", "runtime", "legend-careers")
CACHE_DIR = os.path.join(ROOT, "data", "cache", "nba-legends")
ALIAS_PATHS = [
    os.path.join(ROOT, "data", "impact", "legend-player-aliases.json"),
    os.path.join(ROOT, "data", "impact", "player-id-aliases.json"),
    os.path.join(ROOT, "src", "data", "runtime", "player-id-aliases-snapshot.json"),
]
AWARDS_PATH = os.path.join(ROOT, "src", "data", "runtime", "player-awards-snapshot.json")

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}
DELAY_S = float(os.environ.get("NBA_STATS_DELAY", "0.5"))
FIRST_ABA_SEASON = "1967-68"
LAST_ABA_SEASON = "1975-76"
# BRef team codes for ABA clubs, used only for players with no NBA person id.
ABA_TEAMS = set(
    "ANA CAR DLC DNA DNR FLO HSM INA KEN LAS MMC MMF MMP MMS MMT MNM MNP NJA NOB NYA "
    "OAK PTC PTP SAA SDA SDS SSL TEX UTS VIR WSA".split()
)
# Starts were first recorded in 1981-82 (BRef starts its GS column there too).
FIRST_GS_SEASON = "1981-82"


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
            return {rs["name"]: rs for rs in res.json()["resultSets"]}
        except Exception as error:  # noqa: BLE001 - retry any transport error
            last = error
            if attempt + 1 < attempts:
                time.sleep(2.0 * (attempt + 1))
    raise last


def rows_of(result_set):
    return [dict(zip(result_set["headers"], row)) for row in result_set["rowSet"]]


def read_json(path, default=None):
    try:
        with open(path, encoding="utf8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def write_json(path, data):
    with open(path, "w", encoding="utf8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))


def load_shards():
    shards = {}
    for name in sorted(os.listdir(SHARD_DIR)):
        if name.endswith(".json"):
            shards.update(read_json(os.path.join(SHARD_DIR, name), {}))
    return shards


def wikidata_pairs():
    path = os.path.join(CACHE_DIR, "wikidata-nba-bref.json")
    cached = read_json(path)
    if cached:
        return cached
    res = requests.post(
        "https://query.wikidata.org/sparql",
        data={"query": "SELECT ?nba ?bref WHERE { ?item wdt:P3647 ?nba . ?item wdt:P2685 ?bref . }"},
        headers={"Accept": "application/sparql-results+json", "User-Agent": "drbl.io-build/1.0 (https://drbl.io)"},
        timeout=60,
    )
    res.raise_for_status()
    pairs = [[b["bref"]["value"], b["nba"]["value"]] for b in res.json()["results"]["bindings"]]
    write_json(path, pairs)
    return pairs


def slug_to_nba_id(slugs, shards):
    ids = {}

    def add(slug, nba_id):
        slug = str(slug or "").strip().lower().split("/")[-1]
        nba_id = str(nba_id or "").strip()
        if slug in slugs and nba_id.isdigit() and slug not in ids:
            ids[slug] = nba_id

    for path in ALIAS_PATHS:
        for row in (read_json(path, {}) or {}).get("aliases", []):
            add(row.get("brefSlug"), row.get("nbaPlayerId"))
    for nba_id, slug in ((read_json(AWARDS_PATH, {}) or {}).get("slugs") or {}).items():
        add(slug, nba_id)
    for slug, nba_id in wikidata_pairs():
        add(slug, nba_id)

    # Last resort: one exact name match among players whose careers overlap.
    path = os.path.join(CACHE_DIR, "commonallplayers.json")
    roster = read_json(path)
    if roster is None:
        roster = rows_of(fetch("commonallplayers", {"LeagueID": "00", "Season": "2025-26", "IsOnlyCurrentSeason": "0"})["CommonAllPlayers"])
        write_json(path, roster)
    by_name = {}
    for p in roster:
        by_name.setdefault(norm(p.get("DISPLAY_FIRST_LAST")), []).append(p)
    for slug in slugs:
        if slug in ids:
            continue
        career = shards.get(slug) or {}
        name = norm((career.get("b") or {}).get("n"))
        seasons = [r[0] for r in career.get("t") or [] if r[0] > LAST_ABA_SEASON or r[1] not in ABA_TEAMS]
        if not name or not seasons:
            continue
        first, last = int(min(seasons)[:4]), int(max(seasons)[:4])
        hits = [
            p for p in by_name.get(name, [])
            if int(p["FROM_YEAR"] or 0) <= last and int(p["TO_YEAR"] or 0) >= first
        ]
        if len(hits) == 1 and str(hits[0]["PERSON_ID"]) not in ids.values():
            ids[slug] = str(hits[0]["PERSON_ID"])
    return ids


def norm(name):
    text = str(name or "").lower()
    text = re.sub(r"[^a-z0-9 ]+", "", text.replace("-", " "))
    return re.sub(r"\s+", " ", text).strip()


def fetch_missing(nba_ids):
    todo = [i for i in sorted(set(nba_ids)) if not os.path.exists(os.path.join(CACHE_DIR, f"{i}.json"))]
    print(f"[legend-careers] {len(set(nba_ids))} NBA ids, {len(todo)} not cached")
    failed = 0
    started = time.time()
    for n, nba_id in enumerate(todo, 1):
        try:
            career = fetch("playercareerstats", {"PlayerID": nba_id, "PerMode": "Totals", "LeagueID": "00"})
            time.sleep(DELAY_S)
            info = fetch("commonplayerinfo", {"PlayerID": nba_id, "LeagueID": "00"})
            write_json(
                os.path.join(CACHE_DIR, f"{nba_id}.json"),
                {
                    "seasons": rows_of(career["SeasonTotalsRegularSeason"]),
                    "info": (rows_of(info["CommonPlayerInfo"]) or [{}])[0],
                },
            )
        except Exception as error:  # noqa: BLE001
            failed += 1
            print(f"[legend-careers] {nba_id} failed: {error}")
        if n % 250 == 0:
            print(f"[legend-careers] {n}/{len(todo)} fetched, {failed} failed, {int(time.time() - started)}s")
        time.sleep(DELAY_S)
    return failed


def draft_lines():
    path = os.path.join(CACHE_DIR, "drafthistory.json")
    picks = read_json(path)
    if picks is None:
        picks = rows_of(fetch("drafthistory", {"LeagueID": "00"})["DraftHistory"])
        write_json(path, picks)
    lines = {}
    for p in picks:
        team = f"{p.get('TEAM_CITY') or ''} {p.get('TEAM_NAME') or ''}".strip()
        rnd, pick, overall, year = p.get("ROUND_NUMBER"), p.get("ROUND_PICK"), p.get("OVERALL_PICK"), p.get("SEASON")
        if not (team and rnd and pick and overall and year):
            continue
        league = "BAA" if int(year) <= 1948 else "NBA"
        lines[str(p["PERSON_ID"])] = (
            f"{team}, {ordinal(rnd)} round ({ordinal(pick)} pick, {ordinal(overall)} overall), {year} {league} Draft"
        )
    return lines


def ordinal(n):
    n = int(n)
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def num(value):
    return None if value is None else value


def pct(made, att):
    return round(made / att, 4) if made is not None and att else None


NBA_TO_BREF_TEAM = {
    "PHX": "PHO", "PHL": "PHI", "GOS": "GSW", "SAN": "SAS", "UTH": "UTA", "BLT": "BAL",
    "MIH": "MLH", "BOM": "STB", "DEF": "DTF", "TCB": "TRI", "JET": "INJ", "DN": "DNN",
    "HUS": "TRH", "BKN": "BRK",
}


def bref_team(code, season):
    """Team codes as the rest of the site (and BRef) spell them; some depend on the season."""
    code = (code or "").strip()
    year = int(season[:4])
    if code == "WAS":
        return "WSC" if year <= 1950 else "WSB" if 1974 <= year <= 1996 else "WAS"
    if code == "BAL" and year <= 1954:
        return "BLB"
    if code == "KCK" and 1972 <= year <= 1974:
        return "KCO"
    if code == "CHA" and year >= 2014:
        return "CHO"
    return NBA_TO_BREF_TEAM.get(code, code)


def nba_totals(seasons):
    by_season = {}
    for r in seasons:
        by_season.setdefault(r["SEASON_ID"], []).append(r)
    out = []
    for season in sorted(by_season):
        rows = by_season[season]
        tot = next((r for r in rows if r["TEAM_ABBREVIATION"] == "TOT"), None)
        r = tot or rows[0]
        fgm, fga, fg3m, fg3a = num(r["FGM"]), num(r["FGA"]), num(r["FG3M"]), num(r["FG3A"])
        threes = fg3m if fg3m is not None else (0 if season < "1979-80" else None)
        efg = round((fgm + 0.5 * threes) / fga, 4) if fgm is not None and threes is not None and fga else None
        gs = num(r["GS"]) if season >= FIRST_GS_SEASON else None
        age = int(r["PLAYER_AGE"]) if r.get("PLAYER_AGE") is not None else None
        out.append([
            season, bref_team(r["TEAM_ABBREVIATION"], season), 1 if tot else 0, num(r["GP"]), gs, num(r["MIN"]),
            num(r["PTS"]), num(r["REB"]), num(r["AST"]), num(r["STL"]), num(r["BLK"]), num(r["TOV"]),
            pct(fgm, fga), pct(fg3m, fg3a), pct(num(r["FTM"]), num(r["FTA"])), efg,
            fgm, fga, fg3m, fg3a, num(r["FTM"]), num(r["FTA"]),
            num(r["OREB"]), num(r["DREB"]), num(r["PF"]), age,
        ])
    return out


def aba_rows(totals, nba_seasons, mapped):
    rows = []
    for r in totals:
        if not FIRST_ABA_SEASON <= r[0] <= LAST_ABA_SEASON:
            continue
        if mapped and (r[0] in nba_seasons or (r[1] not in ABA_TEAMS and r[1] != "TOT")):
            continue
        if not mapped and r[1] not in ABA_TEAMS and r[1] != "TOT":
            continue
        padded = list(r) + [None] * (26 - len(r))
        rows.append(padded[:26] + ["ABA"])
    return rows


def bio(info, draft, fallback):
    b = {}

    def put(key, value):
        if value not in (None, ""):
            b[key] = value

    put("n", info.get("DISPLAY_FIRST_LAST") or fallback.get("n"))
    put("pos", info.get("POSITION"))
    height = re.fullmatch(r"(\d+)-(\d+)", str(info.get("HEIGHT") or ""))
    put("h", int(height.group(1)) * 12 + int(height.group(2)) if height else None)
    weight = str(info.get("WEIGHT") or "")
    put("w", int(weight) if weight.isdigit() else None)
    put("bd", str(info.get("BIRTHDATE") or "")[:10] or None)
    put("dr", draft)
    put("j", str(info.get("JERSEY") or "").strip() or None)
    return b


def main():
    emit_only = "--emit" in sys.argv[1:]
    os.makedirs(CACHE_DIR, exist_ok=True)
    shards = load_shards()
    slugs = set(shards)
    ids = slug_to_nba_id(slugs, shards)
    print(f"[legend-careers] {len(slugs)} legends, {len(ids)} with an NBA person id")

    if not emit_only:
        try:
            fetch("commonplayerinfo", {"PlayerID": "76003", "LeagueID": "00"}, attempts=1, timeout=15)
        except Exception as error:  # noqa: BLE001
            print(f"[legend-careers] stats.nba.com unreachable ({error}); emitting from cache")
        else:
            fetch_missing(ids.values())

    drafts = draft_lines()
    out = {}
    counts = {"nba": 0, "aba_only": 0, "kept_without_nba_id": 0, "uncached": 0, "aba_rows": 0}
    for slug in sorted(slugs):
        old = shards[slug]
        nba_id = ids.get(slug)
        cached = read_json(os.path.join(CACHE_DIR, f"{nba_id}.json")) if nba_id else None
        if nba_id and cached is None:
            counts["uncached"] += 1
            out[slug] = old
            continue
        nba = nba_totals(cached["seasons"]) if cached else []
        aba = aba_rows(old.get("t") or [], {r[0] for r in nba}, bool(cached))
        totals = sorted(nba + aba, key=lambda r: r[0])
        if not totals:
            # NBA Stats has no record of a few early players; keep the existing copy.
            counts["kept_without_nba_id"] += 1
            out[slug] = old
            continue
        old_bio = old.get("b") or {}
        if cached:
            entry_bio = bio(cached["info"], drafts.get(nba_id), old_bio)
            counts["nba"] += 1
        else:
            entry_bio = {k: v for k, v in old_bio.items() if k not in ("sh", "bp")}
            counts["aba_only"] += 1
        counts["aba_rows"] += len(aba)
        entry = {"b": entry_bio, "t": totals}
        if old.get("a"):
            entry["a"] = old["a"]
        out[slug] = entry

    if counts["nba"] < 2000:
        print(f"[legend-careers] only {counts['nba']} players from NBA Stats; not writing")
        return 1
    letters = {chr(c): {} for c in range(ord("a"), ord("z") + 1)}
    for slug, entry in out.items():
        letters[slug[0]][slug] = entry
    size = 0
    for letter, players in letters.items():
        text = json.dumps(players, ensure_ascii=False, separators=(",", ":"))
        size += len(text.encode("utf8"))
        with open(os.path.join(SHARD_DIR, f"{letter}.json"), "w", encoding="utf8") as fh:
            fh.write(text)
    print(f"[legend-careers] wrote {len(out)} players ({counts}), {size // 1024} KiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
