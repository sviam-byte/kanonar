import React, { useMemo, useState } from 'react';
import type { ClaimTrace, MafiaGameResult, NightTrace, VoteTrace } from '../lib/mafia';

const f2 = (v: number) => Number(v ?? 0).toFixed(2);
const pct = (v: number) => `${(Number(v ?? 0) * 100).toFixed(0)}%`;

type TraceEntry = {
  key: string;
  cycle: number;
  phase: 'day' | 'night';
  kind: 'claim' | 'vote' | 'kill' | 'check' | 'heal';
  trace: ClaimTrace | VoteTrace | NightTrace;
  targetId?: string | null;
};

function scoreRows(trace: ClaimTrace | VoteTrace | NightTrace): Array<{ label: string; u: number; chosen: boolean }> {
  if ('voterId' in trace) {
    return trace.ranked.map(r => ({ label: r.targetId ?? 'abstain', u: r.u, chosen: r.chosen }));
  }
  if ('chosenKind' in trace) {
    return trace.ranked.map(r => ({ label: `${r.kind}${r.targetId ? ` → ${r.targetId}` : ''}`, u: r.u, chosen: r.chosen }));
  }
  return trace.ranked.map(r => ({ label: r.targetId, u: r.u, chosen: r.chosen }));
}

const TraceCard: React.FC<{ entry: TraceEntry }> = ({ entry }) => {
  const t = entry.trace;
  const perceptionTargets = (Object.entries(t.perception.byTarget) as Array<[string, NonNullable<typeof t.perception.byTarget[string]>]>)
    .sort((a, b) => (b[1].suspicion ?? 0) - (a[1].suspicion ?? 0));

  return (
    <details className="rounded-lg border border-canon-border/50 bg-canon-card p-3" open>
      <summary className="cursor-pointer flex items-center justify-between gap-2">
        <div className="text-sm text-canon-text font-semibold">
          {entry.phase} · цикл {entry.cycle} · {entry.kind}
          {entry.targetId ? <span className="text-canon-muted font-normal"> → {entry.targetId}</span> : null}
        </div>
        <div className="text-[10px] text-canon-faint font-mono">
          τ={f2(t.sampling.temperature)} · r={f2(t.sampling.rngDraw)} · chosen={t.sampling.chosenKey}
        </div>
      </summary>

      <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3 text-[11px]">
        <div className="space-y-2">
          <div className="text-canon-muted uppercase tracking-wider text-[10px]">Как видел мир</div>
          <div className="rounded border border-canon-border/40 bg-canon-bg/40 p-2 space-y-1 max-h-72 overflow-auto">
            {perceptionTargets.map(([targetId, v]) => (
              <div key={targetId} className="rounded border border-canon-border/30 px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-canon-text font-medium">{targetId}</div>
                  <div className="font-mono text-canon-muted">sus {f2(v.suspicion)}</div>
                </div>
                <div className="text-canon-faint mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>knowledge: {v.roleKnowledge}</span>
                  <span>acc {v.publicSignal.accusedBy}</span>
                  <span>def {v.publicSignal.defendedBy}</span>
                  <span>sheriff→mafia {v.publicSignal.sheriffClaimsMafia}</span>
                  <span>sheriff→town {v.publicSignal.sheriffClaimsTown}</span>
                </div>
                {v.rel && (
                  <div className="text-canon-faint mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>trust {f2(v.rel.trust)}</span>
                    <span>bond {f2(v.rel.bond)}</span>
                    <span>conflict {f2(v.rel.conflict)}</span>
                    <span>fear {f2(v.rel.fear)}</span>
                    <span>fam {f2(v.rel.familiarity)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-canon-muted uppercase tracking-wider text-[10px]">Между кем выбирал</div>
          <div className="rounded border border-canon-border/40 bg-canon-bg/40 p-2 space-y-1 max-h-40 overflow-auto">
            {t.candidates.map((c) => (
              <div key={c.key} className={`rounded px-2 py-1 border ${c.included ? 'border-canon-accent/30 bg-canon-accent/5' : 'border-canon-border/20'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-canon-text">{c.label}</div>
                  <div className={`text-[10px] ${c.included ? 'text-canon-accent' : 'text-canon-faint'}`}>{c.included ? 'included' : 'filtered'}</div>
                </div>
                <div className="text-canon-faint text-[10px] mt-0.5">{c.reason}</div>
              </div>
            ))}
          </div>

          <div className="text-canon-muted uppercase tracking-wider text-[10px] mt-2">Как оценивал варианты</div>
          <div className="rounded border border-canon-border/40 bg-canon-bg/40 p-2 space-y-1 max-h-44 overflow-auto">
            {scoreRows(t).map((row) => {
              const p = t.sampling.probabilities[row.label] ?? t.sampling.probabilities[row.label.replace(/^.*→ /, '')] ?? undefined;
              return (
                <div key={row.label} className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${row.chosen ? 'bg-canon-accent/10' : ''}`}>
                  <div className="text-canon-text">{row.label}</div>
                  <div className="flex items-center gap-3 font-mono text-[10px]">
                    <span className="text-canon-muted">U={f2(row.u)}</span>
                    {p !== undefined ? <span className="text-canon-faint">p={pct(p)}</span> : null}
                    {row.chosen ? <span className="text-canon-accent">chosen</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </details>
  );
};

export const MafiaTracePanel: React.FC<{ result: MafiaGameResult }> = ({ result }) => {
  const players = result.state.config.players;
  const [selectedActor, setSelectedActor] = useState<string>(players[0] ?? '');
  const [selectedCycle, setSelectedCycle] = useState<number | 'all'>('all');

  const entries = useMemo<TraceEntry[]>(() => {
    const out: TraceEntry[] = [];
    for (const day of result.state.history.days) {
      const claim = day.claims.find(c => c.actorId === selectedActor);
      if (claim) out.push({ key: `d${day.cycle}:claim`, cycle: day.cycle, phase: 'day', kind: 'claim', trace: claim.reasoning, targetId: claim.targetId });
      const vote = day.votes.find(v => v.voterId === selectedActor);
      if (vote) out.push({ key: `d${day.cycle}:vote`, cycle: day.cycle, phase: 'day', kind: 'vote', trace: vote.reasoning, targetId: vote.targetId });
    }
    for (const night of result.state.history.nights) {
      const trace = night.traces.find(t => t.actorId === selectedActor);
      if (trace) out.push({ key: `n${night.cycle}:${trace.kind}`, cycle: night.cycle, phase: 'night', kind: trace.kind, trace, targetId: trace.chosenTargetId });
    }
    return out.filter(e => selectedCycle === 'all' || e.cycle === selectedCycle);
  }, [result, selectedActor, selectedCycle]);

  const relevantLedger = useMemo(() => (
    result.state.suspicionLedger.filter(d =>
      (d.observerId === selectedActor || d.targetId === selectedActor) &&
      (selectedCycle === 'all' || d.cycle === selectedCycle)
    )
  ), [result, selectedActor, selectedCycle]);

  const cycleOptions = useMemo(() => {
    const all = new Set<number>();
    result.state.history.days.forEach(d => all.add(d.cycle));
    result.state.history.nights.forEach(n => all.add(n.cycle));
    return [...all].sort((a, b) => a - b);
  }, [result]);

  return (
    <div className="rounded-xl border border-canon-border bg-canon-panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-canon-text">MafiaLab Trace</div>
          <div className="text-[11px] text-canon-muted">Показывает perception snapshot, candidate audit, sampling trace и ledger подозрений.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <label className="text-canon-muted">Актёр
            <select value={selectedActor} onChange={(e) => setSelectedActor(e.target.value)} className="ml-1 bg-canon-bg border border-canon-border rounded px-2 py-1 text-canon-text">
              {players.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <label className="text-canon-muted">Цикл
            <select value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="ml-1 bg-canon-bg border border-canon-border rounded px-2 py-1 text-canon-text">
              <option value="all">all</option>
              {cycleOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-3">
        <div className="space-y-2">
          {entries.length === 0 ? (
            <div className="text-[11px] text-canon-muted italic rounded border border-canon-border/40 bg-canon-bg/40 p-3">Для выбранного актёра в этом цикле нет trace-событий.</div>
          ) : entries.map((entry) => <TraceCard key={entry.key} entry={entry} />)}
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-canon-border/50 bg-canon-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-canon-muted mb-2">Suspicion ledger</div>
            <div className="space-y-1 max-h-[36rem] overflow-auto text-[10px]">
              {relevantLedger.length === 0 ? (
                <div className="text-canon-faint italic">Нет delta-записей для выбранного фильтра.</div>
              ) : relevantLedger.map((d, idx) => (
                <div key={`${d.cycle}:${idx}`} className="rounded border border-canon-border/30 px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-canon-text">{d.phase} {d.cycle}: {d.observerId} → {d.targetId}</div>
                    <div className="font-mono text-canon-muted">{f2(d.before)} {d.delta >= 0 ? '+' : ''}{f2(d.delta)} → {f2(d.after)}</div>
                  </div>
                  <div className="text-canon-faint mt-0.5">{d.reason}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
