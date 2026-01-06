// lib/simulator/types.ts
// Types for a lightweight session simulator that feeds the orchestrator.

import type { OrchestratorTraceV1 } from '../orchestrator/types';

export type SimAction = {
  id: string;                // e.g. "act:move", "act:talk"
  atTick?: number | null;    // schedule; if null -> next tick
  payload?: any;
};

export type SimEvent = {
  id: string;                // stable id
  type: string;              // "hazard", "social", "combat", ...
  payload?: any;
};

export type WorldState = {
  // это “истина мира” между тиками (не atoms!)
  // здесь то, что ты уже хранишь в своих сущностях/локациях/ресурсах
  tickIndex: number;
  seed?: number | null;
  characters: any[];
  locations: any[];
  facts?: Record<string, any>;
  scheduledEvents: SimEvent[];
};

export type GoalLabSnapshotV1Like = {
  id?: string;
  time?: string;
  tickIndex?: number;
  characters?: any[];
  locations?: any[];
  events?: any[];
  atoms?: any[];
  debug?: any;
};

export type SimTickRecord = {
  tickIndex: number;
  snapshot: GoalLabSnapshotV1Like;
  orchestratorTrace?: OrchestratorTraceV1 | null;
  actionsApplied: SimAction[];
  eventsApplied: SimEvent[];
};

export type SimulatorExportV1 = {
  schema: 'GoalLabSessionSimExportV1';
  seed?: number | null;
  createdAt: string;
  ticks: SimTickRecord[];
};
