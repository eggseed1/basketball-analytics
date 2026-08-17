# Future temporal validation protocol (M17b) — document only

Do **not** execute model tuning in M17a.

## Goal
Test frozen DRBL v1 using repeated temporal windows:

```
train/development history → next-season evaluation
```

for as many historical years as feasible once the archive exists.

## Hard constraints
- v1 parameters remain frozen during retrospective evaluation
- Do not use each future season to alter parameters
- Separate any v2 research into a new versioned branch with preregistration
