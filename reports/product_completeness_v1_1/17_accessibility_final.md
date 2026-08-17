# 17 — Accessibility final pass (P17.1)

**Method:** Code inspection of P17.1-touched surfaces (Home, ASK, Compare, season-compare/rank, History). Not a full axe/WCAG certification run.  
**Verdict:** **PASS_WITH_DEBT**

---

## Findings

| Area | Finding | Assessment |
| --- | --- | --- |
| Team / historical logos | `TeamLogo` / `HistoricalTeamMark` use decorative `alt=""` with adjacent name text | OK when paired with visible name |
| Player headshots | Named `alt` when player name known | OK |
| Home TopPerformers | Sort chips + DRBL column; numeric labels not color-only | OK; soft-fail note is text |
| Compare Unavailable | Asymmetric DRBL uses explicit Unavailable copy (not color-only) | OK |
| Season-rank labels | DRBL rank vs R1 Points rank labeled distinctly | OK — prevents SR-only confusion |
| History DRBL column | Column header + absence note for unsupported seasons | OK |
| ASK results | Structured result chrome; builder selects from labeled metrics | OK |
| Explore / tables | `sr-only` live regions on sort/filter retained from prior work | OK |
| Contrast | Muted helper copy + emerald/rose diffs rely on signed numbers | Spot-check recommended; not instrumented |
| Mobile tap targets | Sort chips / compare controls not re-measured this pass | DEBT — tied to visual QA IN_PROGRESS |
| Tooltip / MetricHelp | Glossary keys present for public DRBL core | OK; full keyboard tooltip audit not re-run |

## Debt (non-blocking)

1. Automated a11y suite still not in CI for product surfaces.  
2. Mobile tap-target / contrast: visual QA screenshots captured (`13`); no automated AA re-measure.  
3. Historical monogram contrast depends on era palette entries — no automated AA check.

## Not claimed

- WCAG 2.x AA certification  
- Screen-reader end-to-end pass on every new DRBL string
