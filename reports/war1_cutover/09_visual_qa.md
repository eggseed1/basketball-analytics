# Visual QA — WAR1 cutover

## Rendered HTTP checks (localhost:3000)
| Surface | WAR1 visible | Old primary heading |
|---------|--------------|---------------------|
| Explore Players | YES | NO |
| Learn DRBL | YES | NO (explanatory etymology may mention Wins Above R1) |
| Learn WAR1 | YES | etymology allowlisted |
| Redirects | /learn/war1 → 308 /learn/drbl/war1 | PASS |
| Redirects | /learn/wins-above-r1 → 308 /learn/drbl/war1 | PASS |

## Screenshots
Browser MCP unavailable in this session. Capture manually under `reports/war1_cutover/screenshots/`:

- war1-explore.png
- war1-player.png
- war1-roster.png
- war1-compare.png
- war1-season-compare.png
- war1-learn-overview.png
- war1-learn-detail.png
- war1-mobile-player.png

Acceptance for reviewer: no `R1 Win Eq.` / `Wins Above R1` as current metric headings.

Status: RENDER_PASS (HTTP text); SCREENSHOTS=PENDING_MANUAL
