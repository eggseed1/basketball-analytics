# DRBL FLUX.2 Dev 50-player portrait cohort: review

Run: https://github.com/eggseed1/basketball-analytics/actions/runs/43030053056

Status: **offline research validation, not production deployment**.

## Outcome

- 50 / 50 images generated successfully, with 50 distinct prompt descriptions.
- 960 × 960 square JPEG, single subject, frontal portrait, navy sports jersey.
- Model: `fal-ai/flux-2` (FLUX.2 Dev).
- Estimated model generation cost: about $0.60 (based on the rate used for the experiment; actual billing may differ).
- Automated OpenCV Haar detection found a frontal face in 50/50 files.
- Detected face center X range: 0.486–0.509, demonstrating close horizontal alignment.
- Face top Y range: 0.124–0.237, so vertical framing is not fully fixed.
- Mean backdrop top-corner RGB-distance proxy: 5.0; range 0.2–29.5 (some visibly inconsistent backdrops).

## Visual findings

1. The pool looks substantially more varied than the six-image baseline: hairstyles, facial shapes, skin tones, nose structures and facial hair differ.
2. Several repeated styling motifs are still visible, especially dyed red-orange hair in multiple images, bleached blond hair in multiple images, and overly handsome/smooth model-like faces.
3. Jersey collar/neckline construction varies between V-neck, rounded neck and edging proportions, though the dark-navy/white palette remains mostly stable.
4. Most are young-looking and polished. A real professional population should include a broader mix of ages, facial weight, uneven features, hairlines, ordinary skin and less-perfect facial proportions.
5. A center-crop hash generated 246 low-distance *flags* among 1,225 pairs. This method is too sensitive to shared backgrounds and composition to be treated as proof of duplicate people. It is **not** a reliable automated face deduplication system. Manual review is necessary. Do not auto-reject these pairs or claim 246 duplicate faces.

## Immediate changes recommended before bulk generation

- Add *population-level constraints* to the identity sampler: caps on bright hair dye, braids, locs, beards, clean-shaven heads; balance hairstyle frequency and avoid correlated hair/ethnicity assumptions.
- Intentionally include varied facial asymmetry and more ordinary, less glamorous faces; avoid repeating one idealized visual template.
- Improve consistency of jersey construction with a deterministic compositing layer or controlled jersey template rather than relying solely on natural-language instructions.
- Improve face-dedup checks with human review and optionally a dedicated consent-appropriate face-feature similarity model. Image perceptual hashes should remain supplementary.
- Build a **curation manifest** recording accepted/rejected image, source model, prompt, seed and player-portrait ID.
- Keep generation offline and fixed player-to-portrait mapping; images should not change when a user trades a player.

## Decision

This was a **successful batch-generation and framing feasibility check**, not evidence of 100% portrait acceptance or production-quality realism. Further human curation and stronger identity sampling are needed. Do not deploy these images automatically.

Full resolution images, manifest, QA report and contact sheet are available in the run's GitHub Actions artifact (`drbl-flux2-dev-50-face-cohort`).
