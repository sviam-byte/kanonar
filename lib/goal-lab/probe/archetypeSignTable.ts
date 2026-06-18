// lib/goal-lab/probe/archetypeSignTable.ts
//
// Pre-registered μ-signatures for the archetype audit. Ground truth = the
// MODE_EFFECTS table in lib/archetypes/effects.ts (which computeArchetypeEffects
// applies) and the makeGoals μ-defaults in data/archetypes.ts. Frozen 2026-06-18.
//
// Note: reading preferredTags back equals MODE_EFFECTS[μ] near-tautologically;
// the non-trivial checks are (a) μ poles produce DISTINCT behavioral tops, and
// (b) the λ blend shifts actual→shadow. See archetypeProbe.ts.

export type Mu = 'SR' | 'SN' | 'ON' | 'OR';

export interface MuSignature {
  mu: Mu;
  label: string;
  preferredTags: string[];
  /** Candidate-action ids (archetypeProbe catalog) this μ should rank on top. */
  expectedTopActions: string[];
  /** Goal-axis directions from makeGoals μ-defaults (data/archetypes.ts). */
  goalAxesUp: string[];
}

export const MU_SIGNATURES: Record<Mu, MuSignature> = {
  SR: {
    mu: 'SR',
    label: 'Radical / Rebel',
    preferredTags: ['risk', 'challenge', 'force', 'autonomy'],
    expectedTopActions: ['rebel', 'aggress'],
    goalAxesUp: ['fix_world', 'free_flow', 'truth', 'chaos_change'],
  },
  SN: {
    mu: 'SN',
    label: 'Norm / Ruler',
    preferredTags: ['hierarchy', 'procedure', 'coordination', 'social'],
    expectedTopActions: ['coordinate'],
    goalAxesUp: ['preserve_order', 'control', 'care'],
  },
  ON: {
    mu: 'ON',
    label: 'Tool / Expert',
    preferredTags: ['compliance', 'progress', 'efficiency', 'work'],
    expectedTopActions: ['comply', 'optimize'],
    goalAxesUp: ['efficiency', 'control', 'truth'],
  },
  OR: {
    mu: 'OR',
    label: 'Victim / Trickster',
    preferredTags: ['deception', 'hide', 'avoidance', 'self'],
    expectedTopActions: ['deceive', 'withdraw'],
    goalAxesUp: ['escape_transcend', 'chaos_change'],
  },
};
