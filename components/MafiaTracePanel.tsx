import React from 'react';
import type {
  ClaimTrace,
  MafiaGameResult,
  MafiaPerceptionSnapshot,
  NightTrace,
  VoteTrace,
} from '../lib/mafia';

const f2 = (v: number) => Number(v ?? 0).toFixed(2);
const pct = (v: number) => `${(Number(v ?? 0) * 100).toFixed(0)}%`;
const labelId = (id: string | null | undefined) => (id ?? '—').replace(/^character-/, '');

function topSuspicion(perception: MafiaPerceptionSnapshot, limit = 4) {
  return Object.entries(perception.byTarget)
    .filter(([id]) => id !== perception.actorId)
    .sort((a, b) => b[1].suspicion - a[1].suspicion)
    .slice(0, limit);
}

function SamplingCard({ trace }: { trace: { sampling: { temperature: number; rngDraw: number; chosenKey: string; probabilities: Record<string, number> } } }) {
  const top = Object.entries(trace.sampling.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <div className="rounded border border-canon-border/40 bg-canon-bg/30 p-2 space-y-1">
      <div className="text-[10px] text-canon-muted">sampling</div>
      <div className="text-[10px] font-mono text-canon-text">T={f2(trace.sampling.temperature)} · r={f2(trace.sampling.rngDraw)} · chosen={trace.sampling.chosenKey}</div>
      <div className="space-y-0.5 text-[10px] font-mono">
        {top.map(([key, prob]) => <div key={key} className="text-canon-faint">{key}: {pct(prob)}</div>)}
      </div>
    </div>
  );
}

function PerceptionCard({ perception }: { perception: MafiaPerceptionSnapshot }) {
  const top = topSuspicion(perception);
  return (
    <div className="rounded border border-canon-border/40 bg-canon-bg/30 p-2 space-y-1">
      <div className="text-[10px] text-canon-muted">как видел мир</div>
      <div className="text-[10px] text-canon-faint">живы: {perception.aliveOrder.map(labelId).join(', ')}</div>
      <div className="text-[10px] text-canon-faint">
        day-field: claims {perception.publicField.claimCount} · accuse {Object.values(perception.publicField.accusationCounts).reduce((a, b) => a + b, 0)} · defend {Object.values(perception.publicField.defenseCounts).reduce((a, b) => a + b, 0)}
      </div>
      <div className="space-y-1">
        {top.map(([targetId, view]) => (
          <div key={targetId} className="rounded border border-canon-border/20 px-2 py-1 text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-canon-text">{labelId(targetId)}</span>
              <span className="font-mono text-canon-accent">sus {f2(view.suspicion)}</span>
            </div>
            <div className="text-canon-faint">
              trust {f2(view.rel?.trust ?? 0)} · bond {f2(view.rel?.bond ?? 0)} · reliability {f2(view.tom?.reliability ?? 0)} · pub a/d {view.publicSignal.accusedBy}/{view.publicSignal.defendedBy} · knowledge {view.roleKnowledge}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidatesCard({ candidates }: { candidates: Array<{ label: string; included: boolean; reason: string }> }) {
  return (
    <div className="rounded border border-canon-border/40 bg-canon-bg/30 p-2 space-y-1">
      <div className="text-[10px] text-canon-muted">между кем выбирал</div>
      <div className="space-y-0.5 text-[10px]">
        {candidates.map((c) => (
          <div key={`${c.label}:${c.reason}`} className={c.included ? 'text-canon-text' : 'text-canon-faint'}>
            {c.included ? '•' : '×'} {c.label} — {c.reason}
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedCard({ ranked }: { ranked: Array<Record<string, unknown>> }) {
  return (
    <div className="rounded border border-canon-border/40 bg-canon-bg/30 p-2 space-y-1">
      <div className="text-[10px] text-canon-muted">оценки вариантов</div>
      <div className="space-y-1 text-[10px] font-mono">
        {ranked.slice(0, 6).map((row, idx) => {
          const label = labelId(String(row.targetId ?? row.kind ?? row.targetId ?? idx));
          const extras = Object.entries(row)
            .filter(([k]) => !['targetId', 'kind', 'u', 'chosen'].includes(k))
            .slice(0, 5)
            .map(([k, v]) => `${k}=${typeof v === 'number' ? f2(v) : String(v)}`)
            .join(' · ');
          return (
            <div key={`${label}:${idx}`} className={`rounded px-2 py-1 ${row.chosen ? 'bg-canon-accent/10 text-canon-accent' : 'bg-canon-bg/50 text-canon-text'}`}>
              <div>{row.kind ?? 'target'} {label} · u={f2(Number(row.u ?? 0))}{row.chosen ? ' · chosen' : ''}</div>
              {extras && <div className="text-canon-faint">{extras}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DecisionCard({
  title,
  actorId,
  trace,
}: {
  title: string;
  actorId: string;
  trace: ClaimTrace | VoteTrace | NightTrace;
}) {
  return (
    <div className="rounded-lg border border-canon-border/50 bg-canon-card p-3 space-y-2">
      <div className="text-[11px] font-semibold text-canon-text">{title} · {labelId(actorId)}</div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        <PerceptionCard perception={trace.perception} />
        <CandidatesCard candidates={trace.candidates} />
        <RankedCard ranked={trace.ranked as Array<Record<string, unknown>>} />
        <SamplingCard trace={trace} />
      </div>
    </div>
  );
}

export const MafiaTracePanel: React.FC<{ result: MafiaGameResult | null }> = ({ result }) => {
  if (!result) return null;
  const { state } = result;
  return (
    <div className="rounded-lg border border-canon-border bg-canon-panel p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-canon-text">MafiaLab explainability</div>
        <div className="text-[11px] text-canon-muted mt-1">
          seed {state.config.seed ?? 42} · winner {state.winner ?? '—'} · роли: {state.config.players.map(pid => `${labelId(pid)}=${state.roles[pid]}`).join(', ')}
        </div>
      </div>

      {state.history.days.map((day) => {
        const dayLedger = state.suspicionLedger.filter((d) => d.cycle === day.cycle && d.phase === 'day');
        const night = state.history.nights.find((n) => n.cycle === day.cycle);
        const nightLedger = state.suspicionLedger.filter((d) => d.cycle === day.cycle && d.phase === 'night');
        return (
          <details key={`cycle-${day.cycle}`} className="rounded border border-canon-border/50 bg-canon-bg/20 p-3" open={day.cycle === 1}>
            <summary className="cursor-pointer text-sm font-semibold text-canon-text">Цикл {day.cycle} · day elim {labelId(day.eliminatedId)}</summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-canon-muted">claims</div>
                {day.claims.map((claim, idx) => (
                  <DecisionCard key={`claim-${day.cycle}-${idx}`} title={`${claim.kind}${claim.targetId ? ` → ${labelId(claim.targetId)}` : ''}`} actorId={claim.actorId} trace={claim.reasoning} />
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-canon-muted">votes</div>
                {day.votes.map((vote, idx) => (
                  <DecisionCard key={`vote-${day.cycle}-${idx}`} title={`vote → ${labelId(vote.targetId)}`} actorId={vote.voterId} trace={vote.reasoning} />
                ))}
              </div>

              <div className="rounded border border-canon-border/40 bg-canon-bg/30 p-2">
                <div className="text-[10px] text-canon-muted mb-1">suspicion deltas после дня</div>
                <div className="space-y-0.5 text-[10px] font-mono">
                  {dayLedger.slice(-20).map((d, idx) => (
                    <div key={`d-${idx}`} className="text-canon-faint">{labelId(d.observerId)} → {labelId(d.targetId)}: {f2(d.before)} {d.delta >= 0 ? '+' : ''}{f2(d.delta)} = {f2(d.after)} · {d.reason}</div>
                  ))}
                </div>
              </div>

              {night && (
                <div className="space-y-2 pt-2 border-t border-canon-border/30">
                  <div className="text-[11px] uppercase tracking-wide text-canon-muted">night · killed {labelId(night.killedId)}</div>
                  {night.traces.map((trace, idx) => (
                    <DecisionCard key={`night-${day.cycle}-${idx}`} title={`${trace.kind} → ${labelId(trace.chosenTargetId)}`} actorId={trace.actorId} trace={trace} />
                  ))}
                  <div className="rounded border border-canon-border/40 bg-canon-bg/30 p-2">
                    <div className="text-[10px] text-canon-muted mb-1">suspicion deltas после ночи</div>
                    <div className="space-y-0.5 text-[10px] font-mono">
                      {nightLedger.slice(-20).map((d, idx) => (
                        <div key={`n-${idx}`} className="text-canon-faint">{labelId(d.observerId)} → {labelId(d.targetId)}: {f2(d.before)} {d.delta >= 0 ? '+' : ''}{f2(d.delta)} = {f2(d.after)} · {d.reason}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
};
