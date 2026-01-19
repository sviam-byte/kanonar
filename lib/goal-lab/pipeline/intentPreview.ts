// lib/goal-lab/pipeline/intentPreview.ts
// Lightweight preview of "current aim" + micro-plan derived from atoms and decision artifacts.

import { arr } from '../../utils/arr';
import { describeGoal } from '../../goals/goalCatalog';

type IntentPreviewInput = {
  selfId: string;
  atoms: any[];
  s8Artifacts: { best: any | null; ranked: any[] };
  horizonSteps?: number;
};

type IntentPreview = {
  currentAim: { goalId: string; label: string; score: number } | null;
  decision: { actionId: string; targetId?: string } | null;
  microPlan: { steps: string[] };
};

function findTopActiveGoal(selfId: string, atoms: any[]) {
  const prefix = `goal:activeGoal:${selfId}:`;
  const candidates = arr(atoms)
    .filter((a) => typeof a?.id === 'string' && a.id.startsWith(prefix))
    .map((a) => ({
      atom: a,
      goalId: String(a.id).slice(prefix.length),
      score: Number(a.magnitude ?? a.value ?? 0),
    }))
    .filter((c) => c.goalId.length > 0);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function readCtxMagnitude(atoms: any[], key: string) {
  const needle = `ctx:${key}`;
  const atom = arr(atoms).find((a) => typeof a?.id === 'string' && a.id.includes(needle));
  return Number(atom?.magnitude ?? 0);
}

function buildMicroPlan(args: {
  publicness: number;
  privacy: number;
  secrecy: number;
  decision: { actionId?: string; targetId?: string } | null;
  horizonSteps: number;
}) {
  const steps: string[] = [];
  const { publicness, privacy, secrecy, decision, horizonSteps } = args;
  if (publicness > 0.6 || secrecy > 0.6) {
    steps.push('Find a less public spot');
  } else if (privacy > 0.6) {
    steps.push('Maintain privacy while repositioning');
  }
  if (decision?.targetId) {
    steps.push('Approach target');
  }
  if (decision?.actionId) {
    steps.push(`Initiate ${decision.actionId}`);
    steps.push('Execute action and update ToM');
  }
  return { steps: steps.slice(0, horizonSteps) };
}

export function buildIntentPreview(input: IntentPreviewInput): IntentPreview {
  const top = findTopActiveGoal(input.selfId, input.atoms);
  const entry = top ? describeGoal(top.goalId) : null;
  const label = entry?.label ?? top?.goalId ?? '';
  const best = input.s8Artifacts?.best || null;
  const ranked = arr(input.s8Artifacts?.ranked);
  const decisionSource = best || ranked[0] || null;
  const decision = decisionSource
    ? { actionId: String(decisionSource.actionId ?? decisionSource.kind ?? ''), targetId: decisionSource.targetId }
    : null;
  const publicness = readCtxMagnitude(input.atoms, 'publicness');
  const privacy = readCtxMagnitude(input.atoms, 'privacy');
  const secrecy = readCtxMagnitude(input.atoms, 'secrecy');
  const horizonSteps = Math.max(1, Math.min(8, Number(input.horizonSteps ?? 5)));

  return {
    currentAim: top ? { goalId: top.goalId, label, score: top.score } : null,
    decision,
    microPlan: buildMicroPlan({ publicness, privacy, secrecy, decision, horizonSteps }),
  };
}
