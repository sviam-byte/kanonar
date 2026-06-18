// lib/goal-lab/probe/archetypeProbe.ts
//
// Workstream B: audit the ARCHETYPE / μ basis (the spine's π_simple layer).
// Archetype does NOT flow into runGoalLabPipelineV1, so this uses its own
// readouts:
//   (1) effect vectors  — computeArchetypeEffects(agent) {goalMods, actionBiases,
//       preferredTags, avoidedTags}, deterministic given agent.archetype;
//   (2) λ blend         — as shadowActivation 0→1, effects shift actual→shadow;
//   (3) behavior        — fromArchetype contribution to action Q, ranking a fixed
//       candidate set. This MIRRORS the archetype block of computeQ
//       (lib/choice/qvalue.ts:361-392) so it stays faithful to the live wiring
//       without constructing a full WorldState.

import type { AgentState } from '../../../types';
import { allArchetypes } from '../../../data/archetypes';
import { computeArchetypeEffects, type ArchetypeEffects } from '../../archetypes/effects';

export type Mu = 'SR' | 'SN' | 'ON' | 'OR';

export interface CandidateAction {
  id: string;
  tags: string[];
}

// Candidate actions spanning the MODE_EFFECTS tag vocabulary, so each μ has
// something to prefer/avoid.
export const ARCHETYPE_ACTION_CATALOG: CandidateAction[] = [
  { id: 'aggress', tags: ['force', 'conflict', 'risk'] },
  { id: 'rebel', tags: ['challenge', 'autonomy', 'risk'] },
  { id: 'comply', tags: ['compliance', 'obedience', 'work'] },
  { id: 'coordinate', tags: ['hierarchy', 'coordination', 'procedure', 'social'] },
  { id: 'deceive', tags: ['deception', 'hide', 'self'] },
  { id: 'withdraw', tags: ['hide', 'avoidance', 'self'] },
  { id: 'help', tags: ['care', 'social'] },
  { id: 'optimize', tags: ['efficiency', 'progress', 'work'] },
];

function archetypeAgent(actualId: string, shadowId?: string, shadowActivation = 0): AgentState {
  return { archetype: { actualId, shadowId, shadowActivation } } as unknown as AgentState;
}

export function effectReadout(actualId: string, shadowId?: string, shadowActivation = 0): ArchetypeEffects {
  return computeArchetypeEffects(archetypeAgent(actualId, shadowId, shadowActivation));
}

/** fromArchetype contribution to an action's Q — mirrors qvalue.ts:361-392. */
export function archetypeActionBias(effects: ArchetypeEffects, action: CandidateAction): number {
  const tags = action.tags || [];
  let f = 0;
  for (const [tag, bias] of Object.entries(effects.actionBiases)) {
    if (tags.includes(tag) || action.id === tag) f += bias;
  }
  if (effects.preferredTags?.length && tags.some((t) => effects.preferredTags.includes(t))) f += 0.8;
  if (effects.avoidedTags?.length && tags.some((t) => effects.avoidedTags.includes(t))) f -= 0.8;
  return f;
}

export interface BehaviorReadout {
  ranked: Array<{ id: string; bias: number }>;
  top: string | null;
}

export function behaviorReadout(
  actualId: string,
  shadowId?: string,
  shadowActivation = 0,
  catalog: CandidateAction[] = ARCHETYPE_ACTION_CATALOG,
): BehaviorReadout {
  const effects = effectReadout(actualId, shadowId, shadowActivation);
  const ranked = catalog
    .map((a) => ({ id: a.id, bias: Number(archetypeActionBias(effects, a).toFixed(4)) }))
    .sort((x, y) => y.bias - x.bias);
  return { ranked, top: ranked[0]?.id ?? null };
}

export function archetypesByMu(): Record<Mu, string[]> {
  const out: Record<Mu, string[]> = { SR: [], SN: [], ON: [], OR: [] };
  for (const a of allArchetypes as any[]) {
    const mu = a?.mu as Mu;
    if (mu && out[mu]) out[mu].push(String(a.id));
  }
  return out;
}

/** A representative archetype id per μ (Dogmatist function, human layer). */
export function representativeByMu(): Record<Mu, string> {
  return { SR: 'H-1-SR', SN: 'H-1-SN', ON: 'H-1-ON', OR: 'H-1-OR' };
}

/** λ sweep: actual→shadow blend of a key effect signal. */
export function lambdaSweep(
  actualId: string,
  shadowId: string,
  steps = 5,
): Array<{ lambda: number; top: string | null; preferredTags: string[] }> {
  const out: Array<{ lambda: number; top: string | null; preferredTags: string[] }> = [];
  for (let i = 0; i < steps; i++) {
    const lambda = steps <= 1 ? 0 : i / (steps - 1);
    const eff = effectReadout(actualId, shadowId, lambda);
    const beh = behaviorReadout(actualId, shadowId, lambda);
    out.push({ lambda: Number(lambda.toFixed(2)), top: beh.top, preferredTags: eff.preferredTags });
  }
  return out;
}
