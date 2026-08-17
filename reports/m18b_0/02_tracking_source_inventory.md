# Tracking source inventory (M18b.0)

Candidate sources evaluated without bypassing authentication or downloading proprietary feeds.

## 1. Public SportVU raw archives (2015-16)

| Field | Value |
|---|---|
| Provider/source | Historical SportVU logs mirrored on GitHub (e.g. linouk23/NBA-Player-Movements, neilmj/BasketballData, sealneaward/nba-movement-data) |
| Coverage seasons | Primarily **2015-16** (~636 games in common mirrors) |
| Resolution | ~25 Hz; player x/y; ball x/y/z typical |
| Access | Public GitHub mirrors of previously public NBA logs |
| License/redistribution | Research use of archived logs is common; respect mirror/repo licenses; do not treat as modern NBA commercial license |
| Overlap with M18a UIR seasons (2020-25) | **NONE** |
| Confidence | High that data exist; medium on perfect completeness |

**Role:** method prototype / alignment lab only — cannot mediate 2020–25 UIR.

## 2. stats.nba.com tracking aggregates (live)

| Field | Value |
|---|---|
| Provider | NBA Stats public API |
| Coverage | Multi-season through current |
| Resolution | **Season aggregates** (Drives, SpeedDistance, Hustle screen assists, defender-distance *buckets*) |
| Player/ball frame coordinates | NO |
| Access | Already used by repo helpers (`public-tracking.ts`) |
| Tier | **T2** |

**Role:** exploratory association features only — not counterfactual OBV / tracking EPV.

## 3. Second Spectrum / Sportradar optical (2017–~2023)

| Field | Value |
|---|---|
| Resolution | Full-frame optical (~25 Hz historically) |
| Public raw | **NO** (teams / licensees) |
| Academic/commercial access | Possible via institutional license (terms vary; not configured here) |
| Overlap with UIR seasons | Would cover 2020-21… if licensed |

## 4. Hawk-Eye Innovations pose tracking (2023-24+)

| Field | Value |
|---|---|
| Resolution | Multi-camera pose (vendor; ~60 Hz / keypoints reported publicly for teams) |
| Public raw | **NO** |
| Access | Team / licensed vendor only |
| Overlap with UIR reserved (2023-24→2024-25) | Ideal if licensed |

## 5. Broadcast-derived pseudo-tracking (SportsMOT / research video)

| Field | Value |
|---|---|
| Nature | Estimated trajectories from video; error vs optical must be quantified |
| Public research datasets | Partial / method samples |
| Sufficient for M18a UIR mediation | Unlikely without large labeled NBA coverage |

## Best candidate for UIR mediation

**Licensed modern optical (Second Spectrum archive and/or Hawk-Eye)** overlapping 2022-23…2024-25.

## Best candidate without credentials

**SportVU 2015-16 public archive** for `M18b_1` method prototype only.

TRACKING_SOURCE_CANDIDATE_COUNT = 5 (1 public T0 historical, 1 T2 live API, 2 commercial T0/T1, 1 pseudo)
FULL_FRAME_TRACKING_SOURCE_FOUND (local) = NO
FULL_FRAME_TRACKING_SOURCE_KNOWN (external) = YES (SportVU 15-16 public; modern commercial)
