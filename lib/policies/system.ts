
import { WorldState, Policy } from '../../types';
import { clamp01 } from '../util/math';

export function applyPolicyEffects(world: WorldState, policy: Policy) {
    const eff = policy.effects;

    // Note: WorldState might need a 'config' object in the future for global params.
    // For now, we apply effects where we can or simulate them via metadata.
    
    if (eff.maxPrMonstro != null) {
         // Iterate agents and apply hard cap logic simulation
         // In a real ECS this would set a global rule. Here we patch agents.
         world.agents.forEach(a => {
             if (!a.identity.hard_caps) a.identity.hard_caps = [];
             // Check if cap exists
             const capId = `policy_cap_${policy.id}`;
             if (!a.identity.hard_caps.some((c:any) => c.key === capId)) {
                 a.identity.hard_caps.push({ key: capId, description: `Policy ${policy.name}: PrMonstro cap`, limit: eff.maxPrMonstro });
             }
         });
    }

    if (eff.resourceBias) {
        // Adjust global resource availability or cost
        // Placeholder: Mutate scenario metrics if applicable
    }

    // Additional effects can be implemented here
}

export function activatePolicy(world: WorldState, policyId: string) {
    if (!world.activePolicies) world.activePolicies = [];
    if (world.activePolicies.includes(policyId)) return;

    const policy = world.policies?.find(p => p.id === policyId);
    if (!policy) return;

    world.activePolicies.push(policyId);
    applyPolicyEffects(world, policy);
    
    // Apply initial legitimacy shock
    if (policy.legitimacyImpact) {
        const delta = policy.legitimacyImpact.delta;
        if (policy.legitimacyImpact.target === 'global' && world.scene) {
             world.scene.metrics.legitimacy = clamp01((world.scene.metrics.legitimacy ?? 0.7) + delta);
        }
        // Faction logic would go here
    }
}
