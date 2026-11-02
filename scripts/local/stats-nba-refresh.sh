#!/bin/bash
# Nightly stats.nba.com bakes that cloud runners can't reach: hustle tracking,
# play types, team on/off, league shot zones, player awards, franchise records,
# league averages and the season tables. stats.nba.com drops requests
# from GitHub Actions and Cloudflare IPs, so this runs on a home machine from a
# dedicated clone (never the dev checkout) and pushes a data-only commit that
# the next scheduled deploy picks up.
#
# Installed by scripts/local/install-stats-nba-runner.sh as a launchd agent.
# Manual run: FORCE=1 scripts/local/stats-nba-refresh.sh (DRY_RUN=1 to skip the push)
set -uo pipefail

CLONE="${DRBL_RUNNER_CLONE:-$HOME/drbl-stats-runner}"
VENV="${DRBL_RUNNER_VENV:-$HOME/.cache/drbl-stats-runner/venv}"
FILES=(
  src/data/runtime/hustle-overlay-snapshot.json
  src/data/runtime/play-type-snapshot.json
  src/data/runtime/on-off-snapshot.json
  src/data/runtime/player-awards-snapshot.json
  src/data/franchises/verified-records.json
  src/data/runtime/league-season-averages.json
  src/data/runtime/league-pace.json
  src/data/runtime/season-tables-snapshot.json
  src/data/runtime/season-tables-meta.json
  public/runtime/season-tables-meta.json
  src/data/runtime/nba-espn-player-ids.json
  src/data/runtime/historical-team-season-records.json
  data/ops/seasonal-upkeep.json
)

log() { echo "[stats-nba-refresh] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

cd "$CLONE" || { log "no clone at $CLONE"; exit 1; }
git fetch --quiet origin main && git reset --hard --quiet origin/main || { log "could not sync clone"; exit 1; }

read -r PHASE SEASON REFRESH < <(node --input-type=module -e '
  const { nbaSeasonPhaseInfo } = await import("./scripts/lib/nba-season-phase.mjs");
  const i = nbaSeasonPhaseInfo(new Date());
  console.log(i.phase, i.season, i.shouldRefreshPlayerViz ? 1 : 0);
')
if [ -z "${SEASON:-}" ]; then
  log "could not read the season phase"
  exit 1
fi
log "phase=$PHASE season=$SEASON"

# Weekly (Mondays), in every phase: a finished season counts from July 1, before games resume.
# Awards refetch about 600 recent players at half a second each.
if [ "$(date +%u)" = "1" ] || [ "${FORCE:-0}" = "1" ]; then
  "$VENV/bin/python" scripts/build-runtime-player-awards.py || log "awards failed; keeping the last bake"
  "$VENV/bin/python" scripts/build-team-season-history.py || log "team history failed; keeping the last bake"
fi

if [ "$REFRESH" = "1" ] || [ "${FORCE:-0}" = "1" ]; then
  node scripts/build-runtime-hustle-snapshot.mjs || log "hustle failed; keeping the last bake"
  "$VENV/bin/python" scripts/build-runtime-playtype-onoff-snapshot.py "$SEASON" || log "play types failed; keeping the last bake"
  # Totals cache outside the clone; the first run fills every season since 1996-97.
  # After every tip-off this must land $SEASON in season-tables so Cloudflare
  # Explore can serve a peer board without ESPN (same path every future year).
  if "$VENV/bin/python" scripts/build-nba-season-totals.py "$SEASON"; then
    npx --yes tsx@4 scripts/build-season-tables.ts || log "season tables failed; keeping the last bake"
  else
    log "season totals failed; keeping the last bake"
  fi
  if ! node --input-type=module -e "
    import fs from 'node:fs';
    const t = JSON.parse(fs.readFileSync('src/data/runtime/season-tables-snapshot.json','utf8'));
    const n = t?.seasons?.['$SEASON']?.advanced?.length ?? 0;
    if (!n) { console.error('[stats-nba-refresh] $SEASON still missing from season-tables after bake'); process.exit(1); }
    console.log('[stats-nba-refresh] season-tables $SEASON rows=' + n);
  "; then
    log "season-tables still missing $SEASON; Explore will keep prior-year boards until this lands"
  fi
  node --input-type=module -e "
    import fs from 'node:fs';
    const t = JSON.parse(fs.readFileSync('src/data/runtime/season-tables-snapshot.json','utf8'));
    const body = JSON.stringify({ generatedAt: t.generatedAt ?? null, source: t.source ?? 'stats.nba.com' }) + '\n';
    fs.writeFileSync('src/data/runtime/season-tables-meta.json', body);
    fs.mkdirSync('public/runtime', { recursive: true });
    fs.writeFileSync('public/runtime/season-tables-meta.json', body);
  " || log "season-tables meta failed"
  "$VENV/bin/python" scripts/build-historical-team-season-records.py || log "historical team records failed; keeping the last bake"
else
  log "no games in this phase; skipping the nightly bakes"
fi

node scripts/check-seasonal-upkeep.mjs || log "seasonal upkeep check failed"

# One missing path makes git add stage nothing, so only pass files that exist.
PRESENT=()
for f in "${FILES[@]}"; do
  [ -e "$f" ] && PRESENT+=("$f")
done
git add -- "${PRESENT[@]}" || log "git add failed"
if git diff --cached --quiet; then
  log "no data changes"
  exit 0
fi
if [ "${DRY_RUN:-0}" = "1" ]; then
  git diff --cached --stat
  git reset --hard --quiet origin/main
  log "dry run; not committed"
  exit 0
fi
git commit --quiet -m "Local stats.nba.com refresh ($SEASON) [skip ci]"
for attempt in 1 2 3; do
  if git pull --quiet --rebase origin main && git push --quiet origin HEAD:main; then
    log "pushed $(git rev-parse --short HEAD)"
    # Data commits skip CI; deploy-site syncs these snapshots from main and rebuilds Explore's first page.
    if command -v gh >/dev/null 2>&1; then
      gh workflow run deploy-site.yml --ref main \
        && log "triggered deploy-site on main" \
        || log "could not trigger deploy-site; the next nightly will ship it"
    fi
    exit 0
  fi
  sleep $((attempt * 15))
done
log "push failed after 3 attempts"
exit 1
