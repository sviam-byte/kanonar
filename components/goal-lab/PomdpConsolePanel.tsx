import React, { useEffect, useMemo, useState } from 'react';
import type { ArtifactRef, PipelineRun, PipelineStage } from '../../lib/goal-lab/pipeline/contracts';

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
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

type Props = {
  run: PipelineRun | null;
  rawV1?: any;
  observeLiteParams?: { radius: number; maxAgents: number; noiseSigma: number; seed: number };
  onObserveLiteParamsChange?: (p: { radius: number; maxAgents: number; noiseSigma: number; seed: number }) => void;
};

export const PomdpConsolePanel: React.FC<Props> = ({ run, rawV1, observeLiteParams, onObserveLiteParamsChange }) => {
  const stages = arr<PipelineStage>(run?.stages);
  const stageIds = useMemo(() => stages.map((s) => safeStr(s?.id)), [stages]);
  const [stageId, setStageId] = useState<string>('S0');
  const [artifactId, setArtifactId] = useState<string>('');
  const [atomQuery, setAtomQuery] = useState<string>('');
  const [pickedAtomId, setPickedAtomId] = useState<string | null>(null);
  const [pickedRankIdx, setPickedRankIdx] = useState<number | null>(null);

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
  }, [selectedArtifact?.id]);

  const atomsArtifact = useMemo(() => artifacts.find((a) => a.kind === 'atoms') || null, [artifacts]);
  const atoms = useMemo(() => arr<any>((atomsArtifact as any)?.data?.atoms), [atomsArtifact]);

  const filteredAtoms = useMemo(() => {
    const q = atomQuery.trim().toLowerCase();
    if (!q) return atoms.slice(0, 250);
    const out: any[] = [];
    for (const a of atoms) {
      const id = safeStr(a?.id).toLowerCase();
      const code = safeStr(a?.code).toLowerCase();
      const label = safeStr(a?.label).toLowerCase();
      if (id.includes(q) || code.includes(q) || label.includes(q)) out.push(a);
      if (out.length >= 250) break;
    }
    return out;
  }, [atoms, atomQuery]);

  const pickedAtom = useMemo(() => {
    if (!pickedAtomId) return null;
    return atoms.find((a) => safeStr(a?.id) === pickedAtomId) || null;
  }, [atoms, pickedAtomId]);

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
    <div className="flex flex-col gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
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

          {selectedArtifact?.kind === 'decision' ? (
            (() => {
              const data = (selectedArtifact as any)?.data || {};
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
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Picked action</div>
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
            <pre className="text-[11px] text-slate-200 bg-black/20 border border-slate-800 rounded p-2 overflow-auto">
              {prettyJson(selectedArtifact?.data)}
            </pre>
          )}
        </div>

        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Atoms</div>
            <input
              className="bg-slate-900/40 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              placeholder="filter by id/code/label"
              value={atomQuery}
              onChange={(e) => setAtomQuery(e.target.value)}
            />
          </div>

          <div className="mt-2 max-h-[420px] overflow-auto">
            {filteredAtoms.map((a) => {
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
            {!filteredAtoms.length ? <div className="text-xs text-slate-500">No atoms matched</div> : null}
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
