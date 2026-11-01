# Franchise Lab UX walkthrough

This pass exercises a repository build in Chromium at 390×844 and 1440×1000 using bundled 2025-26 NBA rosters. The live site is inaccessible from the review environment. Imported snapshots place the same real roster at specific summer decisions; they are test setups, not a claim that a complete real-data season was played manually.

## Findings and changes

| Task | Observed in the baseline browser run | Change |
| --- | --- | --- |
| Find the roster or rotation on a phone | Only four of 18 desk links were initially visible. Roster and Coaching required horizontal searching. | Home, Roster, Coaching and Season hub stay visible. More opens grouped desks, supports keyboard activation and Escape, and closes on navigation. |
| Keep a historic franchise | A repeated current-rosters prompt replaced the active save. | Historic seasons remain intentional choices. Starting real rosters from the demo creates a separate slot. My teams parks the active save without an exit warning. Pending autosaves keep their original slot and metadata when the active franchise changes. |
| Control contract decisions | Real-data saves defaulted to delegated free agency. | New real-data saves default to manual decisions. Existing delegation preferences remain intact and delegated tasks are labeled. |
| Repair an opening-night roster | Continue was disabled, and every blocker pointed to Roster, including missing players. | The primary action routes to cuts or opens late roster fill. The engine still refuses an illegal roster. |
| Resolve rookie contracts | A disabled Continue and a same-page link left the decision below the fold. | Review rookie contracts targets the decision section. Releasing rights explains the loss before confirmation. |
| Train players | Run training camp could consume the event with no individual assignments. The expected gain was unclear. | Zero assignments have an explicit continue-without-camps action. Suggestions preserve manual choices, and assigned players show the skills that will change. Saved results cannot apply twice. |
| Re-sign an own free agent | Re-sign at ask committed immediately without showing the term or total. Shared inputs could carry another player's terms into an offer. | Each offer opens a named term sheet with annual salary, years, total and signing path. Verbal agreements are distinguished from signed contracts. Player names also open terms, keeping the action accessible in the first mobile table column. |
| Make cuts or renounce rights | Actions took effect immediately. Remaining money used current salary times years even for rising salary books. | Confirmations show retained salary or lost rights. Remaining money follows the salary book, including extensions. Expired contracts do not create a new guarantee. |
| Understand the summer plan | All 11 steps occupied a long repeated mobile list. | The current step stays prominent; the complete plan is available on demand. Starting the next season returns to its home calendar. |

## Reproducible checks

`scripts/audit-gm-ux.mjs --verify` uses the same real-data fixtures for screenshots and interaction assertions. It exercises mobile menu keyboard behavior, save creation and resumption, under/over roster routes, cancellation and confirmation, rookie decisions, camp assignment/results/reloads, and own-player verbal agreements. It records page errors, page overflow, screenshots and a task report in `/tmp/franchise-ux`. The Franchise Lab workflow uploads those artifacts.

`npm run test:franchise-ux` checks that roster guidance preserves engine guards, late fill retains development, camp suggestions preserve choices and avoid hidden potential, previews match actual gains, reloads cannot repeat camp, and waiver totals match retained salary books.

`npm run test:franchise-saves` delays database writes while switching between two franchises. It checks that each save and its label stay in the correct slot, that the empty hub does not erase a saved league, and that the parallel simulation layer follows the same slot.

## Draft follow-up

The draft pass uses the same viewport sizes and bundled NBA rosters, with generated prospects. Preparation, a live clock, the completed board and a development check-in are imported test setups. They isolate tasks without claiming that a full real-data season was played by hand.

| Draft task | Problem found | Change |
| --- | --- | --- |
| Decide what to investigate | Repeated looks had no clear resource cost or research plan. A useful skill could disappear behind an overall rating. | Finite film, analytics, workout, interview and medical assignments; visible skill ranges, production samples, strengths and unresolved questions. Eight draft strategies, comparison cards, a saved board and a watchlist support different roster jobs. |
| Trade up for a target | Slot offers were limited and could become stale. A package could hide selected futures below the asset list. | Target any remaining pick, suggest or customize a package, see every outgoing asset in the assessment, then review and confirm. Ownership, salary, future firsts, frozen picks and roster capacity are checked again. |
| Price draft assets | Cheap reserves and newly selected second-round rights could become lottery currency because player and pick values used different units. | Convert player values to the pick scale, preserve draft-rights pedigree, discount bundles of small assets and require a credible main asset for lottery selections. |
| Control the room | A selection could skip the next CPU decisions and trade opportunities. | Manual selections leave the next pick waiting. Bulk simulation pauses near watchlist decisions. Delegation follows the user's saved board and strategy. |
| Research on a phone | A long report required scrolling back through the page to find the board or make a pick. | A return-to-board action and a selection review at the end of the report keep both actions nearby. The desktop board stays beside the report while scrolling. |
| Keep a prospect's identity | Numeric suffixes on reused style nicknames were treated as invalid on load, regenerating real names. | Recognize numbered style names and preserve identity, reports, spending and watchlists across reloads. |
| Develop the selected player | A future label could overshadow actual readiness, opportunity and progress. | Distinct practice and rotation plans, focused skills, finite headroom and explained development check-ins. The recap links the class to rookie contracts. |

`scripts/smoke-gm-draft-overhaul.mjs` checks research, repeated-study blocking, spending, saved strategies and watchlists, comparison, a direct prospect page, trade cancellation and confirmation, traded pick ownership, a manual selection, development plans and the growth report. It records eight phone/desktop screenshots, overflow checks and page errors under `/tmp/franchise-draft-qa`.

`npm run test:franchise-draft` covers hidden-information independence, watchlist stops, trade replays, salary and future-pick constraints, exact pick consumption, rights pricing and a complete 60-pick board. `scripts/test-gm-draft-class.ts` follows 6,000 developmental careers and a separate 40-class rolling talent stock. [Draft research and calibration](draft-research.md) records the methods and limits.

## Next priorities

1. **Make a simulated game teach the GM something.** Connect results to rotation minutes, positional fit, injuries and the existing team plan. Present evidence from the game and a direct route to the relevant decision. This is the strongest next product hypothesis; this audit did not measure whether players understand why they won or lost.
2. **Explain trade negotiations before another click.** Surface the CPU's main objection, the matching-salary requirement and the assets that matter most. Test whether a new player can turn an initial rejection into a legal, credible offer without trial and error.
3. **Give the season a continuing story.** Carry the team plan, record trend, expiring players and prospect development into a short weekly briefing. Validate that it helps players decide when to stop simulating and intervene.

These are follow-up hypotheses, not claims established by a usability study. Observe first-time players attempting those tasks before expanding systems or adding more dashboard panels.
