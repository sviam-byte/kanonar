
import { CharacterEntity, TraumaLoad } from '../../types';
import { getNestedValue } from '../param-utils';

export interface ArchetypeFieldMetrics {
  SELF_SUBJECT: number;
  SELF_INTEGRITY: number;
  OTHERS_CARE: number;
  OTHERS_DEPENDENCE: number;
  WORLD_ACCEPTANCE: number;
  WORLD_CHANGE_STYLE: number;
  SYSTEM_FORMALITY: number;
  SYSTEM_LOYALTY: number;
}

const clip = (x: number): number => Math.min(Math.max(x, 0), 1);

export const FIELD_METRIC_LABELS: Record<keyof ArchetypeFieldMetrics, string> = {
    SELF_SUBJECT: "Субъектность (Я-Автор)",
    SELF_INTEGRITY: "Цельность (Я-Монолит)",
    OTHERS_CARE: "Забота (Люди-Ценность)",
    OTHERS_DEPENDENCE: "Зависимость (Люди-Опора)",
    WORLD_ACCEPTANCE: "Принятие (Мир-Дом)",
    WORLD_CHANGE_STYLE: "Радикализм (Мир-Глина)",
    SYSTEM_FORMALITY: "Формализм (Закон-Буква)",
    SYSTEM_LOYALTY: "Лояльность (Закон-Щит)",
};

export const calculateFieldMetrics = (
    character: CharacterEntity, 
    trauma: TraumaLoad = { self: 0, others: 0, world: 0, system: 0 } // Default to 0 if not provided
): ArchetypeFieldMetrics => {
  const get = (key: string, def = 0.5) => getNestedValue(character.vector_base, key) ?? def;
  const getN = (path: string, def = 0.5) => (getNestedValue(character, path) as number | undefined) ?? def;

  // --- 1. SELF ---
  // SELF_SUBJECT: Active author vs Passive object.
  // Reduced by Self Trauma (helplessness) and World Trauma (overwhelming force).
  const SELF_SUBJECT = clip(
    0.4 * get('G_Narrative_agency') +
    0.3 * get('A_Liberty_Autonomy') +
    0.3 * get('B_goal_coherence') - 
    0.4 * trauma.self - 
    0.2 * trauma.world
  );

  // SELF_INTEGRITY: Coherent vs Split/Dissociated.
  // Reduced by Self Trauma (fragmentation).
  const SELF_INTEGRITY = clip(
    0.4 * get('G_Self_consistency_drive') +
    0.3 * get('G_Identity_rigidity') +
    0.3 * (1 - (getN('state.dark_exposure', 0) / 100)) -
    0.5 * trauma.self
  );

  // --- 2. OTHERS ---
  // OTHERS_CARE: Protective vs Instrumental.
  // Reduced by Others Trauma (betrayal/violence).
  const OTHERS_CARE = clip(
    0.4 * get('A_Safety_Care') +
    0.3 * (1 - get('C_dominance_empathy')) +
    0.3 * get('C_reciprocity_index') -
    0.5 * trauma.others
  );

  // OTHERS_DEPENDENCE: Needy vs Autonomous.
  // Increased by Others Trauma (fear of abandonment/need for safety).
  const OTHERS_DEPENDENCE = clip(
    0.4 * get('C_reputation_sensitivity') +
    0.3 * get('C_coalition_loyalty') +
    0.3 * (1 - get('G_Self_concept_strength')) +
    0.5 * trauma.others
  );

  // --- 3. WORLD ---
  // WORLD_ACCEPTANCE: "World is broken/wrong" vs "World is okay".
  // Reduced by World Trauma (catastrophe/hostility).
  const WORLD_ACCEPTANCE = clip(
    0.4 * get('E_Model_calibration') +
    0.3 * get('A_Knowledge_Truth') +
    0.3 * (1 - (getN('body.acute.moral_injury', 0) / 100)) -
    0.6 * trauma.world
  );

  // WORLD_CHANGE_STYLE: Incremental vs Radical.
  // Shifted to Radical by World Trauma (need to break the broken world).
  const WORLD_CHANGE_STYLE = clip(
    0.4 * get('B_exploration_rate') +
    0.3 * get('F_Value_update_rate') +
    0.3 * (1 - get('A_Tradition_Continuity')) +
    0.4 * trauma.world
  );

  // --- 4. SYSTEM ---
  // SYSTEM_FORMALITY: Rules/Protocol vs Situational.
  // Reduced by System Trauma (rules failed me).
  const SYSTEM_FORMALITY = clip(
    0.4 * get('A_Legitimacy_Procedure') +
    0.3 * get('B_cooldown_discipline') +
    0.3 * get('E_KB_civic') -
    0.5 * trauma.system
  );

  // SYSTEM_LOYALTY: Institution > Self vs Self > Institution.
  // Heavily reduced by System Trauma (betrayal by authority).
  const SYSTEM_LOYALTY = clip(
    0.4 * (getN('state.loyalty', 50) / 100) +
    0.3 * get('A_Causality_Sanctity') +
    0.3 * get('C_coalition_loyalty') -
    0.7 * trauma.system
  );

  return {
    SELF_SUBJECT,
    SELF_INTEGRITY,
    OTHERS_CARE,
    OTHERS_DEPENDENCE,
    WORLD_ACCEPTANCE,
    WORLD_CHANGE_STYLE,
    SYSTEM_FORMALITY,
    SYSTEM_LOYALTY,
  };
};
