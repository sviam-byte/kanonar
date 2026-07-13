// R6 step 4: the Conflict Lab catalog lane is driven by the typed inventory,
// not by presentation. Runnability (a non-disabled entry in the scenario
// registry) gates selectability; the inventory kind decides canonical vs an
// explicit compatibility run. This regression pins that mapping so no card can
// silently re-promote itself into an executable mechanic.

import { describe, expect, it } from 'vitest';

import { allScenarios } from '@/lib/dilemma/scenarios';
import {
  CONFLICT_SCENARIO_INVENTORY,
  conflictCatalogLane,
  conflictInventoryEntry,
  constructorInventory,
} from '@/lib/dilemma';

describe('R6 conflict catalog lane', () => {
  it('is a pure function of inventory kind and runnability', () => {
    expect(conflictCatalogLane('canonical_mechanic', true)).toBe('canonical');
    expect(conflictCatalogLane('unsupported', true)).toBe('compatibility');
    expect(conflictCatalogLane('parameter_variant', true)).toBe('compatibility');
    expect(conflictCatalogLane('needs_multi_agent', true)).toBe('compatibility');
    expect(conflictCatalogLane('duplicate', true)).toBe('compatibility');
    // Not runnable is always unavailable, regardless of kind.
    expect(conflictCatalogLane('canonical_mechanic', false)).toBe('unavailable');
    expect(conflictCatalogLane('unsupported', false)).toBe('unavailable');
    expect(conflictCatalogLane(undefined, true)).toBe('compatibility');
    expect(conflictCatalogLane(undefined, false)).toBe('unavailable');
  });

  it('classifies every registered scenario and leaves none unlabeled', () => {
    const all = allScenarios({ includeDisabled: true });
    for (const s of all) {
      expect(conflictInventoryEntry(s.id), `inventory entry for ${s.id}`).toBeDefined();
    }
    // No inventory entry points at a scenario id that does not exist.
    const ids = new Set(all.map((s) => s.id));
    for (const entry of CONFLICT_SCENARIO_INVENTORY) {
      expect(ids.has(entry.scenarioId), `scenario for ${entry.scenarioId}`).toBe(true);
    }
  });

  it('puts exactly the canonical kernel in the selectable canonical lane', () => {
    const active = allScenarios(); // runnable only (disabled excluded)
    const lanes = active.map((s) => ({
      id: s.id,
      lane: conflictCatalogLane(conflictInventoryEntry(s.id)?.kind, true),
    }));
    const canonical = lanes.filter((l) => l.lane === 'canonical').map((l) => l.id);
    const compatibility = lanes.filter((l) => l.lane === 'compatibility').map((l) => l.id);

    expect(canonical).toEqual(['trust_interrogation']);
    // The canonical lane is exactly the constructor-visible inventory, intersected with runnable.
    expect(canonical).toEqual(constructorInventory().map((e) => e.scenarioId));
    // Every other runnable scenario is an explicit compatibility run, never canonical.
    expect(compatibility.length).toBe(active.length - 1);
    expect(compatibility).not.toContain('trust_interrogation');
  });

  it('keeps disabled scenarios out of any selectable lane', () => {
    const disabled = allScenarios({ includeDisabled: true }).filter((s) => s.disabled);
    for (const s of disabled) {
      expect(conflictCatalogLane(conflictInventoryEntry(s.id)?.kind, false)).toBe('unavailable');
    }
    expect(disabled.length).toBeGreaterThan(0);
  });
});
