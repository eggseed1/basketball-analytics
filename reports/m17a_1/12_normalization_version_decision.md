# Normalization version decision

**Decision:** preserve `historical-pbp-normalized-v1`

Historical event-label mappings (Made Shot / Missed Shot / Free Throw / SUB: X FOR Y)
are backward-compatible transformations into the existing normalized event schema.
They do not change model semantics.

`MODEL_SEMANTICS_CHANGED_BY_NORMALIZATION = NO`
