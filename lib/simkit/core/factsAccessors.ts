// lib/simkit/core/factsAccessors.ts
// Typed accessors for SimWorldFacts.
// Eliminates (world.facts as any)[key] pattern.

import type { SimWorld } from './types';

// ── Per-agent context axes ──────────────────────────────────────────

type CtxAxis = 'danger' | 'privacy' | 'temperature' | 'comfort' | 'hygiene'
  | 'crowdDensity' | 'noiseLevel' | 'visibility' | 'controlLevel'
  | 'authorityPresence' | 'aesthetics';

export function getCtx(world: SimWorld, axis: CtxAxis, agentId: string): number {
  return Number((world.facts as Record<string, unknown>)[`ctx:${axis}:${agentId}`] ?? 0);
}

export function setCtx(world: SimWorld, axis: CtxAxis, agentId: string, value: number): void {
  (world.facts as Record<string, unknown>)[`ctx:${axis}:${agentId}`] = value;
}

// ── Final (post-pipeline) context axes ──────────────────────────────

export function getFinalCtx(world: SimWorld, axis: string, agentId: string): number {
  return Number((world.facts as Record<string, unknown>)[`ctx:final:${axis}:${agentId}`] ?? 0);
}

export function setFinalCtx(world: SimWorld, axis: string, agentId: string, value: number): void {
  (world.facts as Record<string, unknown>)[`ctx:final:${axis}:${agentId}`] = value;
}

// ── Scenario-level facts ────────────────────────────────────────────

export function getScenarioFact<T = unknown>(world: SimWorld, key: string): T | undefined {
  return (world.facts as Record<string, unknown>)[`scenario:${key}`] as T | undefined;
}

export function setScenarioFact(world: SimWorld, key: string, value: unknown): void {
  (world.facts as Record<string, unknown>)[`scenario:${key}`] = value;
}

// ── Environment facts ───────────────────────────────────────────────

export function getEnvFact(world: SimWorld, key: string): number {
  return Number((world.facts as Record<string, unknown>)[`env:${key}`] ?? 0);
}

export function setEnvFact(world: SimWorld, key: string, value: number): void {
  (world.facts as Record<string, unknown>)[`env:${key}`] = value;
}

// ── Generic typed access ────────────────────────────────────────────

export function getFact<T = unknown>(world: SimWorld, key: string): T | undefined {
  return (world.facts as Record<string, unknown>)[key] as T | undefined;
}

export function setFact(world: SimWorld, key: string, value: unknown): void {
  (world.facts as Record<string, unknown>)[key] = value;
}
