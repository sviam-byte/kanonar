// lib/context/v2/validateAtomContract.ts

import type { ContextAtom } from './types';
import {
  LEGACY_NAMESPACE_ALIASES,
  canonicalizeNamespace,
  inferNamespaceFromId,
  isCanonicalNamespace,
} from './namespaces';

export type AtomContractWarningCode =
  | 'missing_id'
  | 'missing_ns'
  | 'non_finite_magnitude'
  | 'non_finite_confidence'
  | 'unknown_namespace'
  | 'legacy_namespace_alias'
  | 'namespace_mismatch';

export type AtomContractWarningSeverity = 'error' | 'warn';

export interface AtomContractWarning {
  code: AtomContractWarningCode;
  severity: AtomContractWarningSeverity;
  message: string;
  atomId?: string;
  ns?: string;
  expectedNs?: string;
}

const PREFIX_EXCEPTIONS: Record<string, string[]> = {
  manual: ['misc'],
  prox: ['soc'],
  haz: ['threat', 'map'],
  phys: ['threat', 'tom'],
  social: ['soc'],
};

function finiteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function mismatchAllowed(prefix: string, ns: string): boolean {
  const allowed = PREFIX_EXCEPTIONS[prefix] || [];
  return allowed.includes(ns);
}

export function validateAtomContract(atom: Partial<ContextAtom>): AtomContractWarning[] {
  const warnings: AtomContractWarning[] = [];
  const id = typeof atom.id === 'string' ? atom.id : '';
  const ns = typeof atom.ns === 'string' ? atom.ns : '';

  if (!id) {
    warnings.push({
      code: 'missing_id',
      severity: 'error',
      message: 'Atom is missing a stable id.',
      ns,
    });
  }

  if (!ns) {
    warnings.push({
      code: 'missing_ns',
      severity: 'error',
      message: `Atom ${id || '<missing-id>'} is missing ns.`,
      atomId: id || undefined,
    });
  } else if (!isCanonicalNamespace(ns)) {
    const canonical = canonicalizeNamespace(ns);
    if (canonical) {
      warnings.push({
        code: 'legacy_namespace_alias',
        severity: 'warn',
        message: `Atom ${id || '<missing-id>'} uses legacy namespace ${ns}; prefer ${canonical}.`,
        atomId: id || undefined,
        ns,
        expectedNs: canonical,
      });
    } else {
      warnings.push({
        code: 'unknown_namespace',
        severity: 'error',
        message: `Atom ${id || '<missing-id>'} uses unknown namespace ${ns}.`,
        atomId: id || undefined,
        ns,
      });
    }
  }

  if (!finiteNumber(atom.magnitude)) {
    warnings.push({
      code: 'non_finite_magnitude',
      severity: 'error',
      message: `Atom ${id || '<missing-id>'} has non-finite magnitude.`,
      atomId: id || undefined,
      ns,
    });
  }

  if (!finiteNumber(atom.confidence)) {
    warnings.push({
      code: 'non_finite_confidence',
      severity: 'error',
      message: `Atom ${id || '<missing-id>'} has non-finite confidence.`,
      atomId: id || undefined,
      ns,
    });
  }

  if (id && ns) {
    const prefix = inferNamespaceFromId(id);
    const expectedNs = canonicalizeNamespace(prefix) || prefix;
    const actualNs = canonicalizeNamespace(ns) || ns;
    const prefixIsLegacy = Object.prototype.hasOwnProperty.call(LEGACY_NAMESPACE_ALIASES, prefix);
    if (!prefixIsLegacy && expectedNs !== actualNs && !mismatchAllowed(prefix, actualNs)) {
      warnings.push({
        code: 'namespace_mismatch',
        severity: 'warn',
        message: `Atom ${id} has ns=${ns}, but id prefix implies ${expectedNs}.`,
        atomId: id,
        ns,
        expectedNs,
      });
    }
  }

  return warnings;
}

export function validateAtomContracts(atoms: Array<Partial<ContextAtom>>): AtomContractWarning[] {
  return atoms.flatMap((atom) => validateAtomContract(atom));
}
