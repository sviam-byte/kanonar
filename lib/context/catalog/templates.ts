
// lib/context/catalog/templates.ts
import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';

export type AtomTemplateId =
  | 'ctx_axis'
  | 'threat_value'
  | 'tom_dyad'
  | 'rel_label'
  | 'manual_generic';

export type AtomTemplate = {
  id: AtomTemplateId;
  title: string;
  description: string;
  build: (args: Record<string, any>) => ContextAtom;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'number';
    placeholder?: string;
    defaultValue?: any;
  }>;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export const ATOM_TEMPLATES: AtomTemplate[] = [
  {
    id: 'ctx_axis',
    title: 'Context Axis (ctx:*)',
    description: 'Creates a derived ctx axis atom (e.g., ctx:danger, ctx:crowd).',
    fields: [
      { key: 'axisId', label: 'axis id (e.g. danger, crowd)', type: 'text', defaultValue: 'danger' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 },
      { key: 'label', label: 'label', type: 'text', defaultValue: 'Manual ctx axis' }
    ],
    build: (a) => normalizeAtom({
      id: `ctx:${String(a.axisId || 'danger')}`,
      kind: 'ctx_axis',
      magnitude: clamp01(Number(a.magnitude)),
      label: String(a.label || ''),
      source: 'manual',
      tags: ['ctx', 'override'],
      confidence: 1,
      ns: 'ctx',
      origin: 'override',
      trace: { usedAtomIds: [], notes: ['created via template: ctx_axis'] }
    } as any)
  },

  {
    id: 'threat_value',
    title: 'Threat Value (threat:*)',
    description: 'Creates threat atoms (e.g., threat:final or threat:ch:env).',
    fields: [
      { key: 'threatId', label: 'id tail (e.g. final, ch:env)', type: 'text', defaultValue: 'final' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 },
      { key: 'label', label: 'label', type: 'text', defaultValue: 'Manual threat' }
    ],
    build: (a) => normalizeAtom({
      id: `threat:${String(a.threatId || 'final')}`,
      kind: 'threat_value',
      magnitude: clamp01(Number(a.magnitude)),
      label: String(a.label || ''),
      source: 'manual',
      tags: ['threat', 'override'],
      confidence: 1,
      ns: 'threat',
      origin: 'override',
      trace: { usedAtomIds: [], notes: ['created via template: threat_value'] }
    } as any)
  },

  {
    id: 'tom_dyad',
    title: 'ToM dyad (tom:dyad:...)',
    description: 'Creates dyad ToM atoms: trust/threat/intimacy etc.',
    fields: [
      { key: 'me', label: 'me id', type: 'text', defaultValue: 'me' },
      { key: 'other', label: 'other id', type: 'text', defaultValue: 'other' },
      { key: 'metric', label: 'metric (trust/threat/intimacy)', type: 'text', defaultValue: 'trust' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 }
    ],
    build: (a) => normalizeAtom({
      id: `tom:dyad:${String(a.me)}:${String(a.other)}:${String(a.metric || 'trust')}`,
      kind: 'tom_dyad_metric',
      magnitude: clamp01(Number(a.magnitude)),
      label: `ToM ${String(a.metric)} (${String(a.other)})`,
      source: 'manual',
      tags: ['tom', 'override', 'dyad'],
      confidence: 1,
      ns: 'tom',
      origin: 'override',
      subject: String(a.me),
      target: String(a.other),
      meta: { metric: a.metric },
      trace: { usedAtomIds: [], notes: ['created via template: tom_dyad'] }
    } as any)
  },

  {
    id: 'rel_label',
    title: 'Relationship label (rel:label:...)',
    description: 'Creates coarse relationship label atom (friend/lover/enemy) as ToM-visible prior.',
    fields: [
      { key: 'me', label: 'me id', type: 'text', defaultValue: 'me' },
      { key: 'other', label: 'other id', type: 'text', defaultValue: 'other' },
      { key: 'label', label: 'label (friend/lover/enemy/ally/rival/neutral)', type: 'text', defaultValue: 'friend' },
      { key: 'strength', label: 'strength 0..1', type: 'number', defaultValue: 0.7 }
    ],
    build: (a) => normalizeAtom({
      id: `rel:label:${String(a.me)}:${String(a.other)}`,
      kind: 'relationship_label',
      magnitude: clamp01(Number(a.strength)),
      label: `Relationship: ${String(a.label)}`,
      source: 'manual',
      tags: ['rel', 'tom', 'override', String(a.label)],
      confidence: 1,
      ns: 'tom',
      origin: 'override',
      subject: String(a.me),
      target: String(a.other),
      meta: { label: a.label },
      trace: { usedAtomIds: [], notes: ['created via template: rel_label'] }
    } as any)
  },

  {
    id: 'manual_generic',
    title: 'Manual generic atom (manual:...)',
    description: 'Fallback atom with arbitrary id/kind.',
    fields: [
      { key: 'id', label: 'id (start with manual:)', type: 'text', defaultValue: 'manual:custom' },
      { key: 'kind', label: 'kind', type: 'text', defaultValue: 'manual' },
      { key: 'magnitude', label: 'magnitude 0..1', type: 'number', defaultValue: 0.5 },
      { key: 'label', label: 'label', type: 'text', defaultValue: 'Custom atom' }
    ],
    build: (a) => normalizeAtom({
      id: String(a.id || 'manual:custom'),
      kind: String(a.kind || 'manual'),
      magnitude: clamp01(Number(a.magnitude)),
      label: String(a.label || ''),
      source: 'manual',
      tags: ['override'],
      confidence: 1,
      ns: 'misc',
      origin: 'override',
      trace: { usedAtomIds: [], notes: ['created via template: manual_generic'] }
    } as any)
  }
];
