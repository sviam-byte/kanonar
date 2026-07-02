# SCENE_BATTERY_v1 — frozen scenes, affordance contract, and the observable

> **Status: SCAFFOLD (2026-06-19).** Section §0 (the observable) is **FROZEN** by
> user decision 2026-06-19. The scene set (§2) and affordance contract (§3) are
> drafted from the live harness but not yet frozen — they freeze when the open
> decisions in §4 are closed.
>
> This is **D1**, the gate. Nothing downstream (D2–D5, Step 0 sign-audit, the
> dynamics layer) is honest until §0 is fixed. See ordering in
> [WORKLOG_2026-06-18](WORKLOG_2026-06-18_BASIS_AND_DYNAMICS.md) and the per-claim
> standard in [FALSIFICATION_LEDGER](FALSIFICATION_LEDGER.md).

## Purpose

Freeze three things, in this order of importance:

1. **The observable** — the single vector on which "behaviour" and effective
   dimensionality `d_eff` are both measured. This choice decides whether Layer 2
   of the validation ladder carries empirical content or is tautological.
2. **The scene set** — the frozen battery of probe scenes, each carrying an
   affordance so a construct can express itself.
3. **The affordance contract per scene** — what is *physically* available to act
   on, so a "dead" axis is a real result, not a missing handle.

---

## §0 — FROZEN: the observable (the gate decision)

**Decision (user, 2026-06-19): the observable is the continuous internal
state-vector `v(t)`, used for BOTH the behaviour readout AND the `d_eff` readout.
No split.**

The plan offered three candidates and a split. The split (behaviour on `act:prior`,
`d_eff` on internal state) was rejected in favour of one observable for both. The
two rejected single-observable options and why:

| candidate | verdict | reason |
|---|---|---|
| S7 `goalLayerSnapshot.domains[].score01` | **rejected** | heavily normalized; Care 0→1 moves affiliation only +0.02. Empirically near-dead (worklog §2/§4). |
| S8 action distribution / argmax | **rejected** | `d_eff` on the action distribution is a **circle**: the dual-process gate produces the collapse *by construction*, so Layer 2 would confirm its own wiring. The trap. |
| **continuous internal state-vector `v(t)`** | **CHOSEN** | the collapse is *not* baked into the gate at this layer, so `d_eff(z)↓` on `v` is an empirical claim, not a definitional one. Most demanding, most honest. |

### Definition of `v(t)`

`v(t) ∈ ℝⁿ` is the concatenation of the **continuous** appraisal→drive→plan→tendency
cascade at tick `t`, read off the pipeline stages, **excluding** the discrete
argmax decision (whose inclusion is what makes the action-space readout
tautological).

Verified channel families available today (from
[runProbe.ts](../lib/goal-lab/probe/runProbe.ts#L19-L44)):

- `emo:*` — appraisal emotions (e.g. `emo:care`; confirmed live in worklog §23).
- `drv:*:<self>` — drivers (affiliationNeed, safetyNeed, statusNeed, …) — S6.
- `util:plan:<self>:<plan>` — plan utilities — S7.
- `act:prior:<self>:<target>:<verb>` — action tendencies (continuous, *not* the
  argmax) — S8. The strongest construct discriminator (worklog §23, §31).
- coarse subjective state: `ctx:final:danger:<self>`, body `stress`, `arousal`.

**FREEZE-ITEM (open):** the *exact* enumerated key set and ordering of `v` must be
frozen before any `d_eff` number is reported, so the vector is identical across
runs. Draft inclusion = `{emo:*, drv:*, util:plan:*, act:prior:*}`; the coarse
state scalars are candidate-include. Decision tracked in §4.

### Two readouts off the same `v`

- **Behaviour / construct readout** = `v` at the decision tick. The sign-audit,
  the D5 oracles, and the frozen sign-table all read this vector (today they read
  its `act:prior` / `util:plan` sub-blocks — consistent with this definition).
- **`d_eff` readout** = the frozen Layer-1 estimator (participation ratio +
  Grassberger–Procaccia correlation dimension; see
  [DYNAMICS_LAYER1_CALIBRATION](DYNAMICS_LAYER1_CALIBRATION.md)) applied to the
  **trajectory** `{v(t)}` over a rollout.

### KNOWN GAP this choice exposes (must be stated, not hidden)

`d_eff` needs a **trajectory** `{v(t₀…t_T)}`. The current probe harness runs a
**single tick** (deterministic readouts, seed-fixed). Therefore:

- the **behaviour** readout is available now (single-tick `v`);
- the **`d_eff`** readout is **NOT** available until a multi-tick rollout harness
  exists (this is Step 3 / the dynamics layer, not yet built — `lib/dynamics/core.ts`
  `stepDynamics` is a stub per the spine).

Do not report a `d_eff` number off a single tick. Until the rollout harness lands,
`d_eff` rows in [FALSIFICATION_LEDGER](FALSIFICATION_LEDGER.md) stay status
`BLOCKED: no trajectory harness`.

---

## §0-B — Observable B: outcomes (versioned ADDITION, FROZEN 2026-07-02)

§0 (observable A, the internal state-vector) is UNCHANGED — this section is
additive. Motivation: observable A lies on the mechanism's side of the boundary
(`act:prior` is near-linear in `PERSONALITY_ACTION_MAP` coefficients), so sign
tests on it validate wiring, not behavior. Observable B measures **what the
world receives**: the chosen action at S8, scored to an outcome and payoff.

The chain (code: [game.ts](../lib/goal-lab/probe/game.ts), consumed by
`runProbe` → `sweep` layer `OUTCOME`):

| step | value | source |
|---|---|---|
| chosen action | possibility id `kind:verb:self[:target]` | S8 `decisionSnapshot` over seeds |
| verb | segment 1 of the id | `verbOfActionKey` |
| move | frozen verb→move table per game | `Game.moves` (data, not regex) |
| outcome label | `Game.resolve(move, otherPolicy)` | total on declared moves |
| payoff `[self, other]` | `Game.outcomes[label]` | wraps `scene.payoff.outcomes` |

Readout family (layer `OUTCOME`): `outcome:<label>` (probability over seeds),
`outcome_mean_self`, `outcome_mean_other`, `coop_rate`, `unclassified_rate`.

**Definitional stipulations (part of the freeze, not tunable):**

1. `avoid` ≡ defect proxy in `G_defection` (the native-defect-verb gap on
   observable A is ledger row OBS-VOCAB; on observable B `betray`/`deceive`/
   `loot` DO exist as possibilities and are classified natively).
2. passive moves (`disengage`) resolve to the game-level label
   `no_engagement [0,0]` under BOTH policies — never scored as exploitation
   (`i_defect`) or victimhood; the scene's frozen PD matrix stays pure.
3. default `otherPolicy = 'cooperate'` — the frame where `i_defect` is
   profitable (what T3's re-operationalization needs). B is a static prop;
   its "move" is a stipulation, not a second pipeline run.

An unknown chosen verb scores `UNCLASSIFIED` and must never occur:
`unclassified_rate === 0` is gated by `tests/goals/outcome_scorer.test.ts`.
Changing a verb table = a new observable version, re-registered.

Pre-registered predictions on this observable: v2 table, 3 rows, frozen
2026-07-02 in [outcomeSignTable.ts](../lib/goal-lab/probe/outcomeSignTable.ts)
(v1 in `signTable.ts` untouched). Ledger rows: B-POWER-OUTCOME, B-CARE-COOP.

---

## §2 — Scene set (DRAFT, not yet frozen)

Live in [scenes.ts](../lib/goal-lab/probe/scenes.ts) today: **4**. The plan refers
to "6 current" = these 4 + the 2 pending the payoff harness (Step 1). One addition
is proposed.

| id | status | target constructs | affordance | layers |
|---|---|---|---|---|
| `S_neutral` | LIVE | (control) | none — catches leaky scenes | S7 |
| `S_vulnerable` | LIVE | Care, affiliation, Power-as-exploitation | wounded low-status B | S7,S8 |
| `S_hierarchy` | LIVE | Power, Liberty_Autonomy, Procedure, Tradition | B is leader, clearance 3 | S8 |
| `S_threat` | LIVE | Safety_Care, betrayal_cost, HPA | location hazard + hostile B | S7,S8 |
| `S_contest` | **LIVE** (built 2026-06-19) | Power, Justice, reciprocity | scene metric `scarcity=0.7` + `resourceAccess=0.2` + location tag `formal` | S8 |
| `S_defection` | **LIVE — but limited** (built 2026-06-19) | betrayal_cost, coalition_loyalty, reciprocity | scene metric `scarcity=0.6`; cooperate-vs-disengage only (see finding) | S8 |
| `S_coercive_order` | **PROPOSED** (see §4 decision) | **Liberty_Autonomy** (currently DEAD), Procedure | an authority *imposes a choice*; affordance = comply / defy / stall | S8 |

**Step 1 build results (verified on the toy probe agent, 2026-06-19):**
- **S_contest is a strong, working contest scene.** Sweeping `A_Power_Sovereignty`
  0.1→0.9 gives the textbook Power signature on `act:prior`: `command` +0.308,
  `threaten` +0.231, `accuse` +0.154, `negotiate` +0.080. (Test:
  `tests/goals/negotiation_scenes.test.ts`.)
- **S_defection is weak on this observable** and the limit is structural, not a
  scene bug: `C_betrayal_cost` 0.1→0.9 only nudges `confront` (+0.103);
  `C_coalition_loyalty` moves **nothing** (Δ<0.005 on every verb). Two causes,
  both pre-existing: (1) the `act:prior` vocabulary has **no native defect verb**
  (`betray`/`deceive`/`loot`/`defend_ally` are not emitted by `deriveActionPriors`
  ∪ `PERSONALITY_ACTION_MAP` — defection shows only as reduced cooperation +
  `harm`/`avoid`/`confront`); (2) `C_coalition_loyalty` is one of the barely-wired
  axes (worklog §4). The frozen `S_defection` prediction (`act:defend_ally` UP)
  therefore reads MISLABELED — recorded, not fixed. See ledger row **OBS-VOCAB**.
- **Affordance injection finding:** raw `ctx:*` / `event:*` atoms injected at S0 do
  **not** survive to the possibility stage. Scene context must be injected as
  `sceneSnapshot.metrics.*` (→ `ctx:src:scene:*` → `ctx:*`) and location tags
  (→ `isFormal`), the same channel the working scenes use.

**Rationale for `S_coercive_order`:** `A_Liberty_Autonomy` reads DEAD on real
characters (worklog §93) and the open question is whether that is real or a missing
affordance. `S_hierarchy` gives *presence* of authority but no *imposed choice* to
resist. Autonomy needs an imposition with a `defy` affordance to express. Adding
this scene is the cheap way to disambiguate "DEAD axis" from "DEAD scene". Whether
to add it now or after auditing the `axis→trait` mapping is a §4 decision.

---

## §3 — Affordance contract per scene (DRAFT)

Each scene must declare what is **physically available to act on**. An axis that
has no affordance in any scene cannot be called dead — it was never given a handle.
This table is the contract; gating rules here are **design requirements**, not bugs.

| affordance | available in | gated by | note |
|---|---|---|---|
| `help` / `treat` / `comfort` / `share_resource` | S_vulnerable | wounded/care-need atom present | care-need hint injected at S0 |
| `command` / `threaten` / `accuse` | S_hierarchy, S_threat | a second agent present | Power's real verb is `command` (worklog §31) |
| `guard` / `call_backup` / `escort` | S_threat | hazard or hostile present | Safety's real verbs |
| `verify` / `investigate` | S_threat, S_contest | ambiguous signal present | tolerance_ambiguity acts here |
| `comply` / `defy` / `stall` | **S_coercive_order** (proposed) | authority + imposed choice | the missing Autonomy handle |
| `off:attack` | S_threat | **threat AND protocol** | **gated by design** — attack must require both a threat appraisal and a protocol/authorization. This is a design requirement on the action grammar, not a bug to "fix" by ungating. |
| `defect` / `cooperate` | S_defection, S_contest | payoff matrix present | needs Step 1 payoff harness |

**Contract rule:** if a target construct in §2 has *no* row here that can express it,
the scene is mislabeled — fix the affordance, do not mark the axis dead.

---

## §4 — Open decisions (closes validation_plan_v0 decisions 1–3)

1. **`v` channel freeze** — enumerate the exact key set + ordering of the internal
   state-vector (draft `{emo:*, drv:*, util:plan:*, act:prior:*}`; include coarse
   state scalars y/n?). *Blocks every `d_eff` number.*
2. **`S_coercive_order`** — add now, or first audit the `A_Liberty_Autonomy →
   trait` mapping to rule out a wiring bug? (Recommendation: add the scene *and*
   audit; the scene is the cheaper discriminator.)
3. **Freeze trigger** — declare §2/§3 frozen once (1) and (2) are closed and the
   payoff harness (Step 1) lands `S_contest`/`S_defection`. Until then this doc
   stays `v1-draft`.

## §5 — Cross-links

- Observable consumed by: [LAYER_CONTRACTS](LAYER_CONTRACTS.md) (trace fields),
  [CONSTRUCT_ORACLES](CONSTRUCT_ORACLES.md) (oracle observables),
  [FALSIFICATION_LEDGER](FALSIFICATION_LEDGER.md) (`d_eff` rows).
- Estimator: [DYNAMICS_LAYER1_CALIBRATION](DYNAMICS_LAYER1_CALIBRATION.md).
- Harness: [GOAL_LAB_PROBE_HARNESS](GOAL_LAB_PROBE_HARNESS.md),
  [runProbe.ts](../lib/goal-lab/probe/runProbe.ts), [scenes.ts](../lib/goal-lab/probe/scenes.ts).

## Assumptions and limitations

Kanonar is a research/prototype simulation system. `v(t)` and its channels
(`emo:*`, `drv:*`, `util:plan:*`, `act:prior:*`, stress, danger) are internal
simulation scalars, not clinical, psychometric, or experimentally calibrated
measurements. `d_eff` computed on `v` is a property of the simulation's internal
dynamics; it is not a measured property of any real mind. The choice of observable
in §0 is an honesty constraint on *this model*, not a claim about psychology.
