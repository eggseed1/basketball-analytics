#!/bin/bash
# Nightly stats.nba.com bakes that cloud runners can't reach: hustle tracking,
# play types, team on/off, league shot zones, player awards, franchise records and
# league averages. stats.nba.com drops requests
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
else
  log "no games in this phase; skipping the nightly bakes"
fi

git add -- "${FILES[@]}"
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
    exit 0
  fi
  sleep $((attempt * 15))
done
log "push failed after 3 attempts"
exit 1
