
// lib/tom/init.ts
import { CharacterEntity, TomState, TomEntry, WorldState } from "../../types";
import { clamp01 } from "../util/safe";
import { GOAL_DEFS } from "../goals/space";
import { computeDyadMetrics_A_about_B, DyadConfigForA } from './dyad-metrics';
import { DYAD_CONFIGS, DYAD_OVERRIDES } from '../../data/tom-dyad-configs';

// Using CharacterEntity as the spec for a character
type CharacterSpec = CharacterEntity;

export function initTomForCharacters(
  chars: CharacterSpec[], 
  world: WorldState, 
  runtimeConfigs?: Record<string, DyadConfigForA>
): TomState {
  const tom: TomState = {};
  for (const i of chars) {
    tom[i.entityId] = {};
    
    const dyadCfg = (runtimeConfigs && runtimeConfigs[i.entityId]) || DYAD_CONFIGS[i.entityId];
    const overrides = DYAD_OVERRIDES[i.entityId] || [];

    for (const j of chars) {
      if (i.entityId === j.entityId) continue;

      // Safely access loyalty
      const loyalty = i.state?.loyalty ?? 50;
      let baseTrust = 0.5 + 0.2 * ((loyalty / 100 - 0.5) || 0);
      
      let baseAlign = 0.5;
      let baseBond = 0.1;
      let baseConflict = 0.1;
      let baseRespect = 0.5; 
      
      // Use safe access or default 0
      const clearance = j.identity.clearance_level || 0;
      let baseDominance = clearance / 5;
      let baseFear = 0.1; // Initialize fear

      // --- BIO-HISTORY INJECTION (Social Formalization) ---
      // Check i's history for events involving j (Target or Participant)
      if (i.historicalEvents) {
          for(const ev of i.historicalEvents) {
              const involvesJ = ev.participants?.includes(j.entityId) || (ev.payload as any)?.targetId === j.entityId || (ev.payload as any)?.otherId === j.entityId;
              
              if (involvesJ) {
                  const w = ev.intensity || 0.5;
                  let specificImpactApplied = false;
                  
                  // 1. Positive Bonding (Rescue, Heroism, Support)
                  if (ev.tags?.includes('rescue') || ev.tags?.includes('heroism') || ev.tags?.includes('support_interpersonal')) {
                      baseTrust += 0.3 * w;
                      baseBond += 0.4 * w;
                      specificImpactApplied = true;
                  }

                  // 2. Combat Brotherhood (Battle, Combat)
                  // Shared combat creates strong bonds and trust
                  if (ev.tags?.includes('combat') || ev.tags?.includes('battle') || ev.domain === 'combat') {
                      baseTrust += 0.25 * w;
                      baseBond += 0.35 * w;
                      baseRespect += 0.2 * w;
                      specificImpactApplied = true;
                  }

                  // 3. Shared Trauma
                  if (ev.tags?.includes('shared_trauma') || ev.tags?.includes('group_trauma')) {
                      baseBond += 0.5 * w;
                      baseAlign += 0.2 * w;
                      specificImpactApplied = true;
                  }

                  // 4. Formal / Oath
                  if (ev.domain === 'oath_take') {
                      baseTrust += 0.4 * w;
                      baseAlign += 0.3 * w;
                      baseBond += 0.2 * w;
                      specificImpactApplied = true;
                  }

                  // 5. Negative (Betrayal, Harm)
                  if (ev.tags?.includes('betrayal') || ev.domain === 'betrayal') {
                      baseTrust -= 0.6 * w;
                      baseConflict += 0.5 * w;
                      baseBond -= 0.3 * w;
                      specificImpactApplied = true;
                  }
                  if (ev.tags?.includes('harm') || ev.tags?.includes('abuse_physical')) {
                      baseTrust -= 0.5 * w;
                      baseConflict += 0.4 * w;
                      baseFear += 0.3 * w; // Implicit fear variable
                      specificImpactApplied = true;
                  }

                  // 6. GENERIC FALLBACK (Social Contact)
                  // If an event involves J but hits no specific tags above, it still creates a bond via familiarity/history
                  if (!specificImpactApplied) {
                      baseBond += 0.1 * w; // Mere exposure effect
                      if (ev.valence > 0) {
                          baseTrust += 0.1 * w;
                      } else {
                          // Negative shared event (e.g. scarcity) usually bonds victims unless blamed
                          // Assuming shared hardship
                          baseBond += 0.05 * w;
                      }
                  }
              }
          }
      }
      
      // Apply Dyad Config overrides (Personality-based perception)
      if (dyadCfg) {
          const override = overrides.find(o => o.targetId === j.entityId);
          const dyad = computeDyadMetrics_A_about_B(i, j, dyadCfg, override);
          
          // Blend calculated metrics with history biases
          // History has 50% weight impact on final baseline
          baseTrust = clamp01(0.5 * baseTrust + 0.5 * dyad.trust);
          baseBond = clamp01(0.5 * baseBond + 0.5 * (0.5 * (dyad.closeness + (dyad.liking + 1) / 2)));
          baseRespect = clamp01(0.5 * baseRespect + 0.5 * dyad.respect);
          baseAlign = clamp01(0.5 * baseAlign + 0.5 * (0.5 * dyad.respect + 0.25 * (dyad.liking + 1)));
          baseConflict = clamp01(0.5 * baseConflict + 0.5 * (dyad.fear + Math.max(0, -dyad.liking) * 0.5));
          baseDominance = clamp01(0.5 * baseDominance + 0.5 * (0.5 * (dyad.dominance + 1)));
          baseFear = clamp01(0.5 * baseFear + 0.5 * dyad.fear);
      } else {
          // Fallback Logic for characters without DyadConfig
          const historyEvent = i.context?.social_history?.find(e => e.target_id === j.entityId);
          if (historyEvent) {
              if (historyEvent.event === 'RIVALRY') {
                  baseConflict = 0.6;
                  baseTrust = 0.3;
              }
          }
          
          if (i.context?.faction && j.context?.faction && i.context.faction !== j.context.faction) {
              const iFaction = world.factions?.find(f => f.id === i.context!.faction);
              const hostility = iFaction?.hostility?.[j.context!.faction] ?? 0; 
              if (hostility > 0) { 
                  baseTrust -= 0.3 * hostility;
                  baseAlign -= 0.4 * hostility;
                  baseConflict += 0.4 * hostility;
              }
          }
      }

      // Safe access to competence_core with null check
      const compCore = j.competencies?.competence_core || 50;
      const baseCompetence = compCore / 100;
      const baseReliability = 0.5;
      const discipline = i.vector_base?.B_cooldown_discipline ?? 0.5;
      const baseObedience = 0.5 - 0.3 * (clearance/5) + 0.3 * discipline;

      const goalIds = Object.keys(GOAL_DEFS);
      const weights = new Array(goalIds.length).fill(1 / goalIds.length);

      tom[i.entityId][j.entityId] = {
        goals: { goalIds, weights },
        traits: {
          trust: clamp01(baseTrust),
          align: clamp01(baseAlign),
          bond: clamp01(baseBond),
          competence: clamp01(baseCompetence),
          dominance: clamp01(baseDominance),
          respect: clamp01(baseRespect),
          fear: clamp01(baseFear),
          reliability: clamp01(baseReliability),
          obedience: clamp01(baseObedience),
          vulnerability: 0.5,
          conflict: clamp01(baseConflict),
          uncertainty: 1.0,
        },
        uncertainty: 1.0,
        lastUpdatedTick: 0,
        lastInteractionTick: 0,
        lastActionPolarity: 0,
        // arch_true_est undefined initially
        arch_stereotype: undefined,
      };
    }
  }
  return tom;
}
