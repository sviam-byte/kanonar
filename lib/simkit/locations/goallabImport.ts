// lib/simkit/locations/goallabImport.ts
import type { SimLocation } from '../core/types';

export type GoalLabLocationV1 = {
  schema: 'GoalLabLocationV1';
  id: string;
  title?: string;
  // граф зон/узлов для перемещения
  nodes: Array<{ id: string; x: number; y: number; tags?: string[] }>;
  edges: Array<{ a: string; b: string; w?: number; tags?: string[] }>;
  // геометрия/картинка (если есть)
  map?: { image?: string; width?: number; height?: number; origin?: { x: number; y: number } };
  // фичи/ресурсы/опасности (минимально)
  features?: Array<{ id: string; kind: string; nodeId?: string; tags?: string[]; strength?: number }>;
  hazards?: Record<string, number>;
};

export function importLocationFromGoalLab(spec: GoalLabLocationV1): SimLocation {
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  return {
    id: spec.id,
    name: spec.title ?? spec.id,
    title: spec.title ?? spec.id,
    neighbors: [],
    map: spec.map ?? null,
    nav: { nodes, edges },
    features: spec.features ?? [],
    hazards: spec.hazards ?? {},
  };
}
