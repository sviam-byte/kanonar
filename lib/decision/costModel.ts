
import { ContextAtom } from '../context/v2/types';
import { Possibility } from '../possibilities/catalog';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function get(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const m = (a as any)?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function findPrefix(atoms: ContextAtom[], prefix: string) {
  return atoms.filter(a => a.id.startsWith(prefix));
}

// Convert feature atoms to effective scalars
export function computeActionCost(args: {
  selfId: string;
  atoms: ContextAtom[];
  p: Possibility;
}): { cost: number; parts: any; usedAtomIds: string[] } {
  const { selfId, atoms, p } = args;

  const fatigue = get(atoms, `feat:char:${selfId}:body.fatigue`, 0);
  const pain = get(atoms, `feat:char:${selfId}:body.pain`, 0);
  const stress = get(atoms, `feat:char:${selfId}:body.stress`, 0);
  
  // threat.final (if you have stable id), else approximate via channel atoms:
  const threatFinalAtom = findPrefix(atoms, `threat:final:${selfId}`)[0]?.id || findPrefix(atoms, `threat:final:`)[0]?.id || findPrefix(atoms, `threat:final`)[0]?.id;
  const threatFinal = threatFinalAtom ? get(atoms, threatFinalAtom, 0) : 0;

  const proceduralStrict = findPrefix(atoms, `ctx:proceduralStrict:${selfId}`)[0]?.id
    || findPrefix(atoms, `norm:proceduralStrict:${selfId}`)[0]?.id;
  const protocol = proceduralStrict ? get(atoms, proceduralStrict, 0) : 0;

  // base effort by type
  let base = 0.2;
  if (p.id.startsWith('aff:hide')) base = 0.15;
  if (p.id.startsWith('exit:escape')) base = 0.35;
  if (p.id.startsWith('aff:talk')) base = 0.10;
  if (p.id.startsWith('aff:attack')) base = 0.50;

  // legality / norm risk: attack under strict protocol is expensive (social penalty)
  const normPenalty = (p.id.startsWith('aff:attack') ? 0.6 * protocol : 0);

  // bodily effort multiplier
  const bodily = clamp01(0.5 * fatigue + 0.3 * pain + 0.2 * stress);

  // pressure discount: under high threat, escape/hide become "cheap" relative
  const threatDiscount = 
    (p.id.startsWith('exit:escape') || p.id.startsWith('aff:hide')) ? (0.25 * threatFinal) : 0;

  const cost = clamp01(base + 0.5 * bodily + normPenalty - threatDiscount);

  const usedAtomIds = [
    `feat:char:${selfId}:body.fatigue`,
    `feat:char:${selfId}:body.pain`,
    `feat:char:${selfId}:body.stress`,
    ...(threatFinalAtom ? [threatFinalAtom] : []),
    ...(proceduralStrict ? [proceduralStrict] : [])
  ];

  return { 
    cost, 
    parts: { base, bodily, normPenalty, threatDiscount, threatFinal, protocol },
    usedAtomIds
  };
}
