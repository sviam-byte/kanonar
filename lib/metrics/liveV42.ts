import type { EntityParams, ToMV2DashboardMetrics, V42Metrics } from '../../types';
import { calculateV42Metrics, normalizeParamsForV42 } from '../character-metrics-v4.2';
import { clamp01 } from '../util/math';

/**
 * Recomputes V4.2 metrics with the live SDE viability Pv instead of the
 * static Pv_norm=0 filler in calculateAllCharacterMetrics
 * (METRIC-INVENTORY-0: RAP `connect real source`). `pv` is on the SDE
 * 0..100 scale; V4.2 expects the normalized 0..1 input.
 */
export function recomputeV42WithLivePv(args: {
    eventAdjustedFlatParams: EntityParams;
    latents: Record<string, number>;
    tomV2Metrics?: ToMV2DashboardMetrics | null;
    pv: number;
}): V42Metrics {
    const pvNorm = clamp01(Number(args.pv ?? 0) / 100);
    return calculateV42Metrics(
        normalizeParamsForV42(args.eventAdjustedFlatParams),
        args.latents,
        pvNorm,
        args.tomV2Metrics ?? undefined,
    );
}
