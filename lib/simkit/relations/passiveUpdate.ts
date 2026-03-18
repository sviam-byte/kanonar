// lib/simkit/relations/passiveUpdate.ts
// Passive relation dynamics: proximity-based trust/familiarity drift,
// expectation violation, and indirect evidence.

import type { SimWorld, SimAction } from '../core/types';
import { clamp01 } from '../../util/math';
import { FCS } from '../../config/formulaConfigSim';
import { readRelation, writeRelation } from './canonicalWrite';

type RelEntry = { trust: number; threat: number; familiarity?: number };

function isCooperative(kind: string): boolean {
  const coop = new Set([
    'help', 'treat', 'comfort', 'guard', 'escort', 'share_resource',
    'praise', 'apologize', 'negotiate', 'talk',
  ]);
  return coop.has(kind);
}

function isHostile(kind: string): boolean {
  const hostile = new Set(['attack', 'threaten', 'confront', 'accuse', 'betray', 'deceive']);
  return hostile.has(kind);
}

export function passiveRelationUpdate(world: SimWorld, actionsApplied: SimAction[]): void {
  const cfg = FCS.relationDynamics.passiveProximity;
  const facts: any = world.facts || {};
  const charIds = Object.keys(world.characters || {}).sort();

  const byLoc: Record<string, string[]> = {};
  for (const id of charIds) {
    const loc = String((world.characters[id] as any)?.locId ?? '');
    if (!loc) continue;
    (byLoc[loc] ||= []).push(id);
  }

  const actionKind: Record<string, string> = {};
  for (const a of actionsApplied) {
    actionKind[a.actorId] = a.kind;
  }

  for (const agents of Object.values(byLoc)) {
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];

        const entryAB = readRelation(world, a, b) as RelEntry;
        const entryBA = readRelation(world, b, a) as RelEntry;

        const aCoops = isCooperative(actionKind[a] ?? '');
        const bCoops = isCooperative(actionKind[b] ?? '');
        if (aCoops && bCoops) {
          entryAB.trust = clamp01(entryAB.trust + cfg.coopBonus);
          entryBA.trust = clamp01(entryBA.trust + cfg.coopBonus);
        }

        const aHostile = isHostile(actionKind[a] ?? '');
        const bHostile = isHostile(actionKind[b] ?? '');
        if (!aHostile && !bHostile) {
          entryAB.familiarity = clamp01((entryAB.familiarity ?? 0) + cfg.familiarityBonus);
          entryBA.familiarity = clamp01((entryBA.familiarity ?? 0) + cfg.familiarityBonus);
        }

        writeRelation(world, a, b, entryAB);
        writeRelation(world, b, a, entryBA);
      }
    }
  }

  for (let i = 0; i < charIds.length; i++) {
    for (let j = i + 1; j < charIds.length; j++) {
      const a = charIds[i];
      const b = charIds[j];
      const aLoc = String((world.characters[a] as any)?.locId ?? '');
      const bLoc = String((world.characters[b] as any)?.locId ?? '');
      if (aLoc === bLoc) continue;

      const entryAB = readRelation(world, a, b) as RelEntry;
      const entryBA = readRelation(world, b, a) as RelEntry;
      entryAB.familiarity = clamp01((entryAB.familiarity ?? 0) - cfg.separationDecay);
      entryBA.familiarity = clamp01((entryBA.familiarity ?? 0) - cfg.separationDecay);
      writeRelation(world, a, b, entryAB);
      writeRelation(world, b, a, entryBA);
    }
  }
}

export function indirectEvidenceUpdate(world: SimWorld, actionsApplied: SimAction[]): void {
  const cfg = FCS.relationDynamics.indirectEvidence;
  const facts: any = world.facts || {};
  const charIds = Object.keys(world.characters || {}).sort();

  for (const action of actionsApplied) {
    if (!action.targetId) continue;
    const bId = action.actorId;
    const cId = action.targetId;
    const bLoc = String((world.characters[bId] as any)?.locId ?? '');

    const observers = charIds.filter(id =>
      id !== bId && id !== cId &&
      String((world.characters[id] as any)?.locId ?? '') === bLoc
    );

    const hostile = isHostile(action.kind);
    const coop = isCooperative(action.kind);
    if (!hostile && !coop) continue;

    const baseDelta = hostile ? -0.08 : 0.04;

    for (const aId of observers) {
      const trustAC = (readRelation(world, aId, cId) as RelEntry).trust;
      const alignmentSign = trustAC > 0.5 ? 1 : trustAC < 0.4 ? -1 : 0;
      if (alignmentSign === 0) continue;

      const delta = baseDelta * alignmentSign * cfg.alignmentWeight;

      const entryAB = readRelation(world, aId, bId) as RelEntry;
      entryAB.trust = clamp01(entryAB.trust + delta * cfg.confidenceDiscount);
      writeRelation(world, aId, bId, entryAB);
    }
  }
}
