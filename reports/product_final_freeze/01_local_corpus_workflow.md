# Local DRBL corpus workflow (environment engineering)

## Context

`drbl:test` needs access to the sealed analytics corpus under `data/drbl`
(normalized seasons, raw game samples used by some historical tests).

In the integration worktree this path is **not** copied. A Windows directory
junction is used temporarily:

```text
data/drbl  →  <primary-repo>/data/drbl
```

Example:

```bat
mklink /J data\drbl C:\Users\parkh\Projects\basketball-analytics\data\drbl
```

## Build constraint

Next.js Turbopack (`npm run build`) panics when that junction points outside
the worktree filesystem root (invalid out-of-root symlink under
`data/drbl/raw/...`).

## Required procedure

1. **For `npm run drbl:test`** (when corpus is not present locally):

   ```bat
   mklink /J data\drbl <absolute-path-to-primary-data-drbl>
   npm run drbl:test
   ```

2. **Before `npm run build` / packaging / ZIP**:

   ```bat
   rmdir data\drbl
   ```

   This removes the junction only (does not delete the target corpus).

3. Confirm `data/drbl` is **gitignored** and never staged.

## Debt class

```text
ENVIRONMENT_ENGINEERING_DEBT
≠
MODEL_OR_PRODUCT_SEMANTIC_DEBT
```

Do not redesign corpus layout in the product freeze. M17c starts from the
committed product tree; local junction remains an operator step for tests.

## Freeze verification (this freeze)

- Junction present at start of freeze inventory → removed before final build gate
- No `data/drbl` path staged or tracked
