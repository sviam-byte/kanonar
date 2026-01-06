// lib/simkit/core/export.ts
// Helpers for deterministic session export.

import type { SimExport } from './types';

const nowIso = () => new Date().toISOString();

export function buildExport(args: { scenarioId: string; seed: number; records: any[] }): SimExport {
  return {
    schema: 'SimKitExportV1',
    createdAt: nowIso(),
    seed: args.seed,
    scenarioId: args.scenarioId,
    records: args.records,
  };
}
