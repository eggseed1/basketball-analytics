# DRBL Live | Chrome extension

Manifest V3 companion for [drbl.io](https://drbl.io). Reads the site’s existing scoreboard APIs. No separate extension backend.

## How it works

1. **Background worker** (`background.js`) runs on install/startup and on a 1-minute `chrome.alarms` tick.
2. It fetches `GET https://drbl.io/api/scores/live` and `GET https://drbl.io/api/scores/upcoming?limit=40` (same feeds as `/scores`).
3. Responses are normalized to the site `GameSummary` shape in `shared.js`, merged, and stored in `chrome.storage.local`.
4. The **popup** reads that storage, filters All / Live / Favorites, and links each card to `https://drbl.io/games/{id}`.
5. **Final alerts** fire only when a game was previously seen as live, belongs to a favorite team, flips to final, and has not already been notified. First sync never spams history.
6. The toolbar badge shows the count of live games. Theme, favorites, spoiler-safe score hiding, and notify toggle live in Options.

Chrome must be running for polls and notifications. Host permission is only `https://drbl.io/*`.

## Install locally

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → choose this folder (`extension/drbl-live`, the one with `manifest.json`).
3. Pin **DRBL Live**. Set favorites under **Extension options**.

## Development

```
node --check extension/drbl-live/shared.js
node --check extension/drbl-live/background.js
node --check extension/drbl-live/popup.js
node --check extension/drbl-live/options.js
node --test extension/drbl-live/tests/*.test.cjs
```

## Site fidelity

Tokens and glass/matchup card treatment follow `src/app/globals.css` and `src/styles/drbl-tokens.css`. The popup is a compact companion, not a full scoreboard page.

## Chrome Web Store

Version **1.0.0** is packaged for store upload.

1. Privacy policy: https://drbl.io/privacy (section “DRBL Live Chrome extension”) — deploy the site if that section is not live yet.
2. Build assets + zip: `node scripts/build-extension-store-assets.mjs`
3. Follow `store/STORE_LISTING.md` for dashboard fields, permission justifications, and upload steps.
4. Upload `store/dist/drbl-live-chrome-web-store.zip` in the Chrome Developer Dashboard.

Support: https://github.com/eggseed1/basketball-analytics/issues

## Limitations

- Freshness matches the site’s ESPN-backed scoreboard; no independent score delay sync with the website setting.
- Alerts need Chrome open and the alarm firing; they are not push from a server.
- No player box scores or in-game play-by-play in the extension.
