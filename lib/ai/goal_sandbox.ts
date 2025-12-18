
/**
 * DEPRECATED: This module is being replaced by lib/context/v2/*
 * Do not use for new features. Use createInitialWorld + buildContextSnapshot instead.
 */

import { CharacterEntity, WorldState, AgentState } from '../../types';

// Re-export types for legacy compatibility if needed
export type ScenarioKind = 'strategic_council' | 'fight_escape' | 'patrol' | 'interrogation' | 'domestic_scene' | 'personal_bondage' | 'other';
export type GoalId = string;
export interface Metrics { [id: string]: number; }
export interface SituationState { scenarioId: string; kind: ScenarioKind; stage: string; metrics: Metrics; timePressure: number; }
export interface CapabilityProfile { availableActions: string[]; constraints: string[]; }
export type RelationToSelf = 'self' | 'leader' | 'ally' | 'subordinate' | 'opponent' | 'neutral';
export interface EnvAgentConfig { id: string; label: string; archetypeId: string; roleId: string; relationToSelf: RelationToSelf; isLeader?: boolean; stress: number; wounded: number; }
export interface EnvSelfConfig { id: string; label: string; archetypeId: string; roleId: string; stress: number; wounded: number; inPersonalScene: boolean; bioEvents: string[]; baseCharacter?: CharacterEntity; }
export interface EnvSandboxConfig { situation: SituationState; self: EnvSelfConfig; others: EnvAgentConfig[]; selfCapabilities: CapabilityProfile; }
export interface SelfGoal { id: GoalId; priority: number; horizon: 'now' | 'short' | 'long'; source: 'scenario' | 'role' | 'trait' | 'order' | 'instinct' | 'bio'; explanation?: string; base: number; dynamic: number; }

export interface SandboxResult {
    agent: AgentState;
    world: WorldState;
    goals: SelfGoal[];
}

// Stub function to prevent runtime crash if called, but warn developer
export function simulateSandboxScenario(cfg: EnvSandboxConfig): SandboxResult {
    console.warn("simulateSandboxScenario is deprecated. Use lib/context/v2/scoring.ts");
    return {
        agent: {} as AgentState,
        world: {} as WorldState,
        goals: []
    };
}
