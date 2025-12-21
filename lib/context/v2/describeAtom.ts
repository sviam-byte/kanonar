// lib/context/v2/describeAtom.ts
import type { ContextAtom } from './types';
import { resolveAtomSpec } from '../catalog/atomSpecs';

export type AtomDescription = {
  id: string;
  title: string;
  meaning: string;
  scale?: {
    min: number; max: number;
    unit?: string;
    lowMeans: string;
    highMeans: string;
    typical?: string;
  };
  formula?: string;
  producedBy?: string[];
  consumedBy?: string[];
  trace?: any;
  ns?: string;
  kind?: string;
  origin?: string;
  source?: string;
};

export function describeAtom(atom: ContextAtom): AtomDescription {
  const resolved = resolveAtomSpec(atom.id);
  const title = resolved ? resolved.spec.title(resolved.params) : (atom.label || atom.id);
  const meaning = resolved ? resolved.spec.meaning(resolved.params) : 'Нет спецификации для этого атома (нужен AtomSpec).';
  const formula = resolved?.spec.formula ? resolved.spec.formula(resolved.params) : undefined;

  return {
    id: atom.id,
    title,
    meaning,
    scale: resolved?.spec.scale,
    formula,
    producedBy: resolved?.spec.producedBy,
    consumedBy: resolved?.spec.consumedBy,
    trace: (atom as any).trace,
    ns: (atom as any).ns,
    kind: (atom as any).kind,
    origin: (atom as any).origin,
    source: (atom as any).source,
  };
}
