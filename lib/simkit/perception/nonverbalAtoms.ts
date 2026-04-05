// lib/simkit/perception/nonverbalAtoms.ts
// Generate observable body-language atoms from agent internal states.

import type { SimWorld } from '../core/types';
import { clamp01 } from '../../util/math';
import { FCS } from '../../config/formulaConfigSim';

export type NonverbalAtom = {
  id: string;
  observerId: string;
  subjectId: string;
  kind: string;
  magnitude: number;
  confidence: number;
  source: 'nonverbal';
};

function navDistance(world: SimWorld, a: string, b: string): number {
  const ca = world.characters[a];
  const cb = world.characters[b];
  if (!ca || !cb) return Infinity;
  if ((ca as any).locId !== (cb as any).locId) return Infinity;
  const na = (ca as any).pos?.nodeId;
  const nb = (cb as any).pos?.nodeId;
  if (na && nb && na === nb) return 0;
  if (na && nb) return 1;
  return 0;
}

export function generateNonverbalAtoms(world: SimWorld): NonverbalAtom[] {
  const cfg = FCS.infoChannels.nonverbal;
  const chars = Object.values(world.characters || {});
  const facts: any = world.facts || {};
  const out: NonverbalAtom[] = [];

  for (const observer of chars) {
    for (const subject of chars) {
      if (observer.id === subject.id) continue;

      const dist = navDistance(world, observer.id, subject.id);
      if (!Number.isFinite(dist)) continue;

      const baseConf = clamp01(FCS.infoChannels.vision.sameLocationConfidence - cfg.distanceDecay * dist);
      if (baseConf < 0.1) continue;

      const selfCtrl = clamp01(Number((subject.entity as any)?.traits?.selfControl ?? 0.5));
      const suppressionFactor = 1 - cfg.selfControlSuppression * selfCtrl;

      const observerHiding = String(facts?.[`lastAction:${observer.id}`]?.kind ?? '') === 'hide';
      const obsBonus = observerHiding ? 0.9 : 1.0;

      const stress = clamp01(Number(subject.stress ?? 0));
      if (stress * suppressionFactor > cfg.stressVisibleThreshold) {
        out.push({
          id: `obs:nonverbal:${observer.id}:${subject.id}:tense:${world.tickIndex}`,
          observerId: observer.id, subjectId: subject.id,
          kind: 'tense', magnitude: stress,
          confidence: clamp01(baseConf * suppressionFactor * obsBonus),
          source: 'nonverbal',
        });
      }

      const anger = clamp01(Number(facts[`emo:anger:${subject.id}`] ?? 0));
      if (anger * suppressionFactor > cfg.angerVisibleThreshold) {
        out.push({
          id: `obs:nonverbal:${observer.id}:${subject.id}:angry:${world.tickIndex}`,
          observerId: observer.id, subjectId: subject.id,
          kind: 'angry', magnitude: anger,
          confidence: clamp01(baseConf * suppressionFactor * obsBonus),
          source: 'nonverbal',
        });
      }

      const fear = clamp01(Number(facts[`emo:fear:${subject.id}`] ?? 0));
      if (fear * suppressionFactor > cfg.fearVisibleThreshold) {
        out.push({
          id: `obs:nonverbal:${observer.id}:${subject.id}:afraid:${world.tickIndex}`,
          observerId: observer.id, subjectId: subject.id,
          kind: 'afraid', magnitude: fear,
          confidence: clamp01(baseConf * suppressionFactor * obsBonus),
          source: 'nonverbal',
        });
      }

      // ── Extended nonverbal channels ──
      // Confidence: high energy + low stress + low fear → confident body language.
      const energy = clamp01(Number(subject.energy ?? 0.5));
      const health = clamp01(Number(subject.health ?? 1));
      const confidenceSignal = clamp01(energy * 0.4 + (1 - stress) * 0.3 + health * 0.3);
      if (confidenceSignal > 0.7 && suppressionFactor > 0.3) {
        out.push({
          id: `obs:nonverbal:${observer.id}:${subject.id}:confident:${world.tickIndex}`,
          observerId: observer.id, subjectId: subject.id,
          kind: 'confident', magnitude: confidenceSignal,
          confidence: clamp01(baseConf * 0.7 * obsBonus),
          source: 'nonverbal',
        });
      }

      // Exhausted: low energy clearly visible.
      if (energy < 0.25) {
        out.push({
          id: `obs:nonverbal:${observer.id}:${subject.id}:exhausted:${world.tickIndex}`,
          observerId: observer.id, subjectId: subject.id,
          kind: 'exhausted', magnitude: 1 - energy,
          confidence: clamp01(baseConf * 0.8 * obsBonus),
          source: 'nonverbal',
        });
      }

      // Hurt: low health visible.
      if (health < 0.5) {
        out.push({
          id: `obs:nonverbal:${observer.id}:${subject.id}:hurt:${world.tickIndex}`,
          observerId: observer.id, subjectId: subject.id,
          kind: 'hurt', magnitude: 1 - health,
          confidence: clamp01(baseConf * 0.85 * obsBonus),
          source: 'nonverbal',
        });
      }
    }
  }
  return out;
}
