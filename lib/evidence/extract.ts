
import { DomainEvent } from '../../types';

export interface EvidencePiece {
    key: string;
    val: number;
    subjectId: string; // Who performed the act
    targetId?: string; // Who it was directed at
    tick: number;
}

export function extractEvidenceFromEvents(args: { 
    events: DomainEvent[], 
    defaultConfidence?: number 
}): EvidencePiece[] {
    const { events } = args;
    const evidence: EvidencePiece[] = [];

    for (const ev of events) {
        const intensity = ev.intensity ?? 0.5;
        const tags = ev.tags || [];

        // Simple mapping from tags/domain to evidence keys
        if (tags.includes('care') || tags.includes('help')) {
            evidence.push({ key: 'care', val: intensity, subjectId: ev.actorId, targetId: ev.targetId, tick: ev.t });
        }
        if (tags.includes('harm') || tags.includes('attack') || tags.includes('aggression')) {
            evidence.push({ key: 'aggression', val: intensity, subjectId: ev.actorId, targetId: ev.targetId, tick: ev.t });
        }
        if (tags.includes('oath') || tags.includes('promise')) {
            // Did they keep it? Usually event signifies action.
            // 'kept_oath' vs 'broke_oath'
            if (tags.includes('kept') || ev.domain === 'oath_kept') {
                evidence.push({ key: 'oath_kept', val: intensity, subjectId: ev.actorId, targetId: ev.targetId, tick: ev.t });
            } else if (tags.includes('broke') || ev.domain === 'oath_broken') {
                 evidence.push({ key: 'oath_kept', val: -intensity, subjectId: ev.actorId, targetId: ev.targetId, tick: ev.t });
            }
        }
        
        // Competence signal
        if (tags.includes('success')) {
            evidence.push({ key: 'competence', val: intensity, subjectId: ev.actorId, tick: ev.t });
        }
        if (tags.includes('failure')) {
            evidence.push({ key: 'competence', val: -intensity, subjectId: ev.actorId, tick: ev.t });
        }
    }

    return evidence;
}
