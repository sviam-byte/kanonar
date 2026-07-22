export type ConflictInventoryKind = 'canonical_mechanic' | 'parameter_variant' | 'skin' | 'duplicate' | 'unsupported' | 'needs_multi_agent';

export interface ConflictInventoryEntry {
  readonly scenarioId: string;
  readonly kind: ConflictInventoryKind;
  readonly mechanicId?: 'trust_exchange';
  readonly visibleInConstructor: boolean;
  readonly reason: string;
}

/** Inventory is deliberately explicit: cards do not become executable mechanics by presentation. */
export const CONFLICT_SCENARIO_INVENTORY: readonly ConflictInventoryEntry[] = [
  { scenarioId: 'trust_interrogation', kind: 'canonical_mechanic', mechanicId: 'trust_exchange', visibleInConstructor: true, reason: 'Typed dyadic trust_exchange kernel.' },
  { scenarioId: 'opacity_deal', kind: 'parameter_variant', mechanicId: 'trust_exchange', visibleInConstructor: false, reason: 'Trust-exchange parameterization; no independent kernel.' },
  { scenarioId: 'protection_order', kind: 'unsupported', visibleInConstructor: false, reason: 'No typed transition kernel.' },
  { scenarioId: 'mutiny_order', kind: 'unsupported', visibleInConstructor: false, reason: 'No typed transition kernel.' },
  { scenarioId: 'authority_judgment', kind: 'unsupported', visibleInConstructor: false, reason: 'No typed transition kernel.' },
  { scenarioId: 'bargain_resource', kind: 'unsupported', visibleInConstructor: false, reason: 'No typed transition kernel.' },
  { scenarioId: 'care_asymmetry', kind: 'unsupported', visibleInConstructor: false, reason: 'No typed transition kernel.' },
  { scenarioId: 'ultimatum_ration', kind: 'unsupported', visibleInConstructor: false, reason: 'No typed transition kernel.' },
  { scenarioId: 'volunteer_mission', kind: 'unsupported', visibleInConstructor: false, reason: 'No typed transition kernel.' },
  { scenarioId: 'volunteer_report', kind: 'duplicate', visibleInConstructor: false, reason: 'Card variant; no distinct typed kernel.' },
  { scenarioId: 'signal_distress', kind: 'needs_multi_agent', visibleInConstructor: false, reason: 'Requires an explicit knowledge/belief protocol.' },
] as const;

export function constructorInventory(): readonly ConflictInventoryEntry[] {
  return CONFLICT_SCENARIO_INVENTORY.filter((entry) => entry.visibleInConstructor);
}

export function conflictInventoryEntry(scenarioId: string): ConflictInventoryEntry | undefined {
  return CONFLICT_SCENARIO_INVENTORY.find((entry) => entry.scenarioId === scenarioId);
}

export type ConflictCatalogLane = 'canonical' | 'compatibility' | 'unavailable';

// R6 step 4: the UI catalog lane is a pure function of typed inventory kind and
// runnability. Runnability (a non-disabled entry in the scenario registry) gates
// selectability; a non-runnable scenario is always `unavailable` regardless of
// kind. A runnable scenario is `canonical` only when the inventory names it the
// executable kernel; every other runnable scenario is an explicit compatibility
// run — so no card becomes an executable mechanic by presentation.
export function conflictCatalogLane(
  kind: ConflictInventoryKind | undefined,
  runnable: boolean,
): ConflictCatalogLane {
  if (!runnable) return 'unavailable';
  return kind === 'canonical_mechanic' ? 'canonical' : 'compatibility';
}
