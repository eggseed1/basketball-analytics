# DRBL headshot pool v2 review and next-stage acceptance criteria

**Research only — not approved for production deployment.**

## Balanced cohort v2

Workflow: https://github.com/eggseed1/basketball-analytics/actions/runs/43034061684

- 50/50 FLUX.2 Dev images generated and saved.
- Estimated model charge $0.60, not verified against account billing.
- OpenCV Haar frontal-face detection 50/50; no detected off-center portraits.
- Upper-corner background RGB-distance proxy average 4.9 (previous cohort 5.0).
- Cropped-image similarity flags 245; **not facial identity matches**. Most are driven by identical backdrop, crop, and jerseys.
- Description quotas by hairstyle and facial hair were met. There are 13 aged 19–22, 28 aged 23–30, and 9 aged 31–36.

## Important visual finding

The portraits improved in natural hair coloring, but several appearances are visibly clustered by contiguous ID range. A coherent population cannot simply satisfy counts; features must be shuffled independently so adjacency and repeated face archetypes don't dominate.

Root cause in v2 candidate generator: sorting FNV hashes for sequential integer strings did not provide satisfactory mixing. A v3 test replaces this with independent SHA-256 category permutations and a maximum-run guard for hair and appearance.

**Do not treat an exact histogram as proof that the model followed the prompts.** Generated output may contradict requested hairstyle or facial structures.

## Human curation fields

For each source portrait store:

- `portraitId` — immutable ID never derived from live roster order.
- `sourceModel`, `seed`, `sourcePromptHash`, `imageFile`.
- `status`: `pending`, `accepted`, or `rejected`.
- `reviewFlags`: array of reasons such as `too-similar`, `cropped-hair`, `wrong-jersey`, `waxy-skin`, `misaligned-eyes`, `wrong-background`.
- `reviewNote`: human-readable rationale.
- `assignedGeneratedPlayerId`: must remain stable across team changes and reloads once assigned.

No portrait automatically accepted; reviewer must expressly approve. No assigning the same portrait ID to multiple active players. If a player retires, preserve historical save mappings; portrait reuse needs explicit cooldown and collision tests.

## Production gates

1. Review candidates at 960 px and at real 64 px / 128 px UI sizes.
2. Count how many **distinct portraits** are accepted (exclude duplicate-style pictures of the same identity).
3. Run a representative roster-age and appearance distribution check.
4. Test stable identity across simulated trades, free agency, retirements, and long saves.
5. Keep generated portraits outside production asset directories until the user approves the exact pool.

## Status

Sampler v3 was created as a follow-up test using independent trait mixing. Review the generated v3 contact sheet before deciding whether to spend on more portraits.
