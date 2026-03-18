// lib/simkit/dialogue/speechContent.ts
// Decides WHAT an agent actually says: truthful, selective, or deceptive.

import type { SimWorld } from '../core/types';
import { clamp01 } from '../../util/math';
import type { DialogueAtom, SpeechIntent } from './types';

export type SpeechContentInput = {
  speakerId: string;
  targetId: string;
  beliefAtoms: DialogueAtom[];
  topicAtoms: DialogueAtom[];
  goalScores: Record<string, number>;
  targetBelief?: DialogueAtom[];
};

export type SpeechContentResult = {
  intent: SpeechIntent;
  atoms: DialogueAtom[];
  omitted: DialogueAtom[];
  distorted: Array<{ original: DialogueAtom; transmitted: DialogueAtom }>;
  deceptionCost: number;
  trace: {
    selfControl: number;
    normSensitivity: number;
    trustToTarget: number;
    hasHiddenAgenda: boolean;
    deceptionQ: number;
    truthfulQ: number;
  };
};

function getTraitSafe(world: SimWorld, agentId: string, trait: string, fb: number): number {
  const c: any = world.characters[agentId];
  const v = Number(c?.entity?.traits?.[trait] ?? c?.entity?.params?.[trait] ?? fb);
  return clamp01(Number.isFinite(v) ? v : fb);
}

function getTrustTo(world: SimWorld, from: string, to: string): number {
  const facts: any = world.facts || {};
  const v = Number(facts[`rel:trust:${from}:${to}`] ?? facts?.relations?.[from]?.[to]?.trust ?? 0.5);
  return clamp01(Number.isFinite(v) ? v : 0.5);
}

function hasHiddenAgenda(world: SimWorld, agentId: string): boolean {
  const facts: any = world.facts || {};
  return !!facts[`secret:agenda:${agentId}`];
}

function atomGoalAlignment(atom: DialogueAtom, goalScores: Record<string, number>): number {
  const id = String(atom.id || '');
  let alignment = 0;
  if (id.includes('danger') || id.includes('threat')) alignment += (goalScores.safety ?? 0) * 0.3;
  if (id.includes('weakness') || id.includes('injury')) alignment -= (goalScores.status ?? 0) * 0.2;
  if (id.includes('resource') || id.includes('route')) alignment += (goalScores.exploration ?? 0) * 0.2;
  return alignment;
}

export function decideSpeechContent(world: SimWorld, input: SpeechContentInput): SpeechContentResult {
  const { speakerId, targetId, topicAtoms, goalScores } = input;

  const selfControl = getTraitSafe(world, speakerId, 'selfControl', 0.5);
  const normSensitivity = getTraitSafe(world, speakerId, 'normSensitivity', 0.5);
  const trustToTarget = getTrustTo(world, speakerId, targetId);
  const agenda = hasHiddenAgenda(world, speakerId);

  const truthfulQ = 0.5 + trustToTarget * 0.3 + normSensitivity * 0.2;

  let selectiveGain = 0;
  const harmfulAtoms: DialogueAtom[] = [];
  const helpfulAtoms: DialogueAtom[] = [];
  for (const a of topicAtoms) {
    const align = atomGoalAlignment(a, goalScores);
    if (align < -0.05) {
      harmfulAtoms.push(a);
      selectiveGain += Math.abs(align);
    } else {
      helpfulAtoms.push(a);
    }
  }
  const selectiveQ = 0.3 + selectiveGain - normSensitivity * 0.15 - trustToTarget * 0.1;

  const deceptiveGain = selectiveGain * 1.5;
  const detectionRisk = (1 - selfControl) * 0.3 + (1 - trustToTarget) * 0.2;
  const guiltPenalty = normSensitivity * 0.25;
  const deceptiveQ = agenda ? (0.2 + deceptiveGain - guiltPenalty - detectionRisk) : -1;

  let intent: SpeechIntent = 'truthful';
  if (deceptiveQ > truthfulQ && deceptiveQ > selectiveQ) intent = 'deceptive';
  else if (selectiveQ > truthfulQ && harmfulAtoms.length > 0) intent = 'selective';

  let atoms: DialogueAtom[] = topicAtoms;
  let omitted: DialogueAtom[] = [];
  let distorted: Array<{ original: DialogueAtom; transmitted: DialogueAtom }> = [];
  let deceptionCost = 0;

  if (intent === 'selective') {
    atoms = helpfulAtoms;
    omitted = harmfulAtoms;
    deceptionCost = omitted.length * 0.02 * (1 - selfControl);
  } else if (intent === 'deceptive') {
    atoms = topicAtoms.map((a) => {
      const align = atomGoalAlignment(a, goalScores);
      if (align >= -0.05) return a;
      const distortedMag = clamp01(a.magnitude * 0.3);
      const transmitted = { ...a, magnitude: distortedMag, trueMagnitude: a.magnitude };
      distorted.push({ original: a, transmitted });
      return transmitted;
    });
    deceptionCost = distorted.length * 0.04 * (1 - selfControl) + guiltPenalty * 0.1;
  }

  return {
    intent,
    atoms,
    omitted,
    distorted,
    deceptionCost,
    trace: { selfControl, normSensitivity, trustToTarget, hasHiddenAgenda: agenda, deceptionQ, truthfulQ },
  };
}
