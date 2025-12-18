
// lib/features/extractCharacter.ts
import { Features } from './types';
import { clamp01, mapRange01, num } from './scale';

export function extractCharacterFeatures(args: { character: any; selfId: string }): Features {
  const c = args.character || {};
  const id = args.selfId;

  const values: Record<string, number> = {};
  const trace: any = {};

  const set = (k: string, v: number, source: string, notes?: string[]) => {
    values[k] = clamp01(v);
    trace[k] = { source, notes };
  };

  // Body / physio
  const acute = c.body?.acute || {};
  const reserves = c.body?.reserves || {};
  const reg = c.body?.regulation || {};

  set('body.pain', mapRange01(num(acute.pain_now ?? acute.pain, 0), 0, 100), 'character.body.acute.pain');
  set('body.fatigue', mapRange01(num(acute.fatigue, 0), 0, 100), 'character.body.acute.fatigue');
  set('body.stress', mapRange01(num(acute.stress, 0), 0, 100), 'character.body.acute.stress');
  set('body.sleepDebt', mapRange01(num(reserves.sleep_debt_h ?? acute.sleepDebt, 0), 0, 72), 'character.body.reserves.sleepDebt');
  // Assuming energy 0-1 normalized
  set('body.energy', clamp01(num(reserves.energy, 1)), 'character.body.reserves.energy');
  set('body.regulation', clamp01(num(reg.arousal ?? 0.5, 0.5)), 'character.body.regulation.arousal');

  // Traits / Vector Base
  const vb = c.vector_base || {};
  set('trait.paranoia', clamp01(num(vb['C_betrayal_cost'], 0.5)), 'character.vector_base.C_betrayal_cost');
  set('trait.sensitivity', clamp01(num(vb['C_reputation_sensitivity'], 0.5)), 'character.vector_base.C_reputation_sensitivity');
  set('trait.experience', clamp01(num(c.context?.age ? (c.context.age - 18)/60 : 0.2, 0.2)), 'character.context.age');

  // Authority / clearance (if exists)
  const identity = c.identity || {};
  set('role.clearance', clamp01(num(identity.clearance_level, 0)/5), 'character.identity.clearance_level');

  return { schemaVersion: 1, kind: 'character', entityId: id, values, trace };
}
