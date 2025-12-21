
import { ContextAtom } from '../context/v2/types';
import { Possibility } from '../possibilities/catalog';
import { computeActionCost } from './costModel';
import { gatePossibility } from './gating';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function get(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

export type ScoredAction = {
  id: string;
  label: string;
  score: number;
  allowed: boolean;
  cost: number;
  why: { usedAtomIds: string[]; parts: any; blockedBy?: string[] };
  p: Possibility;
};

// MVP: score = availability*(1-cost) + context preference
export function scorePossibility(args: {
  selfId: string;
  atoms: ContextAtom[];
  p: Possibility;
}): ScoredAction {
  const { selfId, atoms, p } = args;

  const gate = gatePossibility({ atoms, p });
  const { cost, parts, usedAtomIds } = computeActionCost({ selfId, atoms, p });

  // Basic preference: if threat high, prefer escape/hide
  const threatFinal = get(atoms, `threat:final:${selfId}`, get(atoms, 'threat:final', 0));
  
  let pref = 0;
  if (p.id.startsWith('exit:escape')) pref += 0.35 * threatFinal;
  if (p.id.startsWith('aff:hide')) pref += 0.25 * threatFinal;
  if (p.id.startsWith('aff:talk')) pref += -0.10 * threatFinal;

  // Protocol: if strict, prefer talk over attack
  const protocol = get(atoms, `ctx:proceduralStrict:${selfId}`, get(atoms, `norm:proceduralStrict:${selfId}`, 0));
  if (p.id.startsWith('aff:talk')) pref += 0.15 * protocol;
  if (p.id.startsWith('aff:attack')) pref += -0.40 * protocol;

  const availability = clamp01(p.magnitude);
  const raw = clamp01(availability * (1 - cost) + pref);
  
  const allowedScore = gate.allowed ? raw : 0;

  return {
    id: `act:${p.id}`,
    label: p.label,
    score: allowedScore,
    allowed: gate.allowed,
    cost,
    why: {
      usedAtomIds: [...(p.trace?.usedAtomIds || []), ...usedAtomIds],
      parts: { availability, pref, costParts: parts },
      blockedBy: gate.blockedBy
    },
    p
  };
}
