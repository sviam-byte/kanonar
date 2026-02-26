import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function getMag(atoms: ContextAtom[], id: string, fb = 0): number {
  const a: any = atoms.find(x => x?.id === id);
  const m = Number(a?.magnitude);
  return Number.isFinite(m) ? m : fb;
}

function mk(selfId: string, otherId: string, value: number, usedAtomIds: string[], parts: Record<string, number>): ContextAtom {
  return normalizeAtom({
    id: `phys:threat:${selfId}:${otherId}`,
    ns: 'threat',
    kind: 'physical_threat_dyad',
    origin: 'derived',
    source: 'derived',
    subject: selfId,
    target: otherId,
    magnitude: clamp01(value),
    confidence: 0.8,
    label: `phys.threat:${Math.round(clamp01(value) * 100)}%`,
    trace: {
      usedAtomIds: Array.from(new Set(usedAtomIds.filter(Boolean))),
      notes: ['Derived physical threat from body/combat/weapon/proximity cues'],
      parts,
    },
  } as any);
}

/**
 * Build target-specific physical threat estimates.
 *
 * Inputs are intentionally tolerant: we read several atom-key variants because
 * scenes can provide body/combat/weapon/proximity signals through different producers.
 */
export function derivePhysicalThreatAtoms(args: {
  atoms: ContextAtom[];
  selfId: string;
  otherIds: string[];
}): ContextAtom[] {
  const { atoms, selfId, otherIds } = args;
  const out: ContextAtom[] = [];

  for (const otherId of otherIds) {
    if (!otherId || otherId === selfId) continue;

    const selfBuildId = `feat:body:build:${selfId}`;
    const otherBuildId = `feat:body:build:${otherId}`;
    const selfCombatId = `cap:combat:${selfId}`;
    const otherCombatId = `cap:combat:${otherId}`;
    const selfWeaponId = `cap:weapon:${selfId}`;
    const otherWeaponId = `cap:weapon:${otherId}`;
    const nearId = `obs:nearby:${selfId}:${otherId}`;

    const selfBuild = clamp01(getMag(atoms, selfBuildId, 0.5));
    const otherBuild = clamp01(getMag(atoms, otherBuildId, 0.5));
    const selfCombat = clamp01(getMag(atoms, selfCombatId, 0.5));
    const otherCombat = clamp01(getMag(atoms, otherCombatId, 0.5));
    const selfWeapon = clamp01(getMag(atoms, selfWeaponId, 0.2));
    const otherWeapon = clamp01(getMag(atoms, otherWeaponId, 0.2));
    const proximity = clamp01(getMag(atoms, nearId, 0.3));

    // Positive when the target has advantage over self.
    const buildDiff = clamp01((otherBuild - selfBuild + 1) / 2);
    const combatDiff = clamp01((otherCombat - selfCombat + 1) / 2);
    const weaponDiff = clamp01((otherWeapon - selfWeapon + 1) / 2);

    // Conservative blend: proximity amplifies ability/capability asymmetries.
    const threat = clamp01(
      0.25 * buildDiff +
      0.30 * combatDiff +
      0.25 * weaponDiff +
      0.20 * proximity
    );

    out.push(mk(
      selfId,
      otherId,
      threat,
      [selfBuildId, otherBuildId, selfCombatId, otherCombatId, selfWeaponId, otherWeaponId, nearId],
      { selfBuild, otherBuild, selfCombat, otherCombat, selfWeapon, otherWeapon, proximity, buildDiff, combatDiff, weaponDiff }
    ));
  }

  return out;
}
