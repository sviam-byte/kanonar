# CONSTRUCT_ORACLES — author-oracle pack (character × scene)

> **Status: SCAFFOLD (2026-06-19).** Template + roster anchored; per-cell oracles
> to be filled.
>
> This is **D5**. It operationalizes the **CRAFT standard** (faithfulness to
> authorial intent) at the level the existing
> [axis_validation_registry.yaml](axis_validation_registry.yaml) does **not** reach:
> `character × scene`, not just `axis`. It produces the held-out oracle set that
> feeds [BASELINE_ABLATION_PROTOCOL](BASELINE_ABLATION_PROTOCOL.md) (D2) and the
> per-layer external tests in [LAYER_CONTRACTS](LAYER_CONTRACTS.md) (D3).

## Purpose

Make the narrative standard **checkable**, separately from the scientific one. For
each (character, scene) the author pre-registers what *should* and *must-not* happen
on the frozen observable. Agreement is a CRAFT result (judged here); it is **not**
evidence for the `d_eff` LAW (that is Layer 3 — see
[FALSIFICATION_LEDGER](FALSIFICATION_LEDGER.md), standard column).

## Relation to the axis registry

| | axis_validation_registry.yaml | CONSTRUCT_ORACLES (this) |
|---|---|---|
| unit | axis | character × scene |
| asks | "does this axis predict/■not-predict X?" | "does *this character* in *this scene* move the way the author intends?" |
| output | should_predict / should_not_predict | positive scenes / negative controls / expected & forbidden movement |

This doc does not duplicate the axis registry; it indexes into it (a character's
oracle references the axes it loads).

## Observable

All oracles are stated on the frozen observable `v(t)` — see
[SCENE_BATTERY_v1 §0](SCENE_BATTERY_v1.md). In practice the per-cell predictions are
written against the verified sub-blocks of `v`: `act:prior:*` and `util:plan:*`
(strongest discriminators), with `drv:*` / `emo:*` for appraisal-level checks.

## Oracle cell template

```md
### <character> × <scene>

- **Loads (axes/μ)** — which live axes + μ-pole this character brings (ref axis registry).
- **Observable** — the `v` sub-block read (e.g. `act:prior:<self>:B:*`).
- **Positive scenes** — where the construct should clearly express.
- **Negative controls** — where it must stay flat (catches leakage).
- **Expected movement** — channels that should rise/fall, with direction.
- **Forbidden movement** — channels that must NOT move (e.g. a care character must
  not top `threaten` in S_vulnerable).
- **Metrics** — top-k hit (expected in top-k), forbidden-rate (must be ~0),
  rank-correlation (expected vs observed channel ordering).
```

## Roster (5 contrast characters)

Anchored on three named in the plan (verified present in
[data/entities/](../data/entities/)); two more chosen to span the live axes and μ
poles.

| slot | character | file | role in the contrast (to confirm on read) |
|---|---|---|---|
| 1 | **Vestar** (Вестар) | `character-vestar.ts` | TBD — fill from entity on read |
| 2 | **Tamir** (Тамир) | `character-tamir.ts` | TBD |
| 3 | **Norr** (Нон) | `character-norr.ts` | TBD |
| 4 | **TBD** | — | pick a high-`A_Power_Sovereignty` / OR-pole character |
| 5 | **TBD** | — | pick a high-`A_Safety_Care` / SN-pole character |

**Selection rule for slots 4–5:** choose so the five together span (a) both poles of
the live Power/Safety axes, (b) at least one character that loads `A_Liberty_Autonomy`
(to exercise `S_coercive_order` and the AX-DEAD ledger row), and (c) the four μ poles
{SR, SN, ON, OR} across the set. Candidates to read: `master-gideon`,
`deicide-mentor`, `rhea`, `elara`, `en`.

## Coverage matrix (to fill)

Rows = the 5 characters; columns = frozen scenes
([SCENE_BATTERY_v1 §2](SCENE_BATTERY_v1.md)). Each cell gets one oracle from the
template. Prioritize cells where the character's loaded axis meets the scene's
affordance (the diagonal of intent).

| char \ scene | S_neutral | S_vulnerable | S_hierarchy | S_threat | S_coercive_order |
|---|---|---|---|---|---|
| Vestar | flat (control) | ? | ? | ? | ? |
| Tamir | flat | ? | ? | ? | ? |
| Norr | flat | ? | ? | ? | ? |
| slot 4 | flat | ? | ? | ? | ? |
| slot 5 | flat | ? | ? | ? | ? |

`S_neutral` is the leakage control for every character: expected movement ≈ 0; any
strong `act:prior` there is a leaky-scene bug, not a trait.

## Worked-cell stub (to validate the template before filling the matrix)

### <care-loading character> × S_vulnerable
- **Loads:** `A_Safety_Care` (high); μ near SN.
- **Observable:** `act:prior:<self>:B:*`, `drv:affiliationNeed`, `emo:care`.
- **Positive scene:** S_vulnerable (wounded B). **Negative control:** S_neutral.
- **Expected movement:** `treat`/`comfort`/`share_resource` ↑; `emo:care` ↑;
  `drv:affiliationNeed` ↑.
- **Forbidden movement:** `threaten`/`accuse` must NOT be top (forbidden-rate ~0).
- **Metrics:** care verb in top-2 (hit); forbidden-rate of threaten-top = 0;
  rank-corr(expected, observed) > 0.6.

## Open decisions

1. **Slots 4–5** — pick the two additional characters per the selection rule.
2. **Author sign-off** — who freezes the per-cell oracles (these are *authorial*
   pre-registrations; they must be set before any run, not fit to one).
3. **Metric thresholds** — top-k k, forbidden-rate tolerance, rank-corr floor;
   align with the D2 metric freeze.

## Assumptions and limitations

These oracles encode *authorial intent* for a fiction. Agreement means the
simulation renders characters as designed — a craft result. It is **not** a claim
that the characters' axes are validated psychological constructs, and it does not
support the falsifiable `d_eff` law (Layer 3 only). Character internal scalars
(`drv:*`, `emo:*`) are simulation variables, not measurements.
