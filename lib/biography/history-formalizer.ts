
import { PersonalEvent, SocialEventEntity, EntityType, Branch, DomainEvent, LocationId } from '../../types';

export type { DomainEvent }; // removed FormalizedEvent from here, it is exported below

export interface FormalizedEvent {
  bioId: string;
  domain: DomainEvent;
  social: SocialEventEntity[]; 
  observations: {
      observerId: string;
      updates: string[];
  }[];
}

// --- MAPPING LOGIC ---

const TICKS_PER_YEAR = 365 * 24; 

function getTickFromYearsAgo(years: number): number {
    return -Math.round(years * TICKS_PER_YEAR); 
}

export function formalizeEvent(bio: PersonalEvent): FormalizedEvent | null {
    // Robust default checks
    const actorId = 'character-krystar-mann'; 
    const tags = bio.tags || []; 
    const domain = bio.domain || 'unknown';
    
    // Helper to determine action ID
    let actionId = 'unknown_action';
    let scenarioKind = 'routine';
    let isPublic = false;
    
    // 1. Map Bio Kind -> Domain Action
    switch (domain) {
        case 'goal_embrace': 
        case 'purpose_gain':
            actionId = 'adopt_role'; 
            scenarioKind = 'domestic'; 
            break;
        case 'training': 
            actionId = 'train'; 
            scenarioKind = 'routine'; 
            isPublic = true; 
            break;
        case 'first_kill_protect': 
            actionId = 'combat_kill_defend'; 
            scenarioKind = 'combat'; 
            isPublic = true; 
            break;
        case 'withdrawal_moral_trauma': 
            actionId = 'withdraw_from_service'; 
            scenarioKind = 'routine'; 
            break;
        case 'return_punishment': 
            actionId = 'submit_to_punishment'; 
            scenarioKind = 'council'; 
            isPublic = true; 
            break; 
        case 'accept_new_role': 
            actionId = 'accept_mandate'; 
            scenarioKind = 'council'; 
            isPublic = true; 
            break;
        case 'exile_from_chambers': 
            actionId = 'expel_from_private_space'; 
            scenarioKind = 'domestic'; 
            break;
        case 'injury': 
            if (tags.includes('protecting_target')) actionId = 'take_hit_defend';
            else actionId = 'take_hit';
            scenarioKind = 'combat'; 
            break;
        case 'oath_take': 
            actionId = 'swear_oath'; 
            scenarioKind = 'council'; 
            isPublic = true; 
            break;
        case 'defense_joint': 
        case 'combat': 
             if (tags.includes('joint')) actionId = 'hold_line_joint';
             else actionId = 'fight';
             scenarioKind = 'combat'; 
             isPublic = true; 
             break;
        case 'breakthrough_joint': 
        case 'crisis':
             if (tags.includes('joint')) actionId = 'breakthrough_joint';
             else actionId = 'survive_crisis';
             scenarioKind = 'combat'; 
             isPublic = true;
             break;
        default:
            if (tags.includes('devotion') || tags.includes('role')) {
                actionId = 'adopt_role';
                scenarioKind = 'domestic';
            } else if (tags.includes('trauma')) {
                actionId = 'suffer_trauma';
                scenarioKind = 'crisis';
            }
            break;
    }

    // 2. Construct Domain Event
    const participants = bio.participants || [];
    
    // Try to find a logical target. If payload has targetId, use it. Else use first participant.
    const rawTargetId = (bio.payload as any)?.targetId || (bio.payload as any)?.otherId;
    const targetId = rawTargetId || (participants.length > 0 ? participants[0] : undefined);
    
    const witnesses = isPublic ? ['order_knights', ...participants] : [...participants];
    
    const domainEvt: DomainEvent = {
        id: `de_${bio.id}`,
        t: getTickFromYearsAgo(bio.years_ago || 0), // Use t instead of tick
        locationId: bio.locationId, // Map locationId
        actorId: (bio as any).actorId || actorId, 
        targetId: (bio as any).targetId || targetId,
        actionId,
        intensity: bio.intensity ?? 1.0, // Default intensity if undefined
        polarity: bio.valence,
        domain: bio.domain || 'personal', // Provide domain
        ctx: { scenarioKind, public: isPublic },
        meta: {
            // Move flags to meta as per type definition
            flags: {
                beneficiaries: tags.includes('protective') ? participants : [],
                witnesses,
                coActors: tags.includes('joint') ? participants : [],
                intentional: bio.controllability > 0.3
            }
        }
    };

    // 3. Construct Social Events (Compiler)
    const socialEvents: SocialEventEntity[] = [];
    const observations: { observerId: string, updates: string[] }[] = [];

    // Generic adder that pushes to list
    const addSocialToTarget = (kind: string, target: string, eventTags: string[], deltas: any[], normative: any[] = []) => {
        if (!kind || !target) return;
        // Ensure domain is uppercase/lowercase consistent
        const kindSafe = String(kind).toLowerCase(); 
        
        socialEvents.push({
            entityId: `soc_${bio.id}_${kindSafe}_${target}`,
            type: EntityType.SocialEvent,
            title: `${kindSafe.toUpperCase()}: ${domainEvt.actionId} -> ${target}`,
            t: Date.now(), // Mock time
            locationId: bio.locationId, // Map locationId
            domain: kindSafe,
            actorId: domainEvt.actorId,
            targetId: target,
            witnessIds: (domainEvt.meta?.flags?.witnesses as string[]) || [],
            polarity: bio.valence,
            intensity: bio.intensity ?? 0.5,
            scope: isPublic ? 'public' : 'private',
            veracity: 1.0,
            tags: eventTags,
            versionTags: [Branch.Current],
            // Extra metadata for UI
            // @ts-ignore
            normative,
            deltas
        });
    };
    
    // Helper for single target
    const addSocial = (kind: string, eventTags: string[], deltas: any[], normative: any[] = []) => {
        if (targetId) addSocialToTarget(kind, targetId, eventTags, deltas, normative);
    }
    
    // Helper for MULTI-target (The "Super Event" feature)
    // Generates a social atom for EVERY participant
    const addSocialMulti = (kind: string, eventTags: string[], deltasFn: (t: string) => any[], normative: any[] = []) => {
        participants.forEach(p => {
            if (p && p !== domainEvt.actorId) {
                addSocialToTarget(kind, p, eventTags, deltasFn(p), normative);
            }
        });
        // If targetId is defined but not in participants list, add it too
        if (targetId && !participants.includes(targetId) && targetId !== domainEvt.actorId) {
            addSocialToTarget(kind, targetId, eventTags, deltasFn(targetId), normative);
        }
    }

    // --- RULE ENGINE ---
    
    if (actionId === 'swear_oath' || tags.includes('oath')) {
        addSocial('promise', ['formal', 'binding', 'loyalty'], 
            [{ ledger: 'promise', amount: 1.0, to: targetId }],
            [{ norm: 'oath_binding', expected: 'do' }]
        );
        addSocial('status_up', ['honoring'], [{ ledger: 'status', amount: 0.5 }]);
    }
    
    if (actionId === 'adopt_role' || domain === 'goal_embrace') {
        // "Sword and Shield" -> Mandate granted by Tegan AND Promise given to Tegan
        addSocialMulti('mandate_granted', ['voluntary', 'internal'], 
             (t) => [{ ledger: 'affiliation', amount: 0.8, to: t }, { ledger: 'purpose', amount: 1.0 }]
        );
        
        // Implicit promise of devotion
        addSocialMulti('promise', ['implicit', 'devotion'], 
            (t) => [{ ledger: 'promise', amount: 0.8, to: t }]
        );
    }

    if (actionId === 'take_hit_defend' || tags.includes('protective')) {
        addSocialMulti('rescue', ['protective', 'high_stakes'], 
             (t) => [{ ledger: 'debt', amount: 1.0, from: t }, { ledger: 'bond', amount: 0.5 }]
        );
    }
    
    if (actionId === 'hold_line_joint' || actionId === 'breakthrough_joint' || tags.includes('joint')) {
        addSocialMulti('joint_action', ['ally', 'cohesion'], 
             (t) => [{ ledger: 'affiliation', amount: 0.4, to: t }, { ledger: 'trust', amount: 0.3 }]
        );
    }
    
    if (actionId === 'withdraw_from_service') {
        addSocialMulti('distancing', ['withdrawal'], 
             (t) => [{ ledger: 'affiliation', amount: -0.5, to: t }, { ledger: 'status', amount: -0.4 }]
        );
    }
    
    if (actionId === 'expel_from_private_space') {
        addSocial('distancing', ['humiliating', 'rejection'], 
            [{ ledger: 'status', amount: -0.5 }, { ledger: 'mandate', amount: -1.0 }]
        );
    }
    
    if (actionId === 'submit_to_punishment') {
        addSocial('order_obeyed', ['submission', 'punishment'], 
            [{ ledger: 'status', amount: -0.5 }, { ledger: 'penance', amount: 1.0 }]
        );
    }
    
    if (domain === 'betrayal' || tags.includes('betrayal')) {
         addSocialMulti('betrayal', ['harm', 'trust_break'],
            (t) => [{ ledger: 'trust', amount: -1.0, to: t }]
         );
    }

    // 4. Construct Observations (ToM Updates)
    const relevantObservers = new Set([...witnesses, targetId, ...participants].filter(Boolean));
    
    relevantObservers.forEach(obsId => {
        const updates: string[] = [];
        
        if (socialEvents.some(s => s.domain === 'promise')) updates.push("Reliability +++", "Trust ++");
        if (socialEvents.some(s => s.domain === 'rescue')) updates.push("Trust +++", "Debt Created", "Bond +++");
        if (socialEvents.some(s => s.domain === 'joint_action')) updates.push("Bond ++", "Align ++");
        if (socialEvents.some(s => s.domain === 'distancing')) updates.push("Trust --", "Conflict +");
        if (socialEvents.some(s => s.domain === 'betrayal')) updates.push("Trust ---", "Conflict ++");
        if (socialEvents.some(s => s.domain === 'mandate_granted')) updates.push("Power ++", "Role Established");
        
        if (updates.length > 0) {
            observations.push({ observerId: obsId!, updates: Array.from(new Set(updates)) });
        }
    });

    return {
        bioId: bio.id,
        domain: domainEvt,
        social: socialEvents,
        observations
    };
}
