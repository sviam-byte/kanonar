# Reproducibility & debugging playbook — v69

Goal: make bugs reproducible and explanations auditable.

Scope:
- deterministic reproduction (seed)
- stage snapshots (dump)
- minimal “atom fixtures” for tests and bug reports

---

## 1) Determinism

If any randomness exists in the pipeline (e.g., decision noise),
the system must support:
- fixed seed → deterministic outputs.

Operational contract:
1) there exists a single “seed” value per tick/run
2) all stochastic components draw from a seeded RNG
3) seed is surfaced in UI/debug logs

If current code does not yet thread a seed, treat this section as the target contract and
record any deviations explicitly.

---

## 2) Stage snapshots (audit trail)

Minimum:
- store `Atoms(Sk)` for each stage Sk (S0..S8)
- include:
  - atom id
  - ns
  - magnitude
  - confidence
  - trace.usedAtomIds (if present)

Debug workflow:
1) find earliest stage where incorrect atom appears
2) inspect its trace.usedAtomIds
3) verify against docs/PIPELINE.md + docs/INVARIANTS.md

---

## 3) Minimal repro format (atom fixture)

A minimal repro should be expressible as:
- a list of atoms (JSON)
- with an `agentId` and `participantIds`
- and the stage or function under test

Recommended fixture shape:
```json
{
  "agentId": "A",
  "participantIds": ["A"],
  "atoms": [
    { "id": "ctx:danger:A", "ns": "ctx", "magnitude": 0.3, "confidence": 1.0 },
    { "id": "feat:char:A:trait.paranoia", "ns": "feat", "magnitude": 0.9, "confidence": 1.0 }
  ]
}
```

For lens repro:
- include base axis + the traits/body values used by lens.

For goal repro:
- include `ctx:final:*` and relevant `drv:*` plus any needed mem/rel signals.

For decision repro:
- include `util:*`, plus access/prior atoms as needed.

---

## 4) Bug report checklist (required fields)

When reporting a bug, record:
1) commit hash (or build id)
2) seed (if any)
3) agentId + participantIds
4) stage at which the issue first appears
5) the specific atom id(s) that are wrong
6) their trace.usedAtomIds
7) expected behavior phrased as an oracle (see docs/ORACLES.md)

---

## 5) Suggested “canonical repro scenarios”

### 5.1 Lens bias scenario

Purpose:
- ensure paranoia shifts danger upward even at midrange.

Setup:
- base: `ctx:danger:A = 0.5`
- traits: `paranoia=0.9`, others neutral

Expected:
- `ctx:final:danger:A ≥ 0.6` (tunable by docs/ORACLES.md)

### 5.2 Goal monotonicity scenario (danger → safety)

Purpose:
- ensure increasing danger does not decrease safety goal.

Setup:
- two runs identical except `ctx:final:danger` differs (0.3 vs 0.7)

Expected:
- `goal:safety(0.7) - goal:safety(0.3) ≥ -ε_mono`

### 5.3 Action isolation scenario

Purpose:
- ensure `action:*` never cites `goal:*`.

Setup:
- run full pipeline, inspect S8 action atoms.

Expected:
- `goal:` not present in action trace.
