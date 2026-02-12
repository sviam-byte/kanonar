import { describe, expect, it } from 'vitest';

import { buildPipelineTraceFromV1, runPipelineV2 } from '@/lib/goal-lab/pipeline/runPipelineV2';

describe('runPipelineV2 adapter', () => {
  it('normalizes a legacy report into PipelineTrace stages/artifacts', () => {
    const trace = buildPipelineTraceFromV1({
      selfId: 'A',
      tick: 7,
      report: {
        stages: [
          {
            stage: 'S0',
            title: 'Stage Zero',
            artifacts: [
              { kind: 'truth', title: 'World', payload: { weather: 'rain' }, provenance: ['world:scene'] },
            ],
          },
        ],
      },
    });

    expect(trace.version).toBe('v2-adapter');
    expect(trace.selfId).toBe('A');
    expect(trace.tick).toBe(7);
    expect(trace.stages).toHaveLength(1);
    expect(trace.stages[0].id).toBe('S0');
    expect(trace.stages[0].artifacts[0].kind).toBe('truth');
    expect(trace.stages[0].artifacts[0].payload).toEqual({ weather: 'rain' });
  });

  it('keeps backward alias runPipelineV2', () => {
    const trace = runPipelineV2({ selfId: 'A', tick: 1, report: { stages: [] } });
    expect(trace.version).toBe('v2-adapter');
    expect(trace.stages).toEqual([]);
  });
});
