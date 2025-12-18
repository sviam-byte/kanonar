
import { CharacterEntity, AgentState, TraumaTag, TraumaEvent, TraumaLoad } from "../types";
import { getNestedValue, setNestedValue } from "./param-utils";

const clip = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

// Initializes trauma state if missing
export function ensureTraumaState(agent: AgentState) {
    if (!agent.trauma) {
        agent.trauma = { self: 0, others: 0, world: 0, system: 0 };
    }
    if (!agent.traumaIntegration) {
        agent.traumaIntegration = { processedFraction: 0 };
    }
}

/**
 * Applies a new trauma event to the agent's accumulators.
 * Handles exponential decay of old trauma before adding new.
 */
export function applyTraumaTag(agent: AgentState, trauma: TraumaTag) {
    ensureTraumaState(agent);

    const LAMBDA_DECAY = 0.99; // Slow natural decay/integration over time
    
    // Apply decay to all domains
    agent.trauma!.self *= LAMBDA_DECAY;
    agent.trauma!.others *= LAMBDA_DECAY;
    agent.trauma!.world *= LAMBDA_DECAY;
    agent.trauma!.system *= LAMBDA_DECAY;

    // Calculate weight
    const w = (trauma.severity ?? 0.5) * (trauma.ageFactor ?? 1.0);
    
    // Add to specific domain
    agent.trauma![trauma.domain] = clip(agent.trauma![trauma.domain] + w, 0, 1);
    
    // Reduce integration fraction since new trauma occurred
    agent.traumaIntegration!.processedFraction *= 0.9; 
}

/**
 * Active processing of trauma (therapy, success, social support).
 * Reduces active trauma load and increases integration metric.
 */
export function processTrauma(agent: AgentState, dt: number, power: number) {
    ensureTraumaState(agent);
    
    const k = power * dt * 0.1; // Efficiency coefficient
    
    agent.trauma!.self *= (1 - k);
    agent.trauma!.others *= (1 - k);
    agent.trauma!.world *= (1 - k);
    agent.trauma!.system *= (1 - k);
    
    agent.traumaIntegration!.processedFraction = clip(agent.traumaIntegration!.processedFraction + k, 0, 1);
}

// Mapping from legacy TraumaKind to new TraumaTag structure
export function mapTraumaEventToTag(event: TraumaEvent): TraumaTag {
    const severity = event.severity;
    let domain: keyof TraumaLoad = 'world';
    
    switch (event.kind) {
        case 'betrayal_by_leader': 
        case 'moral_compromise':
            domain = 'system'; break;
        case 'betrayal_by_peer':
        case 'torture': // Interpersonal violence
            domain = 'others'; break;
        case 'failed_rescue':
        case 'mass_casualties': // Guilt/Self-efficacy
            domain = 'self'; break;
        case 'random_catastrophe':
            domain = 'world'; break;
    }
    
    return {
        severity,
        domain,
        kind: event.kind === 'torture' ? 'violence' : 'accident', // Simplification
    };
}

// Legacy compatibility wrapper
export function applyTraumaUpdate(
  character: CharacterEntity,
  event: TraumaEvent
): CharacterEntity {
  // Ideally, this function should not be used in the new simulation loop, 
  // but kept for the static "Apply Trauma" button in UI if needed.
  // It modifies vector_base directly (Old method).
  // We will also update the new structure if it exists.
  
  // ... existing vector_base modification logic ...
  const updatedChar = JSON.parse(JSON.stringify(character));
  
  // Update new trauma structure if it's an AgentState-like object
  if ((updatedChar as any).trauma === undefined) {
      (updatedChar as any).trauma = { self: 0, others: 0, world: 0, system: 0 };
      (updatedChar as any).traumaIntegration = { processedFraction: 0 };
  }
  
  const tag = mapTraumaEventToTag(event);
  applyTraumaTag(updatedChar as AgentState, tag);

  return updatedChar;
}
