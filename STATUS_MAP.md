# STATUS MAP (canonical / compat / legacy / archive)

Status labels:
- **canonical**: source of truth for current behavior and new patches.
- **compat**: compatibility/adaptation layer; may be read, but not authoritative for new semantics.
- **legacy**: historical runtime compatibility; avoid extending unless migration requires it.
- **archive**: historical reference only; never use as implementation truth.

## Canonical

- `docs/PIPELINE.md`
- `docs/INVARIANTS.md`
- `docs/IDS_AND_NAMESPACES.md`
- `docs/EXPLAINABILITY.md`
- `docs/REPRO.md`
- `lib/context/v2/*`
- `lib/goal-lab/pipeline/*`
- `lib/decision/*`
- `lib/core/noise.ts`
- `lib/config/formulaConfig.ts`
- `lib/goals/*`
- `lib/simkit/*`
- `tests/pipeline/*`
- `tests/decision/*`
- `tests/simkit/*`

## Compat

- Cross-layer adapters that preserve old payloads/contracts during migration.
- Fallback namespace reads explicitly documented in canonical docs.
- Integration glue where canonical data is adapted for UI shape.

> Note: compat areas are allowed in runtime but must not silently redefine behavior contracts.

## Legacy

- Older route variants / lab variants kept for compatibility.
- Old namespace patterns still parsed for tolerance but not preferred for writes/new consumers.
- Historical large files with mixed responsibilities unless explicitly promoted to canonical.

## Archive

- `archive/*`

## Patch policy by status

- If touching **canonical**: enforce tests and docs consistency.
- If touching **compat**: document why compat is still needed and the migration target.
- If touching **legacy**: avoid semantic changes unless linked to migration/safety fix.
- If touching **archive**: avoid, unless extracting reference for canonical migration.
