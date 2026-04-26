// lib/context/v2/namespaces.ts

export const CANONICAL_NAMESPACES = [
  'world',
  'scene',
  'map',
  'norm',
  'obs',
  'soc',
  'self',
  'profile',
  'ctx',
  'aff',
  'con',
  'off',
  'cap',
  'access',
  'cost',
  'tom',
  'emo',
  'app',
  'mind',
  'drv',
  'util',
  'goal',
  'action',
  'belief',
  'threat',
  'rel',
  'event',
  'speech',
  'lens',
  'trace',
  'misc',
  'feat',
] as const;

export type AtomNamespace = typeof CANONICAL_NAMESPACES[number];

export const LEGACY_NAMESPACE_ALIASES = {
  act: 'action',
  affect: 'emo',
  loc: 'world',
  ener: 'util',
  memory: 'belief',
  sum: 'misc',
  social: 'soc',
  sim: 'misc',
} as const satisfies Record<string, AtomNamespace>;

export type LegacyNamespace = keyof typeof LEGACY_NAMESPACE_ALIASES;

const CANONICAL_NAMESPACE_SET = new Set<string>(CANONICAL_NAMESPACES);

export function inferNamespaceFromId(id: string): string {
  const prefix = String(id ?? '').split(':')[0]?.trim();
  return prefix || 'misc';
}

export function isCanonicalNamespace(ns: string | undefined | null): ns is AtomNamespace {
  return CANONICAL_NAMESPACE_SET.has(String(ns ?? ''));
}

export function canonicalizeNamespace(ns: string | undefined | null): AtomNamespace | undefined {
  const raw = String(ns ?? '').trim();
  if (!raw) return undefined;
  if (isCanonicalNamespace(raw)) return raw;
  return LEGACY_NAMESPACE_ALIASES[raw as LegacyNamespace];
}
