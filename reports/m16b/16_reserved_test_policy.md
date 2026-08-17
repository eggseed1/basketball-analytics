# Reserved test policy

## Access

Reserved test may be opened only when:

1. model family is frozen,
2. candidate selection is complete on VALIDATION,
3. experiment registry is complete,
4. git/model freeze is recorded,
5. user explicitly approves final test evaluation.

CLI requirements:

```
--allow-reserved-test
--experiment-id <id>
--model-freeze <id>
```

Optional player-level output:

```
--include-player-level-test-output
```

(must be logged to `reserved_test_access_log.jsonl`)

## After opening

Further tuning based on reserved-test results requires a **new** reserved period or future season.

## Default outputs

Aggregate metrics only. No top-10/25 player names by default.
