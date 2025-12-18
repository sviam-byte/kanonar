

import {
  BodyModel,
  ReservesState,
  AcuteState,
  RegulationState,
  PhysiologyState,
} from '../types';

export interface PhysiologyEnv {
  physicalLoad: number;   // 0..1
  mentalLoad: number;     // 0..1
  isSleeping: boolean;
  ambientTemp: number;    // °C
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// BodyHormonal helper to compute hormonal state
interface HormonalInputs {
  hourOfDay: number;        // 0..24
  chronicStressLevel: number; // 0..1
  sleepDebt: number;        // 0..1
}

interface HormonalStateSnapshot {
  androgenLevel: number;      // 0..1
  painModifier: number;       // мультипликатор
  fatigueResistance: number;  // мультипликатор
  moodStability: number;      // мультипликатор
}

function computeHormonalState(
  h: any, // BodyHormonal
  inputs: HormonalInputs,
): HormonalStateSnapshot {
  const { hourOfDay, chronicStressLevel, sleepDebt } = inputs;

  const phaseShift = 8; // пик утром
  const circadian =
    1 +
    h.androgen_circadian_amplitude *
      Math.sin(((2 * Math.PI) * (hourOfDay - phaseShift)) / 24);

  const stressFactor = 1 - h.stress_sensitivity * chronicStressLevel;
  const sleepFactor = 1 - h.sleep_sensitivity * sleepDebt;

  const androgenLevel =
    h.androgen_baseline * circadian * stressFactor * sleepFactor;

  let painModifier = 1;
  let fatigueResistance = 1;
  let moodStability = 1;

  if (h.has_cyclic_hormones && h.cycle_effects && h.cycle_length_days && h.cycle_phase !== undefined) {
    const phase = h.cycle_phase; // 0..1
    let stage = 'follicular';

    if (phase < 0.25) stage = 'follicular';
    else if (phase < 0.5) stage = 'ovulation';
    else if (phase < 0.75) stage = 'luteal';
    else stage = 'menstruation';

    painModifier       = h.cycle_effects.pain_sensitivity[stage];
    fatigueResistance  = h.cycle_effects.fatigue_resistance[stage];
    moodStability      = h.cycle_effects.mood_stability[stage];
  }

  return {
    androgenLevel,
    painModifier,
    fatigueResistance,
    moodStability,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// один шаг по времени dtHours (например, 0.25 = 15 минут)
export function tickPhysiology(
  body: BodyModel,
  phys: PhysiologyState,
  env: PhysiologyEnv,
  dtHours: number,
): PhysiologyState {
  const dt = dtHours / 24; // нормировка

  // Create shallow copies of state objects to modify
  const reserves: ReservesState = { ...phys.reserves };
  const acute: AcuteState = { ...phys.acute };
  const regulation: RegulationState = { ...phys.regulation };

  const f = body.functional;
  const a = body.adipose;
  const h = body.hormonal;
  const r = body.reproductive;

  // --- 1. Базовая нагрузка ---

  const baseFitness =
    0.4 * ((f.strength_upper ?? 0.5) + (f.strength_lower ?? 0.5)) / 2 +
    0.4 * (f.aerobic_capacity ?? 0.5) -
    0.2 * ((a.body_fat_percent ?? 25) - 25) / 25;

  const fitness = clamp01(baseFitness);

  const physicalLoad = clamp01(env.physicalLoad);
  const mentalLoad = clamp01(env.mentalLoad);

  // увеличение усталости
  const fatigueGain =
    (physicalLoad * (1.2 - fitness) + mentalLoad * 0.6) * dt;

  // беременность усиливает усталость
  const pregnancyFatigue =
    r?.is_pregnant && r.fatigue_penalty
      ? r.fatigue_penalty * dt
      : 0;

  // --- 2. Обновление усталости и стресса ---

  acute.fatigue = clamp01((acute.fatigue ?? 0.0) + fatigueGain + pregnancyFatigue);

  // --- NON-LINEAR STRESS MODEL ---
  // Sensitivity vs Resilience
  const sensitivity = h.stress_sensitivity ?? 0.5; // 0..1
  const endurance = f.strength_endurance_profile ?? 0.5; // 0..1
  
  // Nonlinearity Factor: -1 (Hardening) to +1 (Sensitizing)
  // If Sens > Endure -> Positive -> Exponential growth (Panic Spiral)
  // If Endure > Sens -> Negative -> Logarithmic growth (Damping/Hardening)
  const nonlinearity = (sensitivity - endurance); 
  
  const currentStress = acute.stress_level ?? 0.0;
  
  const hormoneTension =
    0.5 * sensitivity + 0.5 * (h.sleep_sensitivity ?? 0.5);

  // Base linear gain
  const baseStressGain =
    (mentalLoad * (0.5 + hormoneTension) + physicalLoad * 0.3) * dt;

  // Apply nonlinearity: 
  // EffectiveGain = BaseGain * (1 + nonlinearity * currentStress * 2)
  // If nonlinearity is positive (fragile), higher current stress INCREASES gain.
  // If nonlinearity is negative (tough), higher current stress DECREASES gain.
  const dynamicMultiplier = 1.0 + (nonlinearity * currentStress * 1.5);
  
  // Ensure multiplier doesn't go below 0.1 (stress always accumulates at least a little)
  const finalStressGain = baseStressGain * Math.max(0.1, dynamicMultiplier);

  acute.stress_level = clamp01(currentStress + finalStressGain);

  // --- 3. Сон / недосып и циркадка ---

  // Use explicit sleep debt field
  let sleepDebt = reserves.sleep_debt ?? 0;

  // восстановление усталости во сне
  if (env.isSleeping) {
    const recoveryRate =
      (f.recovery_speed ?? 0.5) * (1 + fitness);
    acute.fatigue = clamp01(
      acute.fatigue - recoveryRate * dt,
    );
    acute.stress_level = clamp01(
      acute.stress_level - 0.5 * recoveryRate * dt,
    );
    // sleep reduces debt
    sleepDebt = clamp01(sleepDebt - 0.3 * dt);
  } else {
    // недосып усиливает стресс and debt accumulates
    // Non-linear effect of sleep debt on stress as well
    const sleepStressFactor = 0.2 * (1 + nonlinearity); 
    acute.stress_level = clamp01(
      acute.stress_level + sleepDebt * sleepStressFactor * dt,
    );
    sleepDebt = clamp01(
      sleepDebt + 0.05 * dt,
    );
  }
  
  reserves.sleep_debt = sleepDebt;

  // циркадная фаза
  const phase = reserves.circadian_phase_h ?? 12;
  reserves.circadian_phase_h = (phase + 24 * dt) % 24;

  // 2) гормональное состояние на текущий час (calculated after phase update)
  const hormonalState = computeHormonalState(h, {
    hourOfDay: reserves.circadian_phase_h,
    chronicStressLevel: acute.stress_level,
    sleepDebt: reserves.sleep_debt,
  });

  const androgen = clamp01(hormonalState.androgenLevel);
  const fatigueResist = hormonalState.fatigueResistance;
  const moodStability = hormonalState.moodStability;

  // 3b) гомеостат сна (S) logic from prompt
  let sleep_homeostat_S = reserves.sleep_homeostat_S;
  if (env.isSleeping) {
     sleep_homeostat_S = clamp01(sleep_homeostat_S - 0.5 * dtHours);
  } else {
     sleep_homeostat_S = clamp01(sleep_homeostat_S + 0.1 * dtHours);
  }
  reserves.sleep_homeostat_S = sleep_homeostat_S;

  // учёт чувствительности к недосыпу: сильный недосып усиливает усталость и стресс
  const sleepPenalty = h.sleep_sensitivity * sleepDebt;


  // --- 4. Энергия, гликемия, иммунитет ---

  // Use energy_reserve_kcal but normalize to 0-1 'energy' concept for calculation if needed,
  // or use the explicit field if available. Let's use energy (0-1) if present, or derive from kcal.
  // If using a snippet logic: `reserves.energy` is 0-1.
  // Let's normalize kcal to 0-1 for the logic
  const MAX_KCAL = 2500; // Assumed max
  let energy = (reserves.energy_store_kJ ?? 1200) / MAX_KCAL;
  if (reserves.energy !== undefined) energy = reserves.energy;

  const energyUse =
    (physicalLoad * 0.6 + mentalLoad * 0.3) * dt;

  energy = clamp01(energy - energyUse);

  const fatBuffer =
    (a.metabolic_reserve ?? 0.5) * (a.body_fat_percent ?? 25) / 30;

  if (energy < 0.3 && fatBuffer > 0.2) {
    // тело тянет из жирового резерва
    energy = clamp01(energy + fatBuffer * 0.3 * dt);
  }
  
  // Write back normalized energy and update kcal
  reserves.energy = energy;
  reserves.energy_store_kJ = energy * MAX_KCAL;

  // простая модель иммунитета: и стресс, и недосып его просаживают
  const immune = reserves.immune_tone ?? 0.7;
  const immuneLoss =
    (acute.stress_level ?? 0) * 0.2 * dt +
    sleepDebt * 0.2 * dt;
    
  const energyLackFactor = energy < 0.2 ? (0.2 - energy) / 0.2 : 0;
  const immuneDropFromEnergy = energyLackFactor * 0.3 * dt;

  reserves.immune_tone = clamp01(immune - immuneLoss - immuneDropFromEnergy);

  // Fatigue Update with hormonal modifiers from prompt
  const enduranceVal = f.strength_endurance_profile ?? 0.5; // 0..1
  const loadFatigue =
    env.physicalLoad * (1 - enduranceVal) * dt * 0.7;
  const sleepFatigue = sleepPenalty * dt * 0.5;
  const energyFatigue = energyLackFactor * dt * 0.7;
  const androgenCompensation = (androgen - 0.3) * 0.2;

  // Update fatigue again with these factors
  acute.fatigue = clamp01(
    acute.fatigue + loadFatigue + sleepFatigue + energyFatigue - androgenCompensation
  );

  // Mood buffer for stress
  const moodBuffer = (moodStability - 1) * 0.2;
  acute.stress_level = clamp01(acute.stress_level + moodBuffer);


  // --- 5. Температура, травмы ---

  const targetTemp = 36.8 + (r?.heart_rate_increase ?? 0) * 0.1;
  const currentTemp = acute.temperature_C ?? 36.8;
  // Light drift from load/env
  const tempFromLoad = env.physicalLoad * 0.5;
  const tempFromEnv = (env.ambientTemp - 22) * 0.02;
  const finalTargetTemp = targetTemp + tempFromLoad + tempFromEnv;
  
  acute.temperature_C = lerp(currentTemp, finalTargetTemp, 0.3 * dt);

  const injuries = acute.injuries_severity ?? 0.0;
  const injuryRiskBase =
    ((f.injury_risk?.knees ?? 0.5) +
      (f.injury_risk?.ankles ?? 0.5) +
      (f.injury_risk?.lower_back ?? 0.5) +
      (f.injury_risk?.shoulders ?? 0.5)) / 4;

  const injuryLoad = physicalLoad * clamp01(injuryRiskBase + (r?.injury_risk_increase ?? 0));

  // шанс мелкой травмы
  const newInjury = injuryLoad > 0.7 ? 0.1 * dt : 0;

  acute.injuries_severity = clamp01(
    injuries + newInjury - 0.05 * dt, // Natural healing
  );

  // --- 6. Регуляция (HPA, возбуждение) ---

  // HPA реагирует на стресс + недосып
  const targetHPA = clamp01(
    0.3 + acute.stress_level * 0.6 + sleepDebt * 0.2,
  );
  regulation.hpa_axis_activity = lerp(regulation.hpa_axis_activity ?? 0.5, targetHPA, 0.3 * dt);

  // возбуждение: андроген + нагрузка + стресс
  const targetArousal = clamp01(
    0.2 + androgen * 0.4 + env.physicalLoad * 0.3 + acute.stress_level * 0.2,
  );
  regulation.arousal = lerp(regulation.arousal ?? 0.5, targetArousal, 0.4 * dt);

  // --- 8. Reaction Time & Pain ---

  let reaction_time_ms = acute.reaction_time_ms ?? 250;
  const fatigueSlowdown = acute.fatigue * 100;          // до +100 мс
  const sleepSlowdown   = sleepDebt * 80;       // до +80 мс
  const arousalEffect   = (regulation.arousal - 0.5) * -60; // оптимум при ~0.5

  const targetReaction = 250 + fatigueSlowdown + sleepSlowdown + arousalEffect;
  acute.reaction_time_ms = lerp(reaction_time_ms, targetReaction, 0.4 * dt);

  let pain_current = acute.pain_current ?? 0;
  const basePain = acute.injuries_severity; // базовая боль от травм
  const hormonalPain = basePain * (hormonalState.painModifier - 1);
  const targetPain = clamp01(basePain + hormonalPain);
  acute.pain_current = lerp(pain_current, targetPain, 0.5 * dt);


  // --- 7. Агрегаты для симуляции ---

  const fitness_index = fitness;
  const fragility_index = clamp01(injuryRiskBase);
  const hormonal_tension = clamp01(hormoneTension);

  return {
    reserves,
    acute,
    regulation,
    fitness_index,
    fragility_index,
    hormonal_tension,
  };
}
