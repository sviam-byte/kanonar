import React, { useEffect, useMemo, useState } from 'react';
import type { ArtifactRef, PipelineRun, PipelineStage } from '../../lib/goal-lab/pipeline/contracts';
import { buildPredictedWorldSummary } from '../../lib/goal-lab/pipeline/lookahead';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function safeStr(x: any): string {
  try {
    if (x == null) return '';
    return String(x);
  } catch {
    return '';
  }
}

function prettyJson(x: any): string {
  try {
    const s = JSON.stringify(x, null, 2);
    // JSON.stringify(undefined) returns undefined; keep callers safe.
    return typeof s === 'string' ? s : '';
  } catch {
    try {
      return x == null ? '' : String(x);
    } catch {
      return '';
    }
  }
}

/**
 * Serialize JSON safely and truncate very large blobs to keep console rendering responsive.
 */
function prettyJsonTrunc(x: any, maxChars: number): { text: string; truncated: boolean } {
  const text = prettyJson(x) || '';
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, Math.max(0, maxChars - 64))}\n…(truncated)…\n`, truncated: true };
}


function fmt(x: any): string {
  return Number.isFinite(Number(x)) ? Number(x).toFixed(4) : '—';
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

const FEATURE_LABELS_RU: Record<string, string> = {
  threat: 'Угроза', escape: 'Бегство', cover: 'Укрытие', visibility: 'Видимость',
  socialTrust: 'Доверие', emotionValence: 'Эмоц. валентность',
  resourceAccess: 'Ресурсы', scarcity: 'Дефицит', fatigue: 'Усталость', stress: 'Стресс',
};

const DecisionSummaryCard: React.FC<{ digest: any; goalEnergy: Record<string, number>; ranked?: any[] }> = ({ digest, goalEnergy, ranked }) => {
  if (!digest) return null;
  const linear = digest.linearBest;
  const pomdp = digest.pomdpBest;
  const chosen = digest.chosen;
  const divergent = linear && pomdp && linear.actionId !== pomdp.actionId;
  const goalEntries = Object.entries(goalEnergy || {})
    .map(([id, e]) => ({ id, e: Number(e) }))
    .filter((x) => Math.abs(x.e) > 1e-6)
    .sort((a, b) => Math.abs(b.e) - Math.abs(a.e));

  // Find chosen action in ranked list for breakdown.
  const chosenRanked = arr(ranked).find((r: any) =>
    safeStr(r?.id || r?.actionId) === safeStr(chosen?.actionId || chosen?.id)
  );
  const contribs = Object.entries((chosenRanked as any)?.contribByGoal || {})
    .map(([g, v]: [string, any]) => ({ g, v: Number(v) }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-3">
      <div className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">Решение агента</div>
      <div className="space-y-1.5">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Ведущие цели</div>
        {goalEntries.slice(0, 5).map(({ id, e }) => (
          <div key={id} className="flex items-center gap-2">
            <div className="w-24 text-[11px] text-slate-300 truncate">{id}</div>
            <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${Math.min(100, Math.abs(e) * 100)}%` }} /></div>
            <div className="w-10 text-right text-[11px] text-cyan-300 font-mono">{fmtPct(e)}</div>
          </div>
        ))}
      </div>

      {/* Chosen action with explanation. */}
      <div className="rounded border border-emerald-500/30 bg-emerald-950/20 p-2 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">⭐</span>
          <span className="text-[13px] text-emerald-200 font-bold uppercase">{safeStr(chosen?.kind || chosen?.actionId || '—')}</span>
          {chosen?.targetId ? <span className="text-[11px] text-slate-400">→ {safeStr(chosen.targetId)}</span> : null}
          <span className="ml-auto text-[11px] text-slate-400 font-mono">Q={fmt((chosenRanked as any)?.q)}</span>
        </div>
        {contribs.length > 0 ? (
          <div className="space-y-0.5 pl-5">
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">Почему</div>
            {contribs.map(({ g, v }) => (
              <div key={g} className="flex justify-between text-[11px] font-mono">
                <span className="text-slate-300">{g} × Δ</span>
                <span className={v >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{v >= 0 ? '+' : ''}{v.toFixed(4)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Linear vs POMDP. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-slate-700 bg-slate-950/30 p-2"><div className="text-[10px] text-slate-500 uppercase tracking-widest">Linear best</div><div className="text-[11px] text-slate-300 font-mono">{safeStr(linear?.actionId || '—')} Q={fmt(linear?.qNow)}</div></div>
        <div className={`rounded border p-2 ${divergent ? 'border-amber-500/40 bg-amber-950/15' : 'border-slate-700 bg-slate-950/30'}`}><div className="text-[10px] text-slate-500 uppercase tracking-widest">POMDP best</div><div className="text-[11px] text-slate-300 font-mono">{safeStr(pomdp?.actionId || '—')} Q_look={fmt(pomdp?.qLookahead)}</div></div>
      </div>
      {divergent ? (
        <div className="text-[11px] text-amber-300 bg-amber-950/20 rounded px-2 py-1 border border-amber-500/20">
          ⚠ Линейная оценка: «{safeStr(linear?.actionId)}» (Q={fmt(linear?.qNow)}). Lookahead предпочитает «{safeStr(pomdp?.actionId)}» — в перспективе лучше (Δ=+{fmt((pomdp?.qLookahead ?? 0) - (linear?.qNow ?? 0))}).
        </div>
      ) : null}
    </div>
  );
};

const PredictedWorldView: React.FC<{ perAction: any[]; z0: Record<string, number>; pickedIdx: number | null }> = ({ perAction, z0, pickedIdx }) => {
  const actionEval = pickedIdx != null ? perAction[pickedIdx] : perAction[0];
  if (!actionEval || !z0) return null;
  const summary = buildPredictedWorldSummary(actionEval as any, z0 as any);
  return (
    <div className="rounded border border-slate-800 bg-black/20 p-2 space-y-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Предсказанный мир → {safeStr(actionEval.kind || actionEval.actionId)}</div>
      {summary.statements.filter((st) => Math.abs(st.delta) > 0.005).slice(0, 6).map((st) => (
        <div key={st.feature} className="text-[11px] text-slate-300 font-mono">{FEATURE_LABELS_RU[st.feature] || st.feature}: {st.current.toFixed(2)} → {st.predicted.toFixed(2)}</div>
      ))}
    </div>
  );
};

const SensitivityView: React.FC<{ sensitivity?: Record<string, number>; sensitivityZ0?: Record<string, number>; flipCandidates?: Array<{ feature: string; deltaQ: number; wouldFlip: boolean }>; }> = ({ sensitivity, sensitivityZ0, flipCandidates }) => {
  const top = Object.entries(sensitivityZ0 || sensitivity || {})
    .map(([k, v]) => ({ k, v: Math.abs(Number(v)) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  if (!top.length && !arr(flipCandidates).length) return null;
  return (
    <div className="rounded border border-slate-800 bg-black/20 p-2 space-y-1">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Чувствительность решения</div>
      {top.map(({ k, v }) => (<div key={k} className="text-[11px] text-violet-200">{FEATURE_LABELS_RU[k] || k}: {v.toFixed(3)}</div>))}
      {arr(flipCandidates).filter((f) => f.wouldFlip).slice(0, 3).map((f) => (<div key={f.feature} className="text-[11px] text-amber-300">{FEATURE_LABELS_RU[f.feature] || f.feature}: ΔQ≈{Number(f.deltaQ).toFixed(4)}</div>))}
    </div>
  );
};

type Props = {
  run: PipelineRun | null;
  rawV1?: any;
  observeLiteParams?: { radius: number; maxAgents: number; noiseSigma: number; seed: number };
  onObserveLiteParamsChange?: (p: { radius: number; maxAgents: number; noiseSigma: number; seed: number }) => void;
  // If provided, allows forcing an action as "best" (via injected events) without stepping the world.
  onForceAction?: (actionId: string | null) => void;
  onApplyActionMvp?: (actionId: string) => void;
};

export const PomdpConsolePanel: React.FC<Props> = ({ run, rawV1, observeLiteParams, onObserveLiteParamsChange, onForceAction, onApplyActionMvp }) => {
  const stages = arr<PipelineStage>(run?.stages);
  const stageIds = useMemo(() => stages.map((s) => safeStr(s?.id)), [stages]);
  const [stageId, setStageId] = useState<string>('S8');
  const [artifactId, setArtifactId] = useState<string>('');
  const [atomQuery, setAtomQuery] = useState<string>('');
  const [pickedAtomId, setPickedAtomId] = useState<string | null>(null);
  const [pickedRankIdx, setPickedRankIdx] = useState<number | null>(null);
  const [showAllAtoms, setShowAllAtoms] = useState<boolean>(false);
  const [showRawArtifact, setShowRawArtifact] = useState<boolean>(false);
  const [showFullSnapshots, setShowFullSnapshots] = useState<boolean>(false);

  // Cross-stage atom index for "why" navigation: atomId -> { stageId, atom }.
  // We keep earliest occurrence to bias navigation to likely origin points.
  const atomIndex = useMemo(() => {
    const idx = new Map<string, { stageId: string; atom: any }>();
    for (const st of stages) {
      const stId = safeStr(st?.id);
      const atomsArt = arr<ArtifactRef>(st?.artifacts).find((a) => a.kind === 'atoms');
      const aa = arr<any>((atomsArt as any)?.data?.atoms);
      for (const a of aa) {
        const id = safeStr(a?.id);
        if (!id) continue;
        if (!idx.has(id)) idx.set(id, { stageId: stId, atom: a });
      }
    }
    return idx;
  }, [stages]);

  // Prefer decision surface on first render when available, but do not fight manual stage selection.
  useEffect(() => {
    if (!stageIds.length) return;
    if (stageIds.includes('S8') && stageId === 'S0') setStageId('S8');
  }, [stageIds, stageId]);

  const jumpToAtom = (atomId: string) => {
    const hit = atomIndex.get(atomId);
    if (!hit) {
      setPickedAtomId(atomId);
      return;
    }
    setStageId(hit.stageId);
    setArtifactId('');
    setPickedAtomId(atomId);
  };

  // Keep selected stage valid when the run updates after ticks/manual overrides.
  useEffect(() => {
    if (!stageIds.length) {
      setStageId('S0');
      return;
    }
    if (!stageIds.includes(stageId)) {
      setStageId(stageIds[stageIds.length - 1] || 'S0');
    }
  }, [stageIds, stageId]);

  // Reset artifact when stage changes; artifact ids are only stable inside one stage.
  useEffect(() => {
    setArtifactId('');
    setPickedAtomId(null);
    setShowAllAtoms(false);
    setShowRawArtifact(false);
    setShowFullSnapshots(false);
  }, [stageId]);

  const stage = useMemo(() => {
    const i = stageIds.indexOf(stageId);
    if (i >= 0) return stages[i];
    return stages[stages.length - 1] || null;
  }, [stages, stageIds, stageId]);

  const artifacts = arr<ArtifactRef>(stage?.artifacts);

  const selectedArtifact = useMemo(() => {
    if (!artifactId) return artifacts[0] || null;
    return artifacts.find((a) => safeStr(a?.id) === artifactId) || artifacts[0] || null;
  }, [artifactId, artifacts]);

  // Reset decision selection when artifact changes.
  useEffect(() => {
    setPickedRankIdx(null);
    setShowRawArtifact(false);
    setShowFullSnapshots(false);
  }, [selectedArtifact?.id]);

  const atomsArtifact = useMemo(() => artifacts.find((a) => a.kind === 'atoms') || null, [artifacts]);
  // Level 4.5 snapshots are stage-level artifacts and shown above the decision details when available.
  const modes = useMemo(() => artifacts.find((a) => a.kind === 'modes')?.data, [artifacts]);
  const stabilizers = useMemo(() => artifacts.find((a) => a.kind === 'stabilizers')?.data, [artifacts]);
  const atoms = useMemo(() => arr<any>((atomsArtifact as any)?.data?.atoms), [atomsArtifact]);

  // Fast ToM view: small digest of tom:predict atoms from S5 without expanding heavy artifacts.
  const tomPredictFast = useMemo(() => {
    const s5 = stages.find((s) => safeStr((s as any)?.id) === 'S5');
    const s5Artifacts = arr<ArtifactRef>((s5 as any)?.artifacts);
    const s5AtomsArtifact = s5Artifacts.find((a) => a.kind === 'atoms');
    const s5Atoms = arr<any>((s5AtomsArtifact as any)?.data?.atoms);
    return s5Atoms
      .filter((a) => safeStr(a?.id).startsWith('tom:predict:'))
      .map((a) => ({
        id: safeStr(a?.id),
        mag: Number(a?.magnitude ?? a?.mag ?? 0),
        label: safeStr(a?.label || a?.code || ''),
      }))
      .sort((x, y) => Math.abs(y.mag) - Math.abs(x.mag))
      .slice(0, 10);
  }, [stages]);

  // Keep filtering complete for traceability; default render is still capped in atomsToRender.
  const filteredAtoms = useMemo(() => {
    const q = atomQuery.trim().toLowerCase();
    if (!q) return atoms;
    const out: any[] = [];
    for (const a of atoms) {
      const id = safeStr(a?.id).toLowerCase();
      const code = safeStr(a?.code).toLowerCase();
      const label = safeStr(a?.label).toLowerCase();
      if (id.includes(q) || code.includes(q) || label.includes(q)) out.push(a);
    }
    return out;
  }, [atoms, atomQuery]);

  const atomsToRender = useMemo(() => {
    return showAllAtoms ? filteredAtoms : filteredAtoms.slice(0, 60);
  }, [filteredAtoms, showAllAtoms]);

  const pickedAtom = useMemo(() => {
    if (!pickedAtomId) return null;
    return atoms.find((a) => safeStr(a?.id) === pickedAtomId) || null;
  }, [atoms, pickedAtomId]);

  const rawArtifactJson = useMemo(() => {
    // Keep heavy stringify out of render; show truncated JSON by default.
    const maxChars = showRawArtifact ? 200_000 : 30_000;
    return prettyJsonTrunc(selectedArtifact?.data, maxChars);
  }, [selectedArtifact?.data, showRawArtifact]);

  const modesJson = useMemo(() => prettyJsonTrunc(modes, showFullSnapshots ? 120_000 : 20_000), [modes, showFullSnapshots]);
  const stabilizersJson = useMemo(() => prettyJsonTrunc(stabilizers, showFullSnapshots ? 120_000 : 20_000), [stabilizers, showFullSnapshots]);

  if (!run) {
    return (
      <div className="text-slate-400 text-sm space-y-2">
        <div>No POMDP run</div>
        {rawV1 ? (
          <pre className="text-[11px] text-slate-200 bg-black/20 border border-slate-800 rounded p-2 overflow-auto">
            {prettyJson(rawV1)}
          </pre>
        ) : null}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {tomPredictFast.length ? (
        <div className="rounded border border-slate-800 bg-black/20 p-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">ToM predict (fast)</div>
          <div className="mt-1 space-y-1">
            {tomPredictFast.map((p) => (
              <div key={p.id} className="text-[11px] text-slate-300 font-mono truncate" title={p.label || p.id}>
                {p.id} <span className="text-slate-500">m={Number(p.mag).toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Actor / Tick</div>
          <div className="text-sm font-semibold text-slate-200">
            {safeStr(run.selfId)} <span className="text-slate-500">@</span> {Number(run.tick ?? 0)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Stage</div>
          <select
            className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setArtifactId('');
              setPickedAtomId(null);
              setPickedRankIdx(null);
            }}
          >
            {stageIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Artifact</div>
          <select
            className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 min-w-[260px]"
            value={artifactId || safeStr(selectedArtifact?.id)}
            onChange={(e) => {
              setArtifactId(e.target.value);
              setPickedAtomId(null);
              setPickedRankIdx(null);
            }}
          >
            {artifacts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.kind} — {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500">artifacts={artifacts.length} atoms={atoms.length}</div>

        {observeLiteParams && onObserveLiteParamsChange ? (
          <div className="flex flex-wrap items-end gap-2 ml-auto">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Obs radius</div>
              <input
                className="w-[90px] bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                type="number"
                step={0.5}
                value={observeLiteParams.radius}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onObserveLiteParamsChange({ ...observeLiteParams, radius: Number.isFinite(v) ? v : observeLiteParams.radius });
                }}
              />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">maxAgents</div>
              <input
                className="w-[90px] bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                type="number"
                step={1}
                value={observeLiteParams.maxAgents}
                onChange={(e) => {
                  const v = Math.max(0, Math.floor(Number(e.target.value)));
                  onObserveLiteParamsChange({ ...observeLiteParams, maxAgents: Number.isFinite(v) ? v : observeLiteParams.maxAgents });
                }}
              />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">noiseσ</div>
              <input
                className="w-[90px] bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                type="number"
                step={0.05}
                value={observeLiteParams.noiseSigma}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value));
                  onObserveLiteParamsChange({ ...observeLiteParams, noiseSigma: Number.isFinite(v) ? v : observeLiteParams.noiseSigma });
                }}
              />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">seed</div>
              <input
                className="w-[120px] bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                type="number"
                step={1}
                value={observeLiteParams.seed}
                onChange={(e) => {
                  const v = Math.floor(Number(e.target.value));
                  onObserveLiteParamsChange({ ...observeLiteParams, seed: Number.isFinite(v) ? v : observeLiteParams.seed });
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Stage title</div>
            <div className="text-sm font-semibold text-slate-200">{safeStr(stage?.title || stageId)}</div>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {arr<string>(stage?.warnings).length ? (
              <span className="text-amber-300">warnings={arr(stage?.warnings).length}</span>
            ) : (
              <span>warnings=0</span>
            )}
          </div>
        </div>

        {arr<string>(stage?.warnings).length ? (
          <div className="mt-2 space-y-1">
            {arr<string>(stage?.warnings)
              .slice(0, 10)
              .map((w, i) => (
                <div key={i} className="text-xs text-amber-200 font-mono">
                  {w}
                </div>
              ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
        <div className="rounded border border-slate-800 bg-slate-950/40 p-3 min-h-0 overflow-y-auto">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Artifact viewer</div>

          {selectedArtifact?.provenance?.length ? (
            <div className="mb-2 rounded border border-slate-800 bg-black/20 p-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Provenance (first 12)</div>
              <div className="mt-1 space-y-1">
                {selectedArtifact.provenance.slice(0, 12).map((p, i) => (
                  <div key={i} className="text-[11px] text-slate-200 font-mono">
                    <span className="text-cyan-300">{p.group}</span> {p.path}{' '}
                    <span className="text-slate-500">@{p.stageId}</span>
                    {p.note ? <span className="text-slate-400"> — {p.note}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {modes ? (
            <div className="mb-3 rounded border border-slate-700 bg-slate-900/40 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-xs font-bold">MODES</div>
                {modesJson.truncated ? <div className="text-[10px] text-amber-300 font-mono">truncated</div> : null}
              </div>
              <pre className="text-[11px] text-slate-200 overflow-auto">{modesJson.text}</pre>
            </div>
          ) : null}

          {stabilizers ? (
            <div className="mb-3 rounded border border-slate-700 bg-slate-900/40 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-xs font-bold">STABILIZERS</div>
                {stabilizersJson.truncated ? <div className="text-[10px] text-amber-300 font-mono">truncated</div> : null}
              </div>
              <pre className="text-[11px] text-slate-200 overflow-auto">{stabilizersJson.text}</pre>
            </div>
          ) : null}

          {modes || stabilizers ? (
            <div className="mb-3 flex justify-end">
              <button
                className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900/30 text-slate-200 hover:bg-slate-800/40"
                onClick={() => setShowFullSnapshots((v) => !v)}
                title={showFullSnapshots ? 'Show truncated snapshot JSON' : 'Show larger snapshot JSON (may be heavy)'}
              >
                {showFullSnapshots ? 'Truncate snapshots' : 'Show more snapshots'}
              </button>
            </div>
          ) : null}

          {selectedArtifact?.kind === 'decision' ? (
            (() => {
              const data = (selectedArtifact as any)?.data || {};
              // New (Level 4.0b): DecisionSnapshot breakdown.
              if (data && typeof data === 'object' && (data.goalEnergy || data.rankedOverridden || data.contribByGoal)) {
                const ranked = arr<any>(data?.rankedOverridden || data?.ranked);
                const best = data?.best ?? null;
                const goalEnergy = data?.goalEnergy || {};
                const picked = pickedRankIdx != null ? ranked[pickedRankIdx] : null;
                const topContribs = (contrib: Record<string, number>) =>
                  Object.entries(contrib || {})
                    .sort((a, b) => (Number(b[1]) ?? 0) - (Number(a[1]) ?? 0))
                    .slice(0, 6);
                const transSnap = data?.linearApprox || null;
                const featureZ0 = data?.featureVector?.z || null;

                return (
                  <div className="space-y-3">
                    <DecisionSummaryCard digest={data?.digest} goalEnergy={goalEnergy} ranked={ranked} />
                    <div className="rounded border border-slate-800 bg-black/20 p-2">
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Decision snapshot</div>
                      <div className="mt-1 text-[11px] text-slate-500 font-mono">T={fmt(data?.temperature)} forced={safeStr(data?.forcedActionId || '') || '—'}</div>
                      {data?.lookahead?.enabled ? (
                        <div className="mt-1 text-[11px] text-slate-500 font-mono">lookahead: γ={fmt(data?.lookahead?.gamma)} risk={fmt(data?.lookahead?.riskAversion)} v0={fmt(data?.lookahead?.v0)}</div>
                      ) : null}
                      {data?.digest ? (
                        <div className="mt-1 text-[11px] text-slate-500 font-mono">
                          digest: lead={safeStr(data?.digest?.leadingGoal?.id) || '—'}
                          {data?.digest?.leadingGoal?.energy != null ? `(${fmt(data?.digest?.leadingGoal?.energy)})` : ''}{' '}
                          linear={safeStr(data?.digest?.linearBest?.actionId) || '—'}
                          {data?.digest?.linearBest?.targetId ? `→${safeStr(data?.digest?.linearBest?.targetId)}` : ''}{' '}
                          pomdp={safeStr(data?.digest?.pomdpBest?.actionId) || '—'}
                          {data?.digest?.pomdpBest?.targetId ? `→${safeStr(data?.digest?.pomdpBest?.targetId)}` : ''}{' '}
                          chosen={safeStr(data?.digest?.chosen?.actionId) || safeStr(best?.id) || '—'}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded border border-slate-800 bg-black/20 p-2">
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Ranked actions (breakdown)</div>
                      <div className="mt-2 space-y-1">
                        {ranked.slice(0, 10).map((r, i) => {
                          const id = safeStr(r?.id || `#${i}`);
                          const q = Number(r?.q ?? 0);
                          const qL = r?.qLookahead != null ? Number(r?.qLookahead ?? 0) : null;
                          const dL = r?.deltaLookahead != null ? Number(r?.deltaLookahead ?? 0) : null;
                          const v1 = r?.v1 != null ? Number(r?.v1 ?? 0) : null;
                          const cost = Number(r?.cost ?? 0);
                          const conf = Number(r?.confidence ?? 1);
                          return (
                            <button
                              key={id || i}
                              className={`w-full text-left px-2 py-1 rounded border ${
                                pickedRankIdx === i
                                  ? 'border-cyan-400/40 bg-cyan-400/10'
                                  : 'border-slate-800 bg-slate-950/30 hover:bg-slate-800/40'
                              }`}
                              onClick={() => setPickedRankIdx(i)}
                            >
                              <div className="flex justify-between gap-2 text-[12px]">
                                <div className="font-mono text-slate-200 truncate">{id}</div>
                                <div className="font-mono text-cyan-300">q={fmt(q)}</div>
                              </div>
                              <div className="flex justify-between gap-2 text-[11px] text-slate-500 font-mono">
                                <div>cost={fmt(cost)} conf={fmt(conf)}</div>
                                <div>raw={fmt(r?.rawBeforeConfidence ?? 0)}</div>
                              </div>
                              {qL != null ? (
                                <div className="flex justify-between gap-2 text-[11px] text-slate-500 font-mono">
                                  <div>look={fmt(qL)} Δ={fmt(dL ?? 0)}</div>
                                  <div>v1={fmt(v1 ?? 0)}</div>
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                        {!ranked.length ? <div className="text-xs text-slate-500">No ranked actions</div> : null}
                      </div>
                    </div>

                    {picked ? (
                      <div className="rounded border border-slate-800 bg-black/20 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Picked action</div>
                          {onForceAction ? (
                            <div className="flex items-center gap-2">
                              <button
                                className="text-xs px-2 py-1 rounded border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
                                onClick={() => {
                                  const actId = safeStr(picked?.id);
                                  if (!actId) return;
                                  onForceAction(actId);
                                }}
                                title="Mark this action as forced-best (console only)"
                              >
                                Force best
                              </button>
                              <button
                                className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900/30 text-slate-200 hover:bg-slate-800/40"
                                onClick={() => onForceAction(null)}
                                title="Clear forced action"
                              >
                                Clear
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {picked?.qLookahead != null ? (
                          <div className="mt-2 rounded border border-slate-800 bg-slate-950/30 p-2">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Lookahead</div>
                            <div className="mt-1 text-[12px] font-mono flex flex-wrap gap-x-4 gap-y-1">
                              <div className="text-slate-200">q_now=<span className="text-cyan-300">{fmt(picked?.q)}</span></div>
                              <div className="text-slate-200">q_look=<span className="text-cyan-300">{fmt(picked?.qLookahead)}</span></div>
                              <div className="text-slate-200">Δ=<span className="text-cyan-300">{fmt(picked?.deltaLookahead ?? 0)}</span></div>
                              <div className="text-slate-200">v1=<span className="text-cyan-300">{fmt(picked?.v1 ?? 0)}</span></div>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="rounded border border-slate-800 bg-slate-950/30 p-2">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Goal energy</div>
                            <pre className="mt-1 text-[11px] text-slate-200 overflow-auto">{prettyJson(goalEnergy)}</pre>
                          </div>
                          <div className="rounded border border-slate-800 bg-slate-950/30 p-2">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">ΔGoals</div>
                            <pre className="mt-1 text-[11px] text-slate-200 overflow-auto">{prettyJson(picked?.deltaGoals || {})}</pre>
                          </div>
                        </div>

                        <div className="mt-2 rounded border border-slate-800 bg-slate-950/30 p-2">
                          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Top contributors (goalEnergy × Δg)</div>
                          <div className="mt-1 space-y-1">
                            {topContribs(picked?.contribByGoal || {}).map(([g, v]) => (
                              <div key={g} className="flex justify-between gap-2 text-[12px] font-mono">
                                <div className="text-slate-200 truncate">{g}</div>
                                <div className="text-cyan-300">{fmt(v)}</div>
                              </div>
                            ))}
                            {!topContribs(picked?.contribByGoal || {}).length ? (
                              <div className="text-xs text-slate-500">No goal contributions</div>
                            ) : null}
                          </div>
                        </div>

                        <pre className="mt-2 text-[11px] text-slate-200 overflow-auto">{prettyJson(picked)}</pre>
                      </div>
                    ) : null}

                    {transSnap?.perAction && featureZ0 ? (
                      <PredictedWorldView perAction={transSnap.perAction} z0={featureZ0} pickedIdx={pickedRankIdx} />
                    ) : null}

                    <SensitivityView
                      sensitivity={transSnap?.sensitivity}
                      sensitivityZ0={transSnap?.sensitivityZ0}
                      flipCandidates={transSnap?.flipCandidates}
                    />

                    {best ? (
                      <div className="rounded border border-slate-800 bg-black/20 p-2">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Best</div>
                        <pre className="mt-2 text-[11px] text-slate-200 overflow-auto">{prettyJson(best)}</pre>
                      </div>
                    ) : null}

                    {data?.note ? <div className="text-[11px] text-slate-500">{safeStr(data.note)}</div> : null}
                  </div>
                );
              }
              const ranked = arr<any>(data?.ranked);
              const best = data?.best ?? null;
              const intent = data?.intentPreview ?? null;
              const access = arr<any>(data?.accessDecisions);
              const picked = pickedRankIdx != null ? ranked[pickedRankIdx] : null;
              return (
                <div className="space-y-3">
                  <div className="rounded border border-slate-800 bg-black/20 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Ranked actions (top 10)</div>
                    <div className="mt-2 space-y-1">
                      {ranked.slice(0, 10).map((r, i) => (
                        <button
                          key={i}
                          className={`w-full text-left px-2 py-1 rounded border ${
                            pickedRankIdx === i
                              ? 'border-cyan-400/40 bg-cyan-400/10'
                              : 'border-slate-800 bg-slate-950/30 hover:bg-slate-800/40'
                          }`}
                          onClick={() => setPickedRankIdx(i)}
                        >
                          <div className="flex justify-between gap-2 text-[12px]">
                            <div className="font-mono text-slate-200 truncate">
                              {safeStr(r?.id || r?.name || r?.actionId || `#${i}`)}
                            </div>
                            <div className="font-mono text-cyan-300">q={Number(r?.q ?? 0).toFixed(4)}</div>
                          </div>
                        </button>
                      ))}
                      {!ranked.length ? <div className="text-xs text-slate-500">No ranked actions</div> : null}
                    </div>
                  </div>

                  {picked ? (
                    <div className="rounded border border-slate-800 bg-black/20 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Picked action</div>
                        {onForceAction ? (
                          <div className="flex items-center gap-2">
                            <button
                              className="text-xs px-2 py-1 rounded border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
                              onClick={() => {
                                const actId = safeStr(picked?.id || picked?.actionId || picked?.name);
                                if (!actId) return;
                                onForceAction(actId);
                              }}
                              title="Mark this action as forced-best (console only)"
                            >
                              Force best
                            </button>
                            {onApplyActionMvp ? (
                              <button
                                className="text-xs px-2 py-1 rounded border border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                                onClick={() => {
                                  const actId = safeStr(picked?.id || picked?.actionId || picked?.name);
                                  if (!actId) return;
                                  onApplyActionMvp(actId);
                                }}
                                title="Apply scenario actionEffects.metricDelta to world.scene.metrics (MVP transition)"
                              >
                                Apply (MVP)
                              </button>
                            ) : null}
                            <button
                              className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900/30 text-slate-200 hover:bg-slate-800/40"
                              onClick={() => onForceAction(null)}
                              title="Clear forced action"
                            >
                              Clear
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <pre className="mt-2 text-[11px] text-slate-200 overflow-auto">{prettyJson(picked)}</pre>
                    </div>
                  ) : null}

                  <div className="rounded border border-slate-800 bg-black/20 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Best</div>
                    <pre className="mt-2 text-[11px] text-slate-200 overflow-auto">{prettyJson(best)}</pre>
                  </div>

                  <div className="rounded border border-slate-800 bg-black/20 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Intent preview</div>
                    <pre className="mt-2 text-[11px] text-slate-200 overflow-auto">{prettyJson(intent)}</pre>
                  </div>

                  {access.length ? (
                    <div className="rounded border border-slate-800 bg-black/20 p-2">
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Access decisions</div>
                      <pre className="mt-2 text-[11px] text-slate-200 overflow-auto">{prettyJson(access.slice(0, 50))}</pre>
                      {access.length > 50 ? (
                        <div className="mt-1 text-[11px] text-slate-500">… {access.length - 50} more</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })()
          ) : selectedArtifact?.kind === 'domains' || selectedArtifact?.kind === 'logits' ? (
            (() => {
              const data = (selectedArtifact as any)?.data || {};
              const domains = arr<any>(data?.domains);
              const active = new Set(arr<any>(data?.activeDomains).map((x) => safeStr(x?.domain || x?.id)));
              const fmt = (x: any) => (Number.isFinite(Number(x)) ? Number(x).toFixed(4) : '0.0000');
              return (
                <div className="space-y-3">
                  <div className="rounded border border-slate-800 bg-black/20 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                      {safeStr(selectedArtifact.kind)}
                    </div>
                    <div className="mt-2 space-y-1 max-h-[380px] overflow-auto">
                      {domains.slice(0, 48).map((d: any) => {
                        const name = safeStr(d?.domain || d?.id);
                        const score01 = Number(d?.score01 ?? d?.magnitude ?? 0);
                        const logit = Number(d?.logit ?? 0);
                        return (
                          <div
                            key={name}
                            className={`px-2 py-1 rounded border ${
                              active.has(name) ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-slate-800 bg-slate-950/30'
                            }`}
                          >
                            <div className="flex justify-between gap-2 text-[12px] font-mono">
                              <div className="text-slate-200 truncate">{name}</div>
                              <div className="text-cyan-300">p={fmt(score01)}</div>
                            </div>
                            {selectedArtifact.kind === 'logits' ? (
                              <div className="flex justify-between gap-2 text-[11px] font-mono text-slate-500">
                                <div>logit</div>
                                <div>{fmt(logit)}</div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {!domains.length ? <div className="text-xs text-slate-500">No domains</div> : null}
                    </div>
                    {data?.mode ? (
                      <div className="mt-2 rounded border border-slate-800 bg-slate-950/30 p-2">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Mode</div>
                        <pre className="mt-1 text-[11px] text-slate-200 overflow-auto">{prettyJson(data.mode)}</pre>
                      </div>
                    ) : null}
                    {data?.note ? <div className="mt-2 text-[11px] text-slate-500">{safeStr(data.note)}</div> : null}
                  </div>
                  <pre className="text-[11px] text-slate-200 bg-black/20 border border-slate-800 rounded p-2 overflow-auto">
                    {prettyJson({ ...data, domains: domains.slice(0, 12) })}
                  </pre>
                </div>
              );
            })()
          ) : selectedArtifact?.kind === 'goals' ? (
            (() => {
              const data = (selectedArtifact as any)?.data || {};
              const top = arr<any>(data?.topPlanGoals);
              return (
                <div className="space-y-3">
                  <div className="rounded border border-slate-800 bg-black/20 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Top plan goals</div>
                    {top.length ? (
                      <div className="mt-2 space-y-1">
                        {top.slice(0, 12).map((g, i) => (
                          <div key={i} className="text-[12px] text-slate-200 font-mono">
                            {prettyJson(g)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">No topPlanGoals</div>
                    )}
                  </div>

                  <pre className="text-[11px] text-slate-200 bg-black/20 border border-slate-800 rounded p-2 overflow-auto">
                    {prettyJson(data)}
                  </pre>
                </div>
              );
            })()
          ) : (selectedArtifact?.kind === 'truth' || selectedArtifact?.kind === 'observation' || selectedArtifact?.kind === 'belief') &&
            Array.isArray((selectedArtifact as any)?.data?.atoms) ? (
            (() => {
              const data = (selectedArtifact as any)?.data || {};
              const list = arr<any>(data?.atoms);
              return (
                <div className="space-y-3">
                  <div className="rounded border border-slate-800 bg-black/20 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">{safeStr(selectedArtifact.kind)} atoms</div>
                    <div className="mt-2 text-xs text-slate-500">
                      count={Number(data?.count ?? list.length)} (showing up to {Math.min(120, list.length)})
                    </div>
                    <div className="mt-2 space-y-1 max-h-[320px] overflow-auto">
                      {list.slice(0, 120).map((a: any) => {
                        const id = safeStr(a?.id);
                        const mag = Number(a?.magnitude ?? 0);
                        const label = safeStr(a?.label || a?.code);
                        return (
                          <button
                            key={id}
                            className="w-full text-left px-2 py-1 rounded border border-slate-800 bg-slate-950/30 hover:bg-slate-800/40"
                            onClick={() => jumpToAtom(id)}
                            title="Jump to atom"
                          >
                            <div className="flex justify-between gap-2 text-[12px]">
                              <div className="font-mono text-slate-200 truncate">{id}</div>
                              <div className="font-mono text-cyan-300">{mag.toFixed(4)}</div>
                            </div>
                            {label ? <div className="text-[11px] text-slate-400 truncate">{label}</div> : null}
                          </button>
                        );
                      })}
                      {!list.length ? <div className="text-xs text-slate-500">No atoms in this slice</div> : null}
                    </div>
                    {data?.note ? <div className="mt-2 text-[11px] text-slate-500">{safeStr(data.note)}</div> : null}
                  </div>

                  <pre className="text-[11px] text-slate-200 bg-black/20 border border-slate-800 rounded p-2 overflow-auto">
                    {prettyJson({ ...data, atoms: list.slice(0, 20) })}
                  </pre>
                </div>
              );
            })()
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-slate-500 font-mono">{rawArtifactJson.truncated ? 'raw json truncated' : 'raw json'}</div>
                <button
                  className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900/30 text-slate-200 hover:bg-slate-800/40"
                  onClick={() => setShowRawArtifact((v) => !v)}
                  title={showRawArtifact ? 'Show truncated JSON' : 'Show larger JSON (may be heavy)'}
                >
                  {showRawArtifact ? 'Truncate' : 'Show more'}
                </button>
              </div>
              <pre className="text-[11px] text-slate-200 bg-black/20 border border-slate-800 rounded p-2 overflow-auto">{rawArtifactJson.text}</pre>
            </div>
          )}
        </div>

        <div className="rounded border border-slate-800 bg-slate-950/40 p-3 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Atoms</div>
            <input
              className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              placeholder="filter by id/code/label"
              value={atomQuery}
              onChange={(e) => setAtomQuery(e.target.value)}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="font-mono">showing {atomsToRender.length}/{filteredAtoms.length}</div>
            {filteredAtoms.length > 60 ? (
              <button
                className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-900/30 text-slate-200 hover:bg-slate-800/40"
                onClick={() => setShowAllAtoms((v) => !v)}
                title={showAllAtoms ? 'Show fewer atoms' : 'Show all atoms (may be heavy)'}
              >
                {showAllAtoms ? 'Show less' : 'Show all'}
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex-1 min-h-0 overflow-auto">
            {atomsToRender.map((a) => {
              const id = safeStr(a?.id);
              const mag = Number(a?.magnitude ?? 0);
              const code = safeStr(a?.code);
              const label = safeStr(a?.label);
              const used = arr<any>(a?.provenance).length || arr<string>(a?.trace?.usedAtomIds).length;
              return (
                <button
                  key={id}
                  className="w-full text-left px-2 py-1 rounded hover:bg-slate-800/40 border border-transparent hover:border-slate-700"
                  onClick={() => jumpToAtom(id)}
                >
                  <div className="flex justify-between gap-2">
                    <div className="font-mono text-[11px] text-slate-200 truncate">{id}</div>
                    <div className="font-mono text-[11px] text-cyan-300">{mag.toFixed(4)}</div>
                  </div>
                  <div className="flex justify-between gap-2">
                    <div className="text-[11px] text-slate-400 truncate">{label || code}</div>
                    <div className="text-[11px] text-slate-500 font-mono">trace={used}</div>
                  </div>
                </button>
              );
            })}
            {!atomsToRender.length ? <div className="text-xs text-slate-500">No atoms matched</div> : null}
          </div>
        </div>
      </div>

      {pickedAtom ? (
        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Atom inspector</div>
            <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setPickedAtomId(null)}>
              close
            </button>
          </div>

          {arr<any>(pickedAtom?.provenance).length ? (
            <div className="mt-2 rounded border border-slate-800 bg-black/20 p-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Provenance (first 16)</div>
              <div className="mt-1 space-y-1">
                {arr<any>(pickedAtom?.provenance)
                  .slice(0, 16)
                  .map((p: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-200 font-mono">
                      <span className="text-cyan-300">{safeStr(p.group)}</span> {safeStr(p.path)}{' '}
                      <span className="text-slate-500">@{safeStr(p.stageId)}</span>
                      {p.note ? <span className="text-slate-400"> — {safeStr(p.note)}</span> : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {arr<string>(pickedAtom?.trace?.usedAtomIds).length ? (
            <div className="mt-2 rounded border border-slate-800 bg-black/20 p-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Used atoms (why-links)</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {arr<string>(pickedAtom?.trace?.usedAtomIds)
                  .slice(0, 40)
                  .map((u, i) => (
                    <button
                      key={`${u}:${i}`}
                      className="px-2 py-1 rounded border border-slate-800 bg-slate-950/30 hover:bg-slate-800/40 text-[11px] font-mono text-slate-200"
                      onClick={() => jumpToAtom(String(u))}
                      title="Jump to source atom"
                    >
                      {String(u)}
                    </button>
                  ))}
              </div>
              {arr<string>(pickedAtom?.trace?.usedAtomIds).length > 40 ? (
                <div className="mt-1 text-[11px] text-slate-500">
                  … {arr<string>(pickedAtom?.trace?.usedAtomIds).length - 40} more
                </div>
              ) : null}
            </div>
          ) : null}

          <pre className="mt-2 text-[11px] text-slate-200 bg-black/20 border border-slate-800 rounded p-2 overflow-auto">
            {prettyJson({
              id: pickedAtom?.id,
              code: pickedAtom?.code,
              label: pickedAtom?.label,
              magnitude: pickedAtom?.magnitude,
              confidence: pickedAtom?.confidence,
              ns: pickedAtom?.ns,
              kind: pickedAtom?.kind,
              source: pickedAtom?.source,
              origin: pickedAtom?.origin,
              trace: pickedAtom?.trace || null,
            })}
          </pre>
        </div>
      ) : null}
    </div>
  );
};
