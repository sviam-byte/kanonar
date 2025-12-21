
// lib/context/validate/frameValidator.ts
import { ContextAtom, ValidationSeverity, ValidationIssue, ValidationReport } from '../v2/types';
import { matchAtomSpec, clamp } from '../catalog/atomCatalog';
import { inferAtomNamespace, inferAtomOrigin } from '../v2/infer';
import { getAtomStrictMode } from '../catalog/strictMode';
import { findBeliefDivergences } from './beliefDivergence';

function isNum(x: any): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function getMag(atoms: ContextAtom[], idOrPrefix: string) {
  // exact
  const exact = atoms.find(x => x.id === idOrPrefix);
  if (exact) return isNum(exact.magnitude) ? exact.magnitude : NaN;
  // prefix fallback
  const pref = atoms.find(x => x.id.startsWith(idOrPrefix));
  if (pref) return isNum(pref.magnitude) ? pref.magnitude : NaN;
  return NaN;
}

export function validateAtoms(atoms: ContextAtom[], opts?: { autofix?: boolean }): ValidationReport {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const fixed = opts?.autofix ? atoms.map(a => ({ ...a })) : null;

  function push(severity: ValidationSeverity, id: string, message: string, atomId?: string, details?: any) {
    issues.push({ severity, id, message, atomId, details });
  }

  // 1. Basic & Catalog Checks
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const atomId = a?.id;

    if (!atomId || typeof atomId !== 'string') {
      push('error', 'atom.missing_id', 'Atom has no valid id', undefined, a);
      continue;
    }

    if (seen.has(atomId)) {
      push('warn', 'atom.duplicate_id', `Duplicate atom id: ${atomId}`, atomId);
    }
    seen.add(atomId);
    
    // NaN / Range
    if (!isNum(a.magnitude)) {
        push('error', 'atom.nan', `Atom magnitude is NaN`, atomId);
    } else if (a.magnitude < 0 || a.magnitude > 1) {
        // Allow strict mode or spec to handle, but generally warn
        // Exception: some legacy metrics might be > 1, check catalog
        const match = matchAtomSpec(a);
        const range = match?.spec?.magnitudeRange || [0, 1];
        if (a.magnitude < range[0] || a.magnitude > range[1]) {
             push('warn', 'atom.range', `Magnitude out of [${range[0]},${range[1]}]: ${a.magnitude.toFixed(2)}`, atomId);
             if (fixed) fixed[i].magnitude = clamp(a.magnitude, range[0], range[1]);
        }
    }

    // Spec Check
    const match = matchAtomSpec(a);
    if (!match && getAtomStrictMode() !== 'off') {
         push(getAtomStrictMode() === 'error' ? 'error' : 'warn', 'catalog.unknown', `Unknown atom kind/id pattern`, atomId);
    }
    
    // Ensure NS/Origin
    if (fixed) {
        if (!fixed[i].ns) fixed[i].ns = inferAtomNamespace(fixed[i]);
        if (!fixed[i].origin) fixed[i].origin = inferAtomOrigin(fixed[i].source, fixed[i].id);
    }

    const ns = (a as any).ns;
    const needsTrace = (a as any).origin === 'derived'
      || ['ctx', 'threat', 'tom', 'poss', 'mind', 'soc'].includes(ns as any);
    if (needsTrace) {
      if (!a.trace) {
        push('warn', 'trace.missing', 'Derived atom missing trace metadata', atomId);
      } else {
        if (!Array.isArray((a.trace as any).usedAtomIds) || (a.trace as any).usedAtomIds.length === 0) {
          push('info', 'trace.used.empty', 'derived atom has empty usedAtomIds', atomId);
        }
        if ((a.trace as any).parts === undefined) {
          push('info', 'trace.parts.missing', 'derived atom missing trace.parts', atomId);
        }
      }
    }
  }

  // 2. Logic Consistency Checks
  
  // Escape vs Exits
  const escape = getMag(atoms, 'world:map:escape:');
  const exits = getMag(atoms, 'world:map:exits:');
  if (isNum(escape) && isNum(exits) && exits > 0.2 && escape < 0.05) {
      push('warn', 'logic.escape_mismatch', `High exit availability but low escape context`, 'ctx:escape', { escape, exits });
  }

  // Protocol vs Affordance
  const noViolence = atoms.find(a => a.id === 'con:protocol:noViolence');
  const attackAff = atoms.find(a => a.id.startsWith('aff:attack'));
  if (noViolence && attackAff && attackAff.magnitude > 0) {
      push('warn', 'logic.protocol_conflict', `Attack afforded despite no-violence protocol`, attackAff.id);
  }

  // Surveillance vs Privacy
  const surv = getMag(atoms, 'ctx:surveillance:');
  // Privacy can be ctx:privacy or world:loc:privacy or inferred.
  const priv = getMag(atoms, 'ctx:privacy:') || getMag(atoms, 'world:loc:privacy:');
  if (isNum(surv) && isNum(priv) && surv > 0.7 && priv > 0.7) {
      push('info', 'logic.surv_privacy', `High surveillance and high privacy detected - check logic`, 'norm:surveillance');
  }
  
  // 3. Anchors
  if (!atoms.some(a => a.id.startsWith('world:tick'))) {
      // Don't error, just info, as some tests might not produce it
      push('info', 'missing.anchor', 'No world:tick atom found', 'world:tick');
  }

  // 4. Belief Divergence
  const divs = findBeliefDivergences(atoms, { minDelta: 0.35 });
  for (const d of divs) {
    push('info', 'belief.divergence', `Belief deviates from world: ${d.delta.toFixed(2)}`, d.beliefId, d);
  }

  const counts: any = { error: 0, warn: 0, info: 0 };
  for (const it of issues) counts[it.severity]++;

  return { issues, counts, fixedAtoms: fixed ?? undefined };
}
