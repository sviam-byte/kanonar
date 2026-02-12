import type { Artifact, PipelineTrace, StageTrace } from './types';

/**
 * Adapter: wraps the current (V1) pipeline report into a stable UI trace.
 *
 * This file intentionally avoids new inference logic. It only normalizes the
 * report envelope so UI components can render stage/inspector views without
 * depending on internal V1 shapes.
 */
export function buildPipelineTraceFromV1(opts: {
  selfId: string;
  tick: number;
  report: unknown;
}): PipelineTrace {
  const { selfId, tick, report } = opts;

  // Best-effort extraction of stage list from a legacy report.
  const stagesIn: any[] = Array.isArray((report as any)?.stages) ? (report as any).stages : [];

  const stages: StageTrace[] = stagesIn.map((s: any, idx: number) => {
    const stageId = String(s?.stage ?? s?.id ?? s?.stageId ?? `S${idx}`);
    const stageTitle = String(s?.title ?? s?.name ?? stageId);

    const artifactsIn: any[] = Array.isArray(s?.artifacts)
      ? s.artifacts
      : Array.isArray(s?.outputs)
        ? s.outputs
        : [];

    const artifacts: Artifact[] = artifactsIn.map((a: any, j: number) => {
      const inferredKind = String(a?.kind ?? a?.type ?? 'raw') as Artifact['kind'];
      const title = String(a?.title ?? a?.name ?? `${stageTitle} / ${inferredKind} #${j}`);
      const payload = a?.payload ?? a?.data ?? a;
      const provenance = Array.isArray(a?.provenance)
        ? a.provenance.map((p: any) => String(p))
        : [];

      return {
        id: String(a?.id ?? `${stageId}:${inferredKind}:${j}`),
        kind: inferredKind,
        title,
        payload,
        provenance,
      };
    });

    return {
      id: stageId,
      title: stageTitle,
      index: idx,
      artifacts,
      meta: { selfId, tick },
    };
  });

  return {
    version: 'v2-adapter',
    selfId,
    tick,
    stages,
    raw: report,
  };
}

/**
 * Backward-friendly alias kept for the previous naming used by callers.
 */
export function runPipelineV2(opts: {
  selfId: string;
  tick: number;
  report: unknown;
}): PipelineTrace {
  return buildPipelineTraceFromV1(opts);
}
