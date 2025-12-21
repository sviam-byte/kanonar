
import { WorldState, AgentState, LocationEntity, ScenarioContextState } from '../../types';
import { ContextAtom, ContextSnapshot, ContextAtomKind, ContextSummary, TemporalContextConfig } from './types';
import { computeDomainsFromAtoms } from './domains';
// Fix import - Event might conflict with DOM Event if not careful, but here we just use it as type in options
import { Event } from '../../events/types'; 

export interface ContextBuildOptions {
  focusLocationId?: string;
  recentEventsWindow?: number;
  manualAtoms?: ContextAtom[];
  activeEvents?: Event[];
  overrideLocation?: LocationEntity | string;
  temporalConfig?: TemporalContextConfig;
  gridMap?: any;
  scenarioContext?: ScenarioContextState;
  overrideEvents?: Event[];
}

// Simple atom builder for manual atoms or basic defaults
function buildBasicAtoms(agent: AgentState, options: ContextBuildOptions): ContextAtom[] {
    const atoms: ContextAtom[] = [];
    if (options.manualAtoms) {
        atoms.push(...options.manualAtoms);
    }
    return atoms;
}

/**
 * Derives the legacy ContextSummary from the computed Domains + Atoms.
 * This ensures the Goal Engine (Domains) and Affect Engine (Summary) share reality.
 */
function computeSummaryFromDomains(domains: Record<string, number>, atoms: ContextAtom[]): ContextSummary {
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const maxByPrefix = (prefix: string, fb = 0) => {
      let m = -1;
      for (const a of atoms) {
        const id = String((a as any)?.id ?? '');
        if (!id.startsWith(prefix)) continue;
        const v = (a as any)?.magnitude;
        if (typeof v === 'number' && Number.isFinite(v)) m = Math.max(m, clamp01(v));
      }
      return m >= 0 ? m : fb;
    };
    const firstByPrefix = (prefix: string, fb = 0) => {
      for (const a of atoms) {
        const id = String((a as any)?.id ?? '');
        if (!id.startsWith(prefix)) continue;
        const v = (a as any)?.magnitude;
        if (typeof v === 'number' && Number.isFinite(v)) return clamp01(v);
      }
      return fb;
    };

    return {
        // Core mappings from Domains
        physicalRisk: domains.danger ?? 0,
        intimacy: domains.intimacy ?? 0,
        authorityPresence: domains.hierarchy ?? 0,
        normPressure: domains.obligation ?? 0,
        socialSupport: domains['care/help'] > 0 ? domains['care/help'] : (domains.attachment ?? 0),
        
        // Specific pass-throughs for things that don't map cleanly to the main 6 domains
        resourceAvailability: 1 - (domains.scarcity ?? 0),
        socialVisibility: firstByPrefix('ctx:publicness:', 0.5),
        timePressure: domains.timePressure ?? firstByPrefix('ctx:timePressure:', 0),
        
        proximityAllies: maxByPrefix('prox:friend:', 0),
        proximityEnemies: maxByPrefix('prox:enemy:', 0),
        crowding: firstByPrefix('ctx:crowd:', 0),

        primaryTargetProximity: maxByPrefix('target_presence', 0),
        
        // Legacy/Derived
        threatLevel: domains.danger ?? 0,
        supportAvailable: domains.attachment ?? 0,
        
        // Placeholder beliefs
        beliefLeaderSupport: 0, 
        beliefGroupStability: 0, 
        beliefHostilityAround: domains.danger ?? 0, 
        beliefVulnerabilityAround: 0
    };
}

export function buildContextSnapshot(
  world: WorldState,
  agent: AgentState,
  options: ContextBuildOptions = {}
): ContextSnapshot {
  
  // 1. Gather Atoms (Manual + injected)
  // Note: Most atom generation happens before this in `buildGoalLabContext` or `atomizeFrame`
  const atoms = buildBasicAtoms(agent, options);
  
  // 2. Compute Domains (The Logic Core)
  const domains = computeDomainsFromAtoms(atoms);

  // 3. Compute Summary (Derived from Domains + Atoms)
  const summary = computeSummaryFromDomains(domains, atoms);

  return {
    agentId: agent.entityId,
    locationId: (agent as any).locationId,
    atoms,
    summary,
    domains,
    aggregates: {
        threatLevel: summary.threatLevel,
        socialSupport: summary.socialSupport,
        primaryTargetProximity: summary.primaryTargetProximity,
        crowding: summary.crowding
    },
    meta: {
      manualAtomIds: options.manualAtoms?.map(a => a.id)
    }
  };
}
