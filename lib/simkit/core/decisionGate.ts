// lib/simkit/core/decisionGate.ts
// Dual-process gate with quick-arousal fallback for ticks where pipeline hasn't run.

import type { SimWorld, SimCharacter } from './types';
import { clamp01 } from '../../util/math';
import { FCS } from '../../config/formulaConfigSim';

export type DecisionMode = 'deliberative' | 'degraded' | 'reactive';

export type DecisionGateResult = {
  mode: DecisionMode;
  gate: {
    arousal: number;
    selfControl: number;
    surprise: number;
    fatigue: number;
    reactiveScore: number;
    arousalSource: 'emo' | 'quick';
  };
};

function readFact(facts: any, key: string, fb: number): number {
  const v = Number(facts?.[key]);
  return Number.isFinite(v) ? clamp01(v) : fb;
}

function getSelfControl(char: SimCharacter): number {
  const e: any = char.entity;
  const v = Number(e?.traits?.selfControl ?? e?.params?.selfControl ?? 0.5);
  return clamp01(Number.isFinite(v) ? v : 0.5);
}

function getMaxSurprise(facts: any, agentId: string): number {
  const atoms = Array.isArray(facts?.[`mem:beliefAtoms:${agentId}`])
    ? facts[`mem:beliefAtoms:${agentId}`] : [];
  let max = 0;
  for (const a of atoms) {
    if (String((a as any)?.id || '').startsWith('belief:surprise:')) {
      const m = Number((a as any)?.magnitude ?? 0);
      if (Number.isFinite(m) && m > max) max = m;
    }
  }
  return clamp01(max);
}

export function selectDecisionMode(world: SimWorld, agentId: string): DecisionGateResult {
  const char = world.characters[agentId];
  const cfg = FCS.dualProcess;
  const zero: DecisionGateResult = {
    mode: 'deliberative',
    gate: { arousal: 0, selfControl: 0.5, surprise: 0, fatigue: 0, reactiveScore: 0, arousalSource: 'quick' },
  };
  if (!char) return zero;

  const facts: any = world.facts || {};
  const selfControl = getSelfControl(char);
  const surprise = getMaxSurprise(facts, agentId);
  const fatigue = clamp01(Number((char as any).fatigue ?? facts[`body:fatigue:${agentId}`] ?? 0));

  // FIX A.1: Try pipeline emotion first; fall back to quick-arousal from raw signals.
  const emoArousal = readFact(facts, `emo:arousal:${agentId}`, -1);
  let arousal: number;
  let arousalSource: 'emo' | 'quick';

  if (emoArousal >= 0) {
    arousal = emoArousal;
    arousalSource = 'emo';
  } else {
    // Quick arousal from raw world signals (available even before first pipeline run).
    const danger = readFact(facts, `ctx:danger:${agentId}`, 0);
    const stress = clamp01(Number(char.stress ?? 0));
    arousal = clamp01(Math.max(danger, stress, surprise) * 0.7);
    arousalSource = 'quick';
  }

  const reactiveScore = clamp01(arousal * (1 - selfControl) + cfg.surpriseWeight * surprise);

  let mode: DecisionMode = 'deliberative';
  if (reactiveScore >= cfg.reactiveThreshold) mode = 'reactive';
  else if (reactiveScore >= cfg.degradedThreshold || fatigue >= cfg.fatigueHabitualThreshold) mode = 'degraded';

  return { mode, gate: { arousal, selfControl, surprise, fatigue, reactiveScore, arousalSource } };
}
