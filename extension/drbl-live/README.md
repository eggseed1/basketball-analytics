# DRBL Live | Chrome extension

A Manifest V3 extension that uses DRBL's **existing canonical scoreboard API**, not a new or fictional `/api/extension/live` endpoint.

## Install locally
1. Download and unzip `drbl-live-extension.zip` (or clone this repo).
2. Visit `chrome://extensions`, enable **Developer mode**.
3. Select **Load unpacked** and choose the `extension/drbl-live` directory (the directory containing `manifest.json`).
4. Pin **DRBL Live** to your toolbar. Favorite-team alerts and theme are configurable under **Extension options**.

## Connection to drbl.io
- `GET https://drbl.io/api/scores/live` provides the current ET day from `getLiveScoreboardSummaries()`.
- `GET https://drbl.io/api/scores/upcoming?limit=40` provides future games from `getUpcomingGameSummaries()`.
- The UI consumes the site's `GameSummary` model (`id`, `homeTeamAbbr`, `awayTeamAbbr`, `homeScore`, `awayScore`, `status`, `period`, `displayClock`, `tipOffAt`, `gameDate`) and matches the page's live/halftime/period-break/final interpretation.
- Chrome host permission is restricted to `https://drbl.io/*`; tokens and secrets remain on the website's backend. The extension does not scrape other tabs or collect browsing history.
- Alerts are **only** sent when a previously observed live favorite-team game transitions to final. First sync never sends historical alerts.
- Chrome's service worker polls via a `chrome.alarms` 1-minute cadence, plus manual refresh. Chrome must be running. Scores and alerts depend on the site's provider freshness; score delay is not synchronized with the site's per-browser setting.

## Site fidelity
Colors, corners, frost materials, and DRBL mark are lifted from `src/app/globals.css`, `src/styles/drbl-tokens.css`, `src/components/brand/drbl-logo.tsx`, and the layout of `src/components/sports/score-tile.tsx`. Extension settings can follow the system theme or select the site's light/dark modes. The small popup is a companion view, not a pixel-identical full-page rendering of the responsive site.

## Development and tests
```
node --check extension/drbl-live/shared.js
node --check extension/drbl-live/background.js
node --check extension/drbl-live/popup.js
node --check extension/drbl-live/options.js
node --test extension/drbl-live/tests/shared.test.cjs
```

## Limitations
- Game data is fetched from the public DRBL endpoint and can be stale or unavailable.
- Chrome extensions cannot read DRBL's web-localStorage theme or score-delay settings by default, so they have independent options.
- A browser-side API response can be cached; the UI reports delayed feeds instead of inventing scores.
- Player box scores and notifications are not included until a stable site endpoint and appropriate alert policies exist.
