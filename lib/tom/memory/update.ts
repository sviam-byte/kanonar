
import { AgentState } from '../../../types';
import { EvidencePiece } from '../../evidence/extract';
import { getTomView, patchTomView } from '../api';

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export function applyEvidenceToTomBase(args: {
    agent: AgentState,
    evidence: EvidencePiece[],
    tuning?: any
}): void {
    const { agent, evidence } = args;
    
    // We update the agent's view of *themselves* (self-perception) 
    // AND we update how *others* view the agent (reputation/priors), 
    // but typically this function runs 'per agent' in the loop.
    // If 'agent' is the subject of evidence, we are updating how OTHERS see AGENT.
    // If 'agent' is the observer, we update how AGENT sees OTHERS.
    
    // The tick loop calls this: "evidence for self" -> apply to ToM Base.
    // Usually, ToM Base is "What I know about others".
    // But evidence is "What happened".
    // Let's assume this updates the ToM of ALL relevant observers regarding the subject of evidence.
    // BUT we only have access to 'agent' state here if passed singly.
    
    // CORRECTION: The instruction says "eventsNow -> extract evidence -> update tom_base".
    // And "if evForSelf.length -> applyEvidenceToTomBase({ agent, evidence... })".
    // This implies updating the agent's internal model based on what they did?
    // Or updating the world's ToM table for that agent?
    // The `world.tom` is a global store.
    
    // Let's assume we are updating the global TOM state in the world, but we need the world object.
    // Since we don't have world here, we might need to rely on the agent object if it carries its own ToM.
    // However, the standard is `world.tom`. 
    // Let's assume the `agent` passed here is the *Observer* updating their beliefs about *Targets* in the evidence.
    
    // Wait, `evForSelf` in `tick.ts` implies events where `actorId == agentId`.
    // So the agent DID something.
    // This should update how *others* see the agent.
    // But we are inside a loop iterating agents. 
    // If we want to update how others see `agent`, we need access to others.
    
    // ALTERNATIVE INTERPRETATION:
    // The agent observes events (where they might be actor or target or witness) and updates THEIR beliefs.
    
    // Let's implement: Agent observes evidence -> Updates their ToM of the Evidence Actor.
    
    // We will iterate evidence. For each piece:
    // If agent is NOT the subject, agent updates belief about subject.
    // If agent IS the subject, agent updates self-concept?
    
    for (const ev of evidence) {
        if (ev.subjectId === agent.entityId) {
             // Self-reflection or reinforcement?
             continue; 
        }
        
        // Agent observes Subject
        // Use generic patchTomView logic if we had World, but here we might work on agent.tom directly if structure allows
        // Assuming we are patching `agent.tom` structure which mirrors `world.tom[agentId]`
        
        const targetId = ev.subjectId;
        // Check if agent has a view of target
        // We'll operate on `agent.tom` if it exists as a local cache/ref
        const tomMap = (agent as any).tom; // tom[targetId] -> TomEntry
        
        if (tomMap && typeof tomMap === 'object') {
             // Legacy or V3 structure check
             // V3: tom = { relations: [], ... }
             // Legacy/Engine: tom = { [targetId]: entry }
             
             // If we are in `tick.ts`, `agent` is likely from `world.agents`.
             // `world.tom` is separate usually.
             // If we can't access world.tom, we can't update global state.
             
             // NOTE: `tick.ts` passes `agent` and `evidence`. 
             // If we cannot update global state, we might be limited.
             // However, `tick.ts` usually has `world`. 
             
             // Let's assume `agent.tom` IS the reference to `world.tom[agentId]`.
             // In `initTomForCharacters`, `tom[i.entityId]` is assigned.
             // In `finalizeAgents`, `a.tom` might be just a view or the actual object.
             
             // Let's try to update `tom[targetId]` if it exists on agent.
             const entry = tomMap[targetId];
             if (entry && entry.traits) {
                 const t = entry.traits;
                 const w = 0.1 * Math.abs(ev.val); // Learning rate
                 
                 if (ev.key === 'care') {
                     t.trust = clamp01(t.trust + w * (ev.val > 0 ? 1 : -1));
                     t.bond = clamp01(t.bond + w * 0.5);
                 }
                 if (ev.key === 'aggression') {
                     t.trust = clamp01(t.trust - w * 1.5);
                     t.conflict = clamp01((t.conflict || 0) + w);
                 }
                 if (ev.key === 'oath_kept') {
                     t.reliability = clamp01(t.reliability + w * (ev.val > 0 ? 1 : -1));
                     t.trust = clamp01(t.trust + w * 0.5);
                 }
                 if (ev.key === 'competence') {
                     t.competence = clamp01(t.competence + w * (ev.val > 0 ? 1 : -1));
                 }
                 
                 entry.lastUpdatedTick = ev.tick;
             }
        }
    }
}
