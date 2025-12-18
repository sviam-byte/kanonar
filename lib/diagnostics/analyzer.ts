// lib/diagnostics/analyzer.ts
import { CharacterEntity } from '../../types';
import { CharacterDiagnosticTimeseries, CharacterDiagnosticSummary } from './types';
import { getNestedValue } from '../param-utils';

export function summarizeCharacterDiagnostic(
  ts: CharacterDiagnosticTimeseries,
  baseChar: CharacterEntity,
  finalChar: CharacterEntity
): CharacterDiagnosticSummary {
  const n = ts.tick.length;
  if (n === 0) {
      return { timeToBreakdown: null, timeInDark: 0, maxShadowProb: 0, traumaEvents: 0, axesShift: {}, trustFinal: {}, conflictFinal: {} };
  }
  
  const breakdownIndex = ts.S.findIndex((s, i) => s < 30 || ts.mode[i] !== "normal");
  const timeToBreakdown = breakdownIndex === -1 ? null : ts.tick[breakdownIndex];

  const timeInDark = ts.mode.filter(m => m === "dark").length;
  const maxShadowProb = Math.max(0, ...ts.shadowProb);

  const keyAxes = [
    "A_Safety_Care", "A_Legitimacy_Procedure", "A_Causality_Sanctity",
    "G_Self_concept_strength", "G_Identity_rigidity", "G_Narrative_agency",
  ];
  const axesShift: Record<string, number> = {};
  for (const axisId of keyAxes) {
    const baseVal = getNestedValue(baseChar.vector_base, axisId) ?? 0.5;
    const finalVal = getNestedValue(finalChar.vector_base, axisId) ?? baseVal;
    axesShift[axisId] = finalVal - baseVal;
  }

  const trustFinal: Record<string, number> = {};
  const conflictFinal: Record<string, number> = {};
  for (const [otherId, arr] of Object.entries(ts.trustTo)) {
    trustFinal[otherId] = arr[n - 1];
  }
  for (const [otherId, arr] of Object.entries(ts.conflictTo)) {
    conflictFinal[otherId] = arr[n - 1];
  }

  const traumaEvents = (finalChar.historicalEvents?.length ?? 0) - (baseChar.historicalEvents?.length ?? 0);

  return {
    timeToBreakdown,
    timeInDark,
    maxShadowProb,
    traumaEvents,
    axesShift,
    trustFinal,
    conflictFinal,
  };
}

export function computeGroupSummary(world: any, characterIds: string[]): any {
    // Placeholder for group-level summary metrics like leadership changes.
    return {};
}
