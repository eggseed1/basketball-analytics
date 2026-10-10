#!/bin/bash
# Installs the stats.nba.com refresh (scripts/local/stats-nba-refresh.sh) as a
# launchd agent on this Mac. Safe to rerun; rerun after editing the runner.
#
#   scripts/local/install-stats-nba-runner.sh            install or update
#   scripts/local/install-stats-nba-runner.sh --remove   unload and delete
#
# Runs daily at 07:30 local time (before the 12:17 UTC scheduled deploy) and
# catches up once after the Mac wakes if it was asleep. Pushes use this Mac's
# existing git credentials; nothing secret is written to disk.
set -euo pipefail

LABEL="io.drbl.stats-nba-refresh"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CLONE="$HOME/drbl-stats-runner"
VENV="$HOME/.cache/drbl-stats-runner/venv"
RUNNER="$HOME/.local/bin/drbl-stats-nba-refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/drbl-stats-nba-refresh.log"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
if [ "${1:-}" = "--remove" ]; then
  rm -f "$PLIST" "$RUNNER"
  echo "removed $LABEL (clone at $CLONE and venv at $VENV left in place)"
  exit 0
fi

if [ ! -d "$CLONE/.git" ]; then
  git clone --quiet "$(git -C "$REPO" remote get-url origin)" "$CLONE"
fi
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade curl_cffi

mkdir -p "$(dirname "$RUNNER")" "$(dirname "$PLIST")" "$(dirname "$LOG")"
install -m 755 "$REPO/scripts/local/stats-nba-refresh.sh" "$RUNNER"

NODE_DIR="$(dirname "$(command -v node)")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$RUNNER</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>DRBL_RUNNER_CLONE</key><string>$CLONE</string>
    <key>DRBL_RUNNER_VENV</key><string>$VENV</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "installed $LABEL; runs daily 07:30, log at $LOG"
echo "run now: launchctl kickstart $DOMAIN/$LABEL"
