# DRBL fictional media-day portrait standard (FLUX.2 Dev)

Status: **Research-approved baseline, not yet production-approved.**

## Model and output

- Endpoint: `fal-ai/flux-2`
- 960 x 960 pixels, JPEG, 1 image/request
- Fixed seed per **fictional identity**, rather than per team/season
- Never generate identities at request time. Pre-generate, review, and assign portraits to player IDs.
- No live site deployment until the face pool, jersey handling, and collision policy are tested.

## Identity prompt

Describe each player individually using **multiple facial-structure details**. Do not rely just on nationality or skin tone. Include a combination of age, face shape, nose, brow, eyes, hairstyle, facial hair, and one optional ordinary identifying detail (mole, freckles, realistic minor scar). Vary descriptions across prospects.

Avoid generating only attractive and symmetrical faces; prompts should describe plausible ordinary athletes. Do not use names of real NBA players or celebrities to control likeness.

## Photographic anchor

> One authentic unretouched professional basketball team media-day roster photograph of an entirely fictional adult male athlete. Straight-on eye-level camera, neutral expression and closed mouth, both shoulders level and squared to lens. Head and upper chest visible, entire hairstyle in frame, modest headroom. Professional 85mm DSLR sports roster photo with broad even diffused frontal studio lighting and neutral white balance. Uniform pale neutral gray seamless studio backdrop without props or vignette. Plain dark midnight navy basketball jersey, realistic perforated mesh, sleeveless wide armholes, white edging at the collar and arm openings. No text, names, numbers, logos or badges. Natural facial anatomy and ordinary human asymmetry, fine authentic skin texture. No CGI, illustration, beauty retouching, plastic shine, exaggerated muscles, glamor lighting, watermarks, or head tilt.

Note: long anti-glamour/candid-skin prompt additions in iteration 04 changed appearance very little when seeds were held constant. Keep the shared photographic prompt reasonably concise.

## Review gates

1. **Human visual review** at full resolution and at the actual 64–128px player-card size.
2. **Composition**: no clipped top hair, eyes level, both shoulders in frame, centered head.
3. **Background**: consistent gray, with no scenery or distracting gradient.
4. **Jersey**: acceptable plain basketball construction, no fictitious branding or accidental text. Jersey design should ideally be overlaid separately by DRBL to handle trades without changing the face.
5. **Identity**: reject visible same-face collisions among active players. Full-frame perceptual hashes are *not facial recognition*; near-match flags should only create a review queue.
6. **Realism**: skin and anatomy credible; reject waxy, overly glamorized or uncanny portraits.
7. **Save compatibility**: keep permanent ID-to-portrait mappings and deterministic assignment, never reassign an active portrait to a different player.

## Validation evidence

- Iteration 01: 18 images across three model/prompt configurations.
- Iteration 02: 12 images, FLUX.2 Dev/Pro, tighter framing.
- Iteration 03: six novel player identities, selected FLUX.2 Dev.
- Iteration 04: 12 distinct identities with paired baseline/candid skin treatments, 24 images. All 24 requests succeeded. The pairs are intentionally same-identity, not 24 unique people. Image QA flagged similar full-frame backgrounds and same-seed variants; those flags do **not** establish identity duplication.

Workflow: `.github/workflows/fal-dev-portrait-validation-04.yml`.

## Next experiment

Generate 50–75 **distinct** identities using just one approved baseline prompt; review for facial uniqueness and failure rate. Do not roll out a 1,000-image library until a realistic acceptance rate is established. Budget and paid run must be explicitly approved.
