# Chrome Web Store listing — DRBL Live 1.0.0

Paste these into the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole). Assets live in `store/dist/` after:

```bash
node scripts/build-extension-store-assets.mjs
```

Upload package: `store/dist/drbl-live-chrome-web-store.zip`

## Product details

| Field | Value |
| --- | --- |
| Name | DRBL Live |
| Summary (manifest description) | Live NBA scores and favorite-team final alerts from drbl.io. |
| Category | Sports |
| Language | English |
| Official URL | https://drbl.io |
| Support URL | https://github.com/eggseed1/basketball-analytics/issues |
| Privacy policy URL | https://drbl.io/privacy |

### Detailed description

```
DRBL Live shows live and upcoming NBA scores in your Chrome toolbar, powered by the same public scoreboard on drbl.io.

• Live, today, and upcoming games in a compact popup
• Favorite teams, with optional desktop alerts when a favorite finishes
• Spoiler-safe mode that hides scores in the popup
• Light, dark, or match-your-device theme using DRBL’s site palette
• One-tap links into full game pages on drbl.io

The extension polls drbl.io about once a minute while Chrome is open. It does not scrape other websites, read your browsing history, or require an account.
```

## Graphic assets (`store/dist/`)

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `store-icon-128.png` | 128×128 |
| Small promo tile (required) | `promo-small-440x280.png` | 440×280 |
| Marquee promo (optional) | `promo-marquee-1400x560.png` | 1400×560 |
| Screenshot 1 | `screenshot-popup-light.png` | 1280×800 |
| Screenshot 2 | `screenshot-popup-dark.png` | 1280×800 |
| Screenshot 3 | `screenshot-options.png` | 1280×800 |

Screenshot captions (optional):

1. Live NBA scores in the DRBL Live popup  
2. Dark theme with the same glass matchup cards  
3. Favorite teams and final-alert settings  

## Privacy tab (dashboard disclosures)

Single purpose: Display NBA scores and favorite-team final alerts from drbl.io.

### Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Saves favorites, theme, score visibility, notification preference, scoreboard cache, and already-notified game ids on the device. |
| `alarms` | Refreshes the public DRBL scoreboard about once per minute while Chrome runs. |
| `notifications` | Optional desktop alert when a favorite team’s live game becomes final. |
| Host `https://drbl.io/*` | Fetches `/api/scores/live` and `/api/scores/upcoming` over HTTPS. No other hosts. |

### Data practices (checkboxes)

- **Does not** sell or transfer user data to third parties (beyond operating the extension)
- **Does not** use data for purposes unrelated to the extension’s single purpose
- **Does not** use data for creditworthiness or lending
- User data collected: **none to DRBL servers** via the extension. Local storage only (favorites, preferences, score cache, notified ids)
- Remote code: **none** — all logic ships in the zip; only JSON score data is fetched

Certify that the privacy policy at https://drbl.io/privacy matches these disclosures (section “DRBL Live Chrome extension”).

## Distribution

1. Deploy the site so `/privacy` includes the extension section (required before store review).
2. Run `node scripts/build-extension-store-assets.mjs`.
3. In the dashboard: New item → upload `drbl-live-chrome-web-store.zip`.
4. Fill Store listing + Privacy tabs from this doc; upload graphics from `store/dist/`.
5. Submit for review (Unlisted or Public).

## Smoke checklist before submit

- [ ] Load unpacked from `extension/drbl-live`, open popup, see Connected or Delayed honestly
- [ ] Favorites + Save in options; star appears on matching games
- [ ] With notify on, a live→final transition for a favorite fires one notification (or wait for a real final)
- [ ] Spoiler mode hides scores
- [ ] Package zip opens cleanly; `manifest.json` version is `1.0.0`
- [ ] https://drbl.io/privacy mentions the Chrome extension
- [ ] https://drbl.io/api/scores/live and `/api/scores/upcoming` return 200
