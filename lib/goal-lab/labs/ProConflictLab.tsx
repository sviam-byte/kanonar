// lib/goal-lab/labs/ProConflictLab.tsx
// ProConflict Lab: deterministic sensitivity probe.
//
// Runs two trajectories with identical seed, one perturbed by epsilon on a chosen
// state field. Shows tension(A) vs tension(B), composite divergence D(t), and
// the Lyapunov-style growth rate lambda. The amplifier is always character:
// same equations, same RNG, but trait/archetype gates inside the pipeline turn epsilon
// into characteristic divergence.

import React, { useMemo, useState } from 'react';
import { runPair, type PerturbationRunPair } from '../../simkit/compare/batchRunner';
import {
  computeDivergenceTrace,
  computeLyapunov,
  firstDivergenceTickFromTrace,
  type DivergenceTrace,
} from '../../simkit/compare/divergenceMetrics';
import {
  attributeAmplifiers,
  type AmplifierEvent,
  type AmplifierGate,
} from '../../simkit/compare/amplifierAttribution';
import {
  describePerturbation,
  type PerturbationTarget,
  type PerturbationVector,
} from '../../simkit/compare/perturbationVector';
import { EntityType } from '../../../types';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../../../data';

type TargetKind = PerturbationTarget['kind'];

const TARGET_KINDS: TargetKind[] = ['body', 'tom', 'fact', 'trait'];
const BODY_FIELDS = ['stress', 'energy', 'health'] as const;
const TOM_FIELDS = ['trust', 'threat', 'respect', 'fear'] as const;
const COMMON_TRAITS = ['paranoia', 'hpaReactivity', 'sensitivity', 'experience', 'normSensitivity'];

function buildTarget(opts: {
  kind: TargetKind;
  bodyField: typeof BODY_FIELDS[number];
  tomToId: string;
  tomField: typeof TOM_FIELDS[number];
  factKey: string;
  traitId: string;
}): PerturbationTarget {
  switch (opts.kind) {
    case 'body':
      return { kind: 'body', field: opts.bodyField };
    case 'tom':
      return { kind: 'tom', toId: opts.tomToId, field: opts.tomField };
    case 'fact':
      return { kind: 'fact', key: opts.factKey };
    case 'trait':
      return { kind: 'trait', traitId: opts.traitId };
    default:
      return { kind: 'body', field: 'stress' };
  }
}

type Sparkline = {
  values: number[];
  color: string;
  label: string;
};

function SparklinePair({
  series,
  height = 80,
  highlightTick,
}: {
  series: Sparkline[];
  height?: number;
  highlightTick?: number | null;
}) {
  const width = 360;
  const all = series.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  const max = Math.max(1e-6, ...all);
  const range = max - min || 1;
  const len = Math.max(2, ...series.map((s) => s.values.length));
  const xStep = width / Math.max(1, len - 1);

  const path = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = i * xStep;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <svg width={width} height={height + 14} className="block">
      {highlightTick != null && highlightTick >= 0 && (
        <line
          x1={highlightTick * xStep}
          x2={highlightTick * xStep}
          y1={0}
          y2={height}
          stroke="#fbbf24"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {series.map((s, i) => (
        <path key={i} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={1.5} />
      ))}
      <text x={2} y={height + 12} fontSize={9} fill="#888">
        max={max.toFixed(3)} min={min.toFixed(3)}
      </text>
    </svg>
  );
}

export const ProConflictLab: React.FC = () => {
  const locations = useMemo(() => getEntitiesByType(EntityType.Location) as any[], []);
  const characters = useMemo(() => getAllCharactersWithRuntime() as any[], []);

  const [seed, setSeed] = useState<number>(42);
  const [maxTicks, setMaxTicks] = useState<number>(20);
  const [locId, setLocId] = useState<string>(() => String(locations?.[0]?.entityId ?? ''));
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(() =>
    characters.slice(0, 3).map((c: any) => String(c.entityId)),
  );
  const [perturbAgentId, setPerturbAgentId] = useState<string>(() =>
    String(characters?.[0]?.entityId ?? ''),
  );
  const [targetKind, setTargetKind] = useState<TargetKind>('body');
  const [bodyField, setBodyField] = useState<typeof BODY_FIELDS[number]>('stress');
  const [tomToId, setTomToId] = useState<string>('');
  const [tomField, setTomField] = useState<typeof TOM_FIELDS[number]>('trust');
  const [factKey, setFactKey] = useState<string>('ctx:danger');
  const [traitId, setTraitId] = useState<string>('paranoia');
  const [delta, setDelta] = useState<number>(0.05);

  const [running, setRunning] = useState(false);
  const [pair, setPair] = useState<PerturbationRunPair | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trace: DivergenceTrace[] = useMemo(() => {
    if (!pair) return [];
    return computeDivergenceTrace(pair.runA, pair.runB);
  }, [pair]);

  const lyapunov = useMemo(() => computeLyapunov(trace), [trace]);
  const firstTick = useMemo(() => firstDivergenceTickFromTrace(trace, 1e-3), [trace]);
  const amplifierEvents: AmplifierEvent[] = useMemo(
    () => (pair ? attributeAmplifiers(pair.runA, pair.runB) : []),
    [pair],
  );

  const handleRun = () => {
    setError(null);
    setRunning(true);
    try {
      const charEntities = characters.filter((c: any) => selectedCharIds.includes(String(c.entityId)));
      const locEntities = locations.filter((l: any) => String(l.entityId) === locId);
      if (!charEntities.length || !locEntities.length) {
        throw new Error('Pick at least one character and one location');
      }
      const placements: Record<string, string> = {};
      for (const c of charEntities) placements[String(c.entityId)] = locId;

      const target = buildTarget({ kind: targetKind, bodyField, tomToId, tomField, factKey, traitId });
      const vector: PerturbationVector = {
        agentId: perturbAgentId,
        target,
        delta,
        label: 'epsilon',
      };

      const result = runPair(
        {
          label: 'pro-conflict',
          characters: charEntities,
          locations: locEntities,
          placements,
          seed,
          maxTicks,
        },
        [vector],
      );
      setPair(result);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  const compositeSeries: Sparkline[] = trace.length
    ? [{ values: trace.map((t) => t.composite), color: '#ef4444', label: 'D(t)' }]
    : [];

  const tensionSeries: Sparkline[] = pair
    ? [
        { values: pair.runA.tensionHistory, color: '#3b82f6', label: 'tension A' },
        { values: pair.runB.tensionHistory, color: '#f97316', label: 'tension B' },
      ]
    : [];

  const stressSeries: Sparkline[] = trace.length
    ? [{ values: trace.map((t) => t.stressL1), color: '#a855f7', label: 'stress L1' }]
    : [];

  const actionHammingSeries: Sparkline[] = trace.length
    ? [{ values: trace.map((t) => t.actionHamming), color: '#10b981', label: 'action Hamming' }]
    : [];

  return (
    <div className="p-3 text-sm">
      <div className="mb-3 text-canon-text-light/80 text-[12px] leading-snug">
        Deterministic sensitivity probe. Both runs use the same RNG seed; only one state field
        receives an epsilon perturbation. Divergence exposes character-specific
        trait/archetype gates in the pipeline.
      </div>

      {/* Setup */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-canon-text-light/60 mb-1">Scene</div>
          <label className="block text-xs mb-1">
            Seed{' '}
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              className="w-20 px-1 bg-canon-bg-light border border-canon-border rounded"
            />
          </label>
          <label className="block text-xs mb-1">
            Ticks{' '}
            <input
              type="number"
              value={maxTicks}
              onChange={(e) => setMaxTicks(Math.max(2, Number(e.target.value) || 0))}
              className="w-20 px-1 bg-canon-bg-light border border-canon-border rounded"
            />
          </label>
          <label className="block text-xs mb-1">
            Location:
            <select
              value={locId}
              onChange={(e) => setLocId(e.target.value)}
              className="ml-1 px-1 bg-canon-bg-light border border-canon-border rounded max-w-[180px]"
            >
              {locations.map((l: any) => (
                <option key={l.entityId} value={l.entityId}>
                  {l.title || l.name || l.entityId}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs mb-1">Characters ({selectedCharIds.length} sel):</div>
          <div className="max-h-32 overflow-y-auto border border-canon-border rounded p-1 bg-canon-bg-light/50">
            {characters.map((c: any) => {
              const id = String(c.entityId);
              const checked = selectedCharIds.includes(id);
              return (
                <label key={id} className="block text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedCharIds((prev) =>
                        e.target.checked ? [...prev, id] : prev.filter((x) => x !== id),
                      );
                    }}
                    className="mr-1"
                  />
                  {c.title || c.name || id}
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-canon-text-light/60 mb-1">
            Perturbation epsilon
          </div>
          <label className="block text-xs mb-1">
            Agent:
            <select
              value={perturbAgentId}
              onChange={(e) => setPerturbAgentId(e.target.value)}
              className="ml-1 px-1 bg-canon-bg-light border border-canon-border rounded"
            >
              {selectedCharIds.map((id) => {
                const c = characters.find((x: any) => String(x.entityId) === id);
                return (
                  <option key={id} value={id}>
                    {c?.title || c?.name || id}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="block text-xs mb-1">
            Target:
            <select
              value={targetKind}
              onChange={(e) => setTargetKind(e.target.value as TargetKind)}
              className="ml-1 px-1 bg-canon-bg-light border border-canon-border rounded"
            >
              {TARGET_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          {targetKind === 'body' && (
            <label className="block text-xs mb-1">
              Field:
              <select
                value={bodyField}
                onChange={(e) => setBodyField(e.target.value as typeof BODY_FIELDS[number])}
                className="ml-1 px-1 bg-canon-bg-light border border-canon-border rounded"
              >
                {BODY_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          )}
          {targetKind === 'tom' && (
            <>
              <label className="block text-xs mb-1">
                To:
                <select
                  value={tomToId}
                  onChange={(e) => setTomToId(e.target.value)}
                  className="ml-1 px-1 bg-canon-bg-light border border-canon-border rounded"
                >
                  <option value="">-</option>
                  {selectedCharIds
                    .filter((id) => id !== perturbAgentId)
                    .map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-xs mb-1">
                Field:
                <select
                  value={tomField}
                  onChange={(e) => setTomField(e.target.value as typeof TOM_FIELDS[number])}
                  className="ml-1 px-1 bg-canon-bg-light border border-canon-border rounded"
                >
                  {TOM_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {targetKind === 'fact' && (
            <label className="block text-xs mb-1">
              Key:
              <input
                value={factKey}
                onChange={(e) => setFactKey(e.target.value)}
                className="ml-1 px-1 w-44 bg-canon-bg-light border border-canon-border rounded"
              />
            </label>
          )}
          {targetKind === 'trait' && (
            <label className="block text-xs mb-1">
              Trait:
              <select
                value={traitId}
                onChange={(e) => setTraitId(e.target.value)}
                className="ml-1 px-1 bg-canon-bg-light border border-canon-border rounded"
              >
                {COMMON_TRAITS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs mb-1">
            Delta: {delta.toFixed(3)}
            <input
              type="range"
              min={-0.2}
              max={0.2}
              step={0.005}
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
              className="block w-full"
            />
          </label>

          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="mt-2 px-3 py-1 bg-amber-500/80 text-canon-bg rounded text-xs disabled:opacity-50"
          >
            {running ? 'Running...' : 'Run pair'}
          </button>
        </div>
      </div>

      {error && <div className="text-red-400 text-xs mb-2">Warning: {error}</div>}

      {/* Results */}
      {pair && (
        <div className="space-y-3">
          {pair.skipped.length > 0 && (
            <div className="text-amber-400 text-xs">
              Skipped: {pair.skipped.map((s) => `${describePerturbation(s.vec)} (${s.reason})`).join(', ')}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="lambda Lyapunov" value={lyapunov.toFixed(4)} hint="(1/T) * log(D(T)/D(0))" />
            <Stat
              label="first divergence"
              value={firstTick == null ? '-' : `tick ${firstTick}`}
              hint="composite > 1e-3"
            />
            <Stat
              label="epsilon applied"
              value={pair.applied.length ? describePerturbation(pair.applied[0]) : 'none'}
            />
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-canon-text-light/60">
              tension A vs B
            </div>
            <SparklinePair series={tensionSeries} highlightTick={firstTick ?? undefined} />
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-canon-text-light/60">D(t) composite</div>
            <SparklinePair series={compositeSeries} highlightTick={firstTick ?? undefined} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-canon-text-light/60">action Hamming</div>
              <SparklinePair series={actionHammingSeries} height={50} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-canon-text-light/60">stress L1</div>
              <SparklinePair series={stressSeries} height={50} />
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-canon-text-light/60 mb-1">
              Amplifier attribution ({amplifierEvents.length} events)
            </div>
            <AmplifierTable events={amplifierEvents} highlightTick={firstTick ?? undefined} />
          </div>
        </div>
      )}
    </div>
  );
};

const GATE_COLOR: Record<AmplifierGate, string> = {
  'driver.crossing': 'bg-purple-500/20 text-purple-200',
  'mode.flip': 'bg-blue-500/20 text-blue-200',
  'action.kindFlip': 'bg-emerald-500/20 text-emerald-200',
  'tension.spike': 'bg-amber-500/20 text-amber-200',
  'stress.spike': 'bg-rose-500/20 text-rose-200',
};

function AmplifierTable({
  events,
  highlightTick,
}: {
  events: AmplifierEvent[];
  highlightTick?: number;
}) {
  if (!events.length) {
    return (
      <div className="text-[11px] text-canon-text-light/50 italic">
        No amplifier events detected. Try a larger epsilon or more ticks.
      </div>
    );
  }
  return (
    <div className="max-h-64 overflow-y-auto border border-canon-border rounded">
      <table className="w-full text-[11px] font-mono">
        <thead className="bg-canon-bg-light/30 sticky top-0">
          <tr>
            <th className="px-2 py-1 text-left">tick</th>
            <th className="px-2 py-1 text-left">agent</th>
            <th className="px-2 py-1 text-left">gate</th>
            <th className="px-2 py-1 text-left">A {'->'} B</th>
            <th className="px-2 py-1 text-left">evidence</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const isFirst = highlightTick != null && e.tick === highlightTick;
            return (
              <tr
                key={i}
                className={`border-t border-canon-border/30 ${
                  isFirst ? 'bg-amber-500/10' : ''
                }`}
              >
                <td className="px-2 py-1">{e.tick}</td>
                <td className="px-2 py-1">{e.agentId}</td>
                <td className="px-2 py-1">
                  <span className={`px-1 rounded ${GATE_COLOR[e.gate]}`}>{e.gate}</span>
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {e.baseline} {'->'} {e.perturbed}
                </td>
                <td className="px-2 py-1 text-canon-text-light/70">{e.evidence}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-2 py-1 bg-canon-bg-light/50 border border-canon-border rounded">
      <div className="text-[10px] uppercase tracking-wider text-canon-text-light/60">{label}</div>
      <div className="text-sm font-mono">{value}</div>
      {hint && <div className="text-[10px] text-canon-text-light/40">{hint}</div>}
    </div>
  );
}
