
// lib/context/catalog/catalogTemplates.ts
import { ATOM_CATALOG } from './atomCatalog';
import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export type CatalogTemplate = {
  key: string; // stable key (e.g. "ctx:*")
  title: string;
  group: string;
  description?: string;
  fields: Array<{ key: string; label: string; type: 'text' | 'number'; placeholder?: string; defaultValue?: any }>;
  build: (args: Record<string, any>) => ContextAtom;
};

export function getCatalogTemplates(): CatalogTemplate[] {
  const out: CatalogTemplate[] = [];

  for (const spec of ATOM_CATALOG) {
    if (!spec.uiTitle || !spec.uiFields || !spec.buildId || !spec.buildKind) continue;

    const key = spec.idPrefix ? `${spec.idPrefix}*` : spec.uiTitle;

    out.push({
      key,
      title: spec.uiTitle,
      group: spec.uiGroup || 'Other',
      description: spec.description,
      fields: spec.uiFields,
      build: (args) => {
        const id = spec.buildId!(args);
        const kind = spec.buildKind!(args);
        const label = spec.buildLabel ? spec.buildLabel(args) : undefined;

        const magnitude = clamp01(Number(args.magnitude ?? spec.defaultMagnitude ?? 0.5));
        const confidence = clamp01(Number(args.confidence ?? spec.defaultConfidence ?? 1));

        // tags: minimum for override UI
        const tags = Array.from(new Set([...(args.tags ? String(args.tags).split(',').map((x: string) => x.trim()).filter(Boolean) : []), 'override']));

        const atom: ContextAtom = normalizeAtom({
          id,
          kind,
          magnitude,
          label,
          source: 'manual',
          confidence,
          tags,
          ns: spec.ns,
          origin: 'override',
          trace: { usedAtomIds: [], notes: [`created via catalog template: ${key}`] }
        } as any);

        return atom;
      }
    });
  }

  // Sort: group then title
  out.sort((a, b) => (a.group + a.title).localeCompare(b.group + b.title));
  return out;
}
