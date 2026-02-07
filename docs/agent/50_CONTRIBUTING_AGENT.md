# Agent patch rules (how to submit diffs)

## 1) Patch format
Every change must be provided as a git diff and be logically minimal:
- no drive-by formatting
- no unrelated refactors
- keep changes grouped by intent

## 2) Required in PR / message
1) Intent: what + why
2) Behavioral change: what output differs
3) Validation: what you ran
4) Risk: what could break
5) Docs updates: if you changed semantics/knobs/invariants

## 3) Traces and logging
If you add a new transform/scorer:
- output must include trace/provenance
- include per-channel breakdown when possible

## 4) Randomness discipline
- No Math.random() in core logic.
- Use the shared RNG utility and thread it explicitly.
- If you must sample, expose the seed and log sampling sites in trace.

## 5) Defensive programming in views
- Treat data as partial.
- Guard optional arrays and nested objects.
- Fail closed (fallback render) rather than throw.
