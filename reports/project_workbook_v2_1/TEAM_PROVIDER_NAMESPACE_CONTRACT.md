# TEAM_PROVIDER_NAMESPACE_CONTRACT

See also: `01_IDENTITY_NAMESPACE.md` and `reports/product_completeness_v1_2/01_team_namespace_contract.md`.

## Canonical product key

```text
canonicalTeamId = ESPN team id (string)
```

## Provider namespaces

| Namespace | Example | Allowed in public UI as label? |
|-----------|---------|--------------------------------|
| espn | `25` (OKC) | Yes (via brand) |
| nba | `1610612760` | **No** — normalize first |
| bdl | provider-specific | No as bare id |

## Rule

Provider-native IDs do not survive beyond the provider normalization boundary unless explicitly carried in `providerTeamId` / `teamIdProvider` / `nbaTeamId`.
