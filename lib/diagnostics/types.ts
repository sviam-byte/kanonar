// lib/diagnostics/types.ts
import { WorldState, CharacterEntity } from '../../types';

export type StabilityMode = "normal" | "burnout" | "dark" | "apophenia";

export interface DiagnosticScenarioContext {
  world: WorldState;
  characterIds: string[];
}

export interface DiagnosticScenario {
  id: string;
  label: string;
  description: string;
  setup(ctx: DiagnosticScenarioContext): void;
  ticks: number;
  focusPairs?: Array<{ observerId: string; targetId: string }>;
  stopCondition?: (ctx: DiagnosticScenarioContext) => boolean;
  finalize?: (ctx: DiagnosticScenarioContext) => void;
}

export interface CharacterDiagnosticTimeseries {
  tick: number[];
  S: number[];
  mode: StabilityMode[];
  stress: number[];
  shadowProb: number[];
  EW: number[];
  prMonstro: number[];
  trustTo: Record<string, number[]>; // keyed by targetId
  conflictTo: Record<string, number[]>;
}

export interface CharacterDiagnosticSummary {
  timeToBreakdown: number | null;
  timeInDark: number;
  maxShadowProb: number;
  traumaEvents: number;
  axesShift: Record<string, number>;
  trustFinal: Record<string, number>;
  conflictFinal: Record<string, number>;
}

export interface DiagnosticReport {
  scenarioId: string;
  characters: string[];
  timeseries: Record<string, CharacterDiagnosticTimeseries>;
  summary: Record<string, CharacterDiagnosticSummary>;
  groupSummary?: {
    leaderChanges?: number;
    factionSplits?: number;
  };
}
