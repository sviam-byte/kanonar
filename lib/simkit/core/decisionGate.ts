// lib/simkit/core/decisionGate.ts
// Dual-process gate: System 1 (reactive) / 1.5 (degraded) / 2 (deliberative).

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
  const zero = { arousal: 0, selfControl: 0.5, surprise: 0, fatigue: 0, reactiveScore: 0 };
  if (!char) return { mode: 'deliberative', gate: zero };

  const facts: any = world.facts || {};
  const arousal = readFact(facts, `emo:arousal:${agentId}`, 0);
  const selfControl = getSelfControl(char);
  const surprise = getMaxSurprise(facts, agentId);
  const fatigue = clamp01(Number((char as any).fatigue ?? facts[`body:fatigue:${agentId}`] ?? 0));

  const reactiveScore = clamp01(arousal * (1 - selfControl) + cfg.surpriseWeight * surprise);

  let mode: DecisionMode = 'deliberative';
  if (reactiveScore >= cfg.reactiveThreshold) mode = 'reactive';
  else if (reactiveScore >= cfg.degradedThreshold || fatigue >= cfg.fatigueHabitualThreshold) mode = 'degraded';

  return { mode, gate: { arousal, selfControl, surprise, fatigue, reactiveScore } };
}
