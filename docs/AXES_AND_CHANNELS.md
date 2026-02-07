# Axes & Channels reference — v69

Goal: make “what signals exist” explicit so agents and tests stop guessing.

Sources of truth:
- base axes: `lib/context/axes/deriveAxes.ts`
- stage1 context derivations: `lib/context/stage1/*`
- ctx access helper: `lib/context/layers.ts` → `getCtx`
- goal derivation: `lib/goals/goalAtoms.ts`
- energy channels & propagation: `lib/graph/atomEnergy.ts` + SignalField construction in `lib/goals/goalAtoms.ts`

---

## 1) Context axes (ctx:* and ctx:final:*)

### 1.1 Layering

Base (“objective”):
- `ctx:<axis>:<agentId>`

Final (“subjective”, after lens):
- `ctx:final:<axis>:<agentId>`

Retrieval should be via:
- `getCtx(atoms, selfId, axis, fallback)`
which resolves final-first.

### 1.2 Core axes (by convention)

The codebase uses a set of named axes. The exact list is defined by deriveAxes;
the ones that are treated as “core” in Goal Lab UX and tests should include:

- danger
- uncertainty
- control
- normPressure
- socialProximity (or closeness/trust-adjacent scalar, if implemented)
- resourcePressure (or scarcity/need scalar, if implemented)

**Policy**:
- If a new axis is added to deriveAxes, it must be recorded here and included (or explicitly excluded)
  from lens + docs/ORACLES.md monotonicity tests as appropriate.

---

## 2) Character traits/body features (feat:char:*)

Lens uses character feature atoms (traits and body state) by id pattern:
- `feat:char:<agentId>:trait.<name>`
- `feat:char:<agentId>:body.<name>`

Common traits used by lens logic (examples reflected in docs/MODELS.md):
- trait.paranoia
- trait.sensitivity
- trait.experience
- trait.ambiguityTolerance
- trait.hpaReactivity

Common body states:
- body.stress
- body.fatigue

**Neutral point**:
- trait/body value 0.5 is treated as neutral baseline.

---

## 3) Energy channels (SignalField + propagation)

### 3.1 What a “channel” means here

Channel is a semantic lens for explainability and multi-source aggregation.
It is **not** a learned latent. It is an accounting bucket:
- we inject initial energy into channel-specific source nodes
- we propagate along trace edges
- we read energy on goal/util nodes as “attribution mass” for that channel

### 3.2 Propagation is channel-independent

Propagation math is identical for all channels (linear damped push).
Channels differ only by:
- which nodes are seeded as sources
- how large the seed magnitude is

See `docs/MODELS.md` section C.

### 3.3 Recommended “canonical channels”

These names should match what SignalField/goal scoring uses. If code uses different names,
rename this section to match code.

Typical set in this project family:
- threat / danger
- uncertainty
- norm / social
- attachment / affiliation
- resource
- status
- curiosity
- base (generic)

**Policy**:
- Channel list should be enumerated by the code that builds SignalField.
- If new channel appears, it must be added here + in UI legend.

---

## 4) Mapping: axes → goal domains (conceptual)

Goal scoring commonly uses a weighted mapping of context axes/drivers to goal domains.
Even if code is more complex, keep a high-level contract here:

Let:
- `x_i` be relevant normalized inputs (ctx:final axes, drivers, etc.)
- `w_{d,i}` be weights for domain d

Then a domain logit or score (conceptually) is:

`z_d = Σ_i w_{d,i} · x_i + b_d`

and squashed score:

`g_d = σ(z_d)` where `σ(t) = 1/(1+e^{-t})`

If implementation uses different squashing (clamp/softmax/etc.), document it in docs/MODELS.md.

**Monotonicity expectations** (used by ORACLES):
- safety domain: increasing danger should not reduce g_safety
- explore domain: increasing danger should not increase g_explore

---

## 5) Practical debugging: “which axis feeds which goal”

In v69, the *explainability ground truth* is:
- edges = trace dependencies (AtomGraph)
- energy overlay = propagated attribution mass

So to answer “why goal X is high”:
1) find `goal:*` atom for X
2) inspect trace.usedAtomIds (direct dependencies)
3) inspect energy contributions for the channel of interest (topK)
4) trace back to the ctx:final axes and trait/body atoms that generated them

---

## 6) Criteria: when this file must be updated

Update required when:
- a new ctx axis is produced in deriveAxes or stage1 derivations
- the lens starts using a new trait/body feature
- SignalField adds/removes channels
- goal domains change meaning or mapping
