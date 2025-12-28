
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
  set('trait.ambiguityTolerance', clamp01(num(vb['B_tolerance_ambiguity'], 0.5)), 'character.vector_base.B_tolerance_ambiguity');
  set('trait.hpaReactivity', clamp01(num(vb['D_HPA_reactivity'], 0.5)), 'character.vector_base.D_HPA_reactivity');
  set('trait.decisionTemperature', clamp01(num(vb['B_decision_temperature'], 0.5)), 'character.vector_base.B_decision_temperature');
  set('trait.discountRate', clamp01(num(vb['B_discount_rate'], 0.5)), 'character.vector_base.B_discount_rate');

  set('trait.care', clamp01(num(vb['A_Care_Compassion'], 0.5)), 'character.vector_base.A_Care_Compassion');
  set('trait.safety', clamp01(num(vb['A_Safety_Care'], 0.5)), 'character.vector_base.A_Safety_Care');
  set('trait.powerDrive', clamp01(num(vb['A_Power_Sovereignty'], 0.5)), 'character.vector_base.A_Power_Sovereignty');
  set('trait.formalism', clamp01(num(vb['A_Procedure_Formalism'], 0.5)), 'character.vector_base.A_Procedure_Formalism');
  set('trait.order', clamp01(num(vb['A_Tradition_Order'], 0.5)), 'character.vector_base.A_Tradition_Order');
  set('trait.autonomy', clamp01(num(vb['A_Liberty_Autonomy'], 0.5)), 'character.vector_base.A_Liberty_Autonomy');
  set('trait.truthNeed', clamp01(num(vb['A_Knowledge_Truth'], 0.5)), 'character.vector_base.A_Knowledge_Truth');
  set('trait.normSensitivity', clamp01(0.5 * values['trait.formalism'] + 0.5 * values['trait.order']), 'derived(trait.formalism,trait.order)');

  // Authority / clearance (if exists)
  const identity = c.identity || {};
  set('role.clearance', clamp01(num(identity.clearance_level, 0)/5), 'character.identity.clearance_level');

  return { schemaVersion: 1, kind: 'character', entityId: id, values, trace };
}
