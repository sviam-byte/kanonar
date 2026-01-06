// lib/relations/manager.ts
import { extractRelations } from './extract';
import { finalizeRelations } from './finalize';
import { RelationshipGraph } from './types';
import type { WorldState } from '../../types';

/**
 * Build a canonical relationship graph for the current world snapshot.
 * This aggregates per-agent "slow memory" (bio/oaths/roles/manual) into one graph.
 */
export function buildRelationshipGraph(snapshot: WorldState): RelationshipGraph {
  // 1) Extract raw "memory" relations from bios / events / hints.
  const memory = extractRelations(snapshot);

  // 2) Normalize + merge into a single graph.
  const graph = finalizeRelations(memory);

  return graph;
}
