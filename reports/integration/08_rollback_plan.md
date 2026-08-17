# Rollback plan (do not execute automatically)

## Refs (retain)

| Role | Ref | Commit |
|---|---|---|
| Analytics premerge | `backup/analytics-pre-web-merge` / `analytics/sealed-pre-web-merge` | `72272b23fe6e037b6d463de2c840f1ad2980b562` |
| Web premerge | `backup/web-pre-analytics-merge` / `web/drbl-ia-and-ask` | `7e764ceb5c834a19696dad84ed6696e7e3289a6a` |
| Integration branch | `integration/analytics-web` | (see post-commit hash) |
| Original main | `main` / `origin/main` | `629bb1b790bef21020940122194772b6921569ff` |

## Safe rollback options

1. **Abandon integration branch** — leave `main` and backups untouched; continue from analytics or web tip.
2. **Hard reset integration only** — `git switch integration/analytics-web && git reset --soft backup/analytics-pre-web-merge` (only if user explicitly requests destructive reset).
3. **Worktree remove** — `git worktree remove basketball-analytics-integration` after switching agents back to primary repo.

Do **not** delete backup refs. Do **not** force-push `main`.
