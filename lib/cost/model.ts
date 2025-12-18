
import { ActionCost, ActionId, CostVector } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

function scalarize(v: CostVector, w?: Partial<CostVector>) {
  const ww = {
    time: w?.time ?? 0.20,
    energy: w?.energy ?? 0.30,
    social: w?.social ?? 0.20,
    risk: w?.risk ?? 0.20,
    moral: w?.moral ?? 0.10,
  };
  const s =
    ww.time * v.time +
    ww.energy * v.energy +
    ww.social * v.social +
    ww.risk * v.risk +
    ww.moral * v.moral;
  return clamp01(s);
}

export function computeActionCost(args: {
  actionId: ActionId;
  atoms: ContextAtom[];
  selfId: string;
  targetId?: string;
}): { actionCost: ActionCost; atoms: ContextAtom[] } {
  const { actionId, atoms, selfId, targetId } = args;

  // Read inputs from context atoms (Stage0 + Derived)
  const fatigue = getMag(atoms, 'body:fatigue', getMag(atoms, 'self_fatigue', 0));
  const pain = getMag(atoms, 'body:pain', getMag(atoms, 'self_pain', 0));
  const timePressure = getMag(atoms, 'ctx:timePressure', 0);
  const publicness = getMag(atoms, 'ctx:publicness', 0);
  const surveillance = getMag(atoms, 'norm:surveillance', 0);
  const protocolStrict = getMag(atoms, 'ctx:proceduralStrict', 0);
  const threat = getMag(atoms, 'threat:final', 0);

  // Base costs
  let v: CostVector = { time: 0.2, energy: 0.2, social: 0.1, risk: 0.1, moral: 0.05 };
  
  const explain: any = { fatigue, pain, timePressure, publicness, surveillance, protocolStrict, threat };

  switch (actionId) {
    case 'move':
      v = { 
          time: 0.35 + 0.30 * timePressure, 
          energy: 0.25 + 0.35 * fatigue, 
          social: 0.05, 
          risk: 0.15 + 0.30 * threat, 
          moral: 0.02 
      };
      break;
    case 'hide':
      v = { 
          time: 0.20, 
          energy: 0.10 + 0.25 * fatigue, 
          social: 0.05, 
          risk: 0.05 + 0.15 * threat, 
          moral: 0.03 
      };
      break;
    case 'escape':
      v = { 
          time: 0.45 + 0.35 * timePressure, 
          energy: 0.35 + 0.35 * fatigue, 
          social: 0.15, 
          risk: 0.25 + 0.35 * threat, 
          moral: 0.05 
      };
      break;
    case 'talk':
      v = { 
          time: 0.25, 
          energy: 0.10 + 0.15 * fatigue, 
          social: 0.25 + 0.45 * publicness + 0.25 * surveillance, 
          risk: 0.10 + 0.20 * threat, 
          moral: 0.03 
      };
      break;
    case 'attack':
      v = { 
          time: 0.25, 
          energy: 0.55 + 0.25 * fatigue, 
          social: 0.35 + 0.35 * publicness, 
          risk: 0.65 + 0.25 * threat, 
          moral: 0.35 + 0.35 * protocolStrict 
      };
      break;
    case 'help':
      v = { 
          time: 0.30, 
          energy: 0.25 + 0.20 * fatigue, 
          social: 0.10 + 0.15 * publicness, 
          risk: 0.15 + 0.20 * threat, 
          moral: 0.02 
      };
      break;
    case 'share_secret':
      v = { 
          time: 0.25, 
          energy: 0.10, 
          social: 0.55 + 0.25 * publicness + 0.25 * surveillance, 
          risk: 0.20 + 0.20 * threat, 
          moral: 0.05 + 0.20 * protocolStrict 
      };
      break;
    case 'obey':
      v = { time: 0.15, energy: 0.10, social: 0.10, risk: 0.10, moral: 0.05 };
      break;
    case 'disobey':
      v = { 
          time: 0.20, 
          energy: 0.10, 
          social: 0.55 + 0.25 * publicness + 0.35 * surveillance, 
          risk: 0.25 + 0.20 * threat, 
          moral: 0.25 + 0.35 * protocolStrict 
      };
      break;
  }

  const total = scalarize(v);
  const id = `cost:${actionId}:${selfId}:${targetId || 'none'}`;
  
  const costAtom = normalizeAtom({
    id,
    kind: 'action_cost' as any,
    ns: 'cost' as any,
    origin: 'derived',
    source: 'cost',
    magnitude: total,
    confidence: 1,
    subject: selfId,
    target: targetId,
    tags: ['cost', actionId],
    label: `cost ${actionId}=${Math.round(total * 100)}%`,
    trace: {
      usedAtomIds: ['body:fatigue', 'self_fatigue', 'body:pain', 'self_pain', 'ctx:timePressure', 'ctx:publicness', 'norm:surveillance', 'ctx:proceduralStrict', 'threat:final']
        .filter(x => atoms.some(a => a.id === x)),
      notes: ['computed by CostModel'],
      parts: { ...v, total, ...explain }
    },
    meta: { vector: v }
  } as any);

  const actionCost: ActionCost = { actionId, targetId, cost: v, total, explain };
  return { actionCost, atoms: [costAtom] };
}
