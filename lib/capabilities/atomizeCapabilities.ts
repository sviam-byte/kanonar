
import { CapabilityProfile } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

export function atomizeCapabilities(selfId: string, prof: CapabilityProfile): ContextAtom[] {
  const out: ContextAtom[] = [];
  const caps = prof?.caps || ({} as any);

  for (const k of Object.keys(caps)) {
    const mag = caps[k as keyof typeof caps];
    out.push(normalizeAtom({
      id: `cap:${k}:${selfId}`,
      kind: 'capability' as any,
      ns: 'cap' as any,
      origin: 'world',
      source: 'capabilities',
      magnitude: mag,
      confidence: 1,
      subject: selfId,
      tags: ['cap', k],
      label: `${k}=${Math.round((mag ?? 0) * 100)}%`,
      trace: { usedAtomIds: [], notes: ['from capability profile'], parts: {} }
    } as any));
  }
  return out;
}
