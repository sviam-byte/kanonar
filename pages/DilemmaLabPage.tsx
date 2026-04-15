import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CATALOG, getSpec, allSpecs } from '../lib/dilemma/catalog';
import { advanceGame, createGame, isGameOver } from '../lib/dilemma/engine';
import { analyzeGame, bestStrategy } from '../lib/dilemma/analysis';
import { runDilemmaGame } from '../lib/dilemma/runner';
import type {
  DilemmaGameState,
  DilemmaSpec,
  StrategyMatchScores,
} from '../lib/dilemma/types';
import type { WorldState, AgentState, CharacterEntity } from '../types';
import { useSandbox } from '../contexts/SandboxContext';
import { getAllCharactersWithRuntime } from '../data';
import { Tabs } from '../components/Tabs';

// ═══════════════════════════════════════════════════════════════
// Types & constants
// ═══════════════════════════════════════════════════════════════

type Mode = 'idle' | 'manual' | 'pipeline';

const ICONS: Record<string, string> = {
  prisoners_dilemma: '⛓',
  stag_hunt: '🦌',
  chicken: '🦅',
  trust_game: '🤝',
};

const STRAT_LABEL: Record<string, string> = {
  titForTat: 'Tit for Tat',
  alwaysCooperate: 'Always Cooperate',
  alwaysDefect: 'Always Defect',
  pavlov: 'Pavlov',
  grimTrigger: 'Grim Trigger',
};

const STRAT_COLOR: Record<string, string> = {
  titForTat: '#66d9ff',
  alwaysCooperate: '#42f5b3',
  alwaysDefect: '#ff5c7a',
  pavlov: '#9b87ff',
  grimTrigger: '#ffaa44',
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Преобразует possibility-id из trace обратно в id действия дилеммы.
 * Нужен для читабельного вывода трасс и нарративных меток.
 */
function possIdToActionId(possId: string, spec: DilemmaSpec): string | null {
  for (const a of spec.actions) {
    const m = spec.scoringMap[a.id];
    if (m && possId.startsWith(m.idPrefix)) return a.id;
  }
  return null;
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const f2 = (v: number) => v.toFixed(2);

/**
 * Безопасно скачивает JSON как файл.
 * Используем единый helper для экспорта полной сессии Dilemma Lab.
 */
function downloadJson(payload: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Минимально валидное world-состояние для pipeline runner.
 * Держим структуру явной, чтобы не ломать границы API model -> runner.
 */
function buildMinimalWorld(
  characters: { entityId: string; [k: string]: unknown }[],
): WorldState {
  return {
    tick: 0,
    agents: characters as unknown as AgentState[],
    locations: [],
    leadership: { leaderId: null } as WorldState['leadership'],
    initialRelations: {},
  };
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

/* ── Dilemma card ── */

const DilemmaCard: React.FC<{
  spec: DilemmaSpec; selected: boolean; onClick: () => void;
}> = ({ spec, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`text-left p-3 rounded-lg border transition-all ${selected
      ? 'border-canon-accent bg-canon-accent/10 shadow-canon-1'
      : 'border-canon-border bg-canon-card hover:border-canon-accent/40'
      }`}
  >
    <div className="flex items-center gap-2">
      <span className="text-lg">{ICONS[spec.id] ?? '◆'}</span>
      <span className={`text-sm font-semibold ${selected ? 'text-canon-accent' : 'text-canon-text'}`}>
        {spec.name}
      </span>
    </div>
    <div className="text-[11px] text-canon-muted mt-1 line-clamp-2">
      Nash: [{spec.nashEquilibria.map((e) => e.join('+')).join(', ')}]
      {' · '}
      Pareto: [{spec.paretoOptimal.map((e) => e.join('+')).join(', ')}]
    </div>
  </button>
);

/* ── Payoff matrix ── */

const PayoffMatrixView: React.FC<{
  spec: DilemmaSpec;
  narrative: boolean;
  highlight?: { a0: string; a1: string } | null;
}> = ({ spec, narrative, highlight }) => {
  const acts = spec.actions;
  const isNash = (a0: string, a1: string) =>
    spec.nashEquilibria.some(([n0, n1]) => n0 === a0 && n1 === a1);
  const isPareto = (a0: string, a1: string) =>
    spec.paretoOptimal.some(([p0, p1]) => p0 === a0 && p1 === a1);
  const lbl = (id: string) =>
    narrative ? (spec.framing.actionLabels[id] ?? id) : id;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Payoff Matrix</div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-2 text-canon-muted font-normal text-left border-b border-canon-border">A↓ · B→</th>
            {acts.map((a) => (
              <th key={a.id} className="p-2 text-canon-text font-semibold border-b border-canon-border text-center">
                {lbl(a.id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {acts.map((a0) => (
            <tr key={a0.id}>
              <td className="p-2 text-canon-text font-semibold border-b border-canon-border/50">{lbl(a0.id)}</td>
              {acts.map((a1) => {
                const [p0, p1] = spec.payoffs[a0.id][a1.id];
                const hl = highlight?.a0 === a0.id && highlight?.a1 === a1.id;
                const badges: string[] = [];
                if (isNash(a0.id, a1.id)) badges.push('N');
                if (isPareto(a0.id, a1.id)) badges.push('P');
                return (
                  <td
                    key={a1.id}
                    className={`p-2 text-center border-b border-canon-border/50 transition-colors ${hl ? 'bg-canon-accent/15' : ''}`}
                  >
                    <div className="font-mono">
                      <span className="text-canon-accent">{f2(p0)}</span>
                      <span className="text-canon-muted mx-1">/</span>
                      <span className="text-canon-accent-2">{f2(p1)}</span>
                    </div>
                    {badges.length > 0 && (
                      <div className="flex gap-1 justify-center mt-1">
                        {badges.includes('N') && <span className="text-[9px] px-1 rounded bg-canon-bad/20 text-canon-bad">Nash</span>}
                        {badges.includes('P') && <span className="text-[9px] px-1 rounded bg-canon-good/20 text-canon-good">Pareto</span>}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ── Cooperation curve (SVG) ── */

const CoopCurveChart: React.FC<{
  curve: number[];
  players: readonly [string, string];
  game: DilemmaGameState;
  spec: DilemmaSpec;
}> = ({ curve, players, game, spec }) => {
  if (curve.length === 0) return <div className="text-xs text-canon-muted italic">Нет данных</div>;

  const W = 480; const H = 160;
  const pad = { top: 16, right: 16, bottom: 28, left: 36 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const n = curve.length;
  const xStep = n > 1 ? iw / (n - 1) : iw;
  const toX = (i: number) => pad.left + (n > 1 ? i * xStep : iw / 2);
  const toY = (v: number) => pad.top + ih * (1 - v);

  const p0Coop = game.rounds.map((r) => (r.choices[players[0]] === spec.cooperativeActionId ? 1 : 0));
  const p1Coop = game.rounds.map((r) => (r.choices[players[1]] === spec.cooperativeActionId ? 1 : 0));
  const makeLine = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={W - pad.right} y1={toY(v)} y2={toY(v)}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <text x={pad.left - 4} y={toY(v) + 3} textAnchor="end"
            fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="monospace">{pct(v)}</text>
        </g>
      ))}
      {curve.map((_, i) => (
        <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
          fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="monospace">R{i + 1}</text>
      ))}
      <path d={makeLine(curve)} fill="none" stroke="#66d9ff" strokeWidth={2} opacity={0.8} />
      {curve.map((v, i) => <circle key={i} cx={toX(i)} cy={toY(v)} r={3} fill="#66d9ff" />)}
      {p0Coop.map((v, i) => (
        <circle key={`a${i}`} cx={toX(i) - 4} cy={toY(v)} r={2.5} fill={v ? '#42f5b3' : '#ff5c7a'} opacity={0.7} />
      ))}
      {p1Coop.map((v, i) => (
        <circle key={`b${i}`} cx={toX(i) + 4} cy={toY(v)} r={2.5}
          fill={v ? '#42f5b3' : '#ff5c7a'} opacity={0.7} stroke="#9b87ff" strokeWidth={0.8} />
      ))}
      <circle cx={pad.left + 8} cy={8} r={3} fill="#66d9ff" />
      <text x={pad.left + 16} y={11} fill="rgba(255,255,255,0.5)" fontSize={8}>avg</text>
      <circle cx={pad.left + 48} cy={8} r={3} fill="#42f5b3" />
      <text x={pad.left + 56} y={11} fill="rgba(255,255,255,0.5)" fontSize={8}>coop</text>
      <circle cx={pad.left + 88} cy={8} r={3} fill="#ff5c7a" />
      <text x={pad.left + 96} y={11} fill="rgba(255,255,255,0.5)" fontSize={8}>defect</text>
    </svg>
  );
};

/* ── Trust & DRME evolution chart ── */

const TrustEvolutionChart: React.FC<{
  game: DilemmaGameState;
}> = ({ game }) => {
  const rounds = game.rounds;
  if (rounds.length < 2) return <div className="text-xs text-canon-muted italic">Нужно 2+ раунда</div>;
  const [p0, p1] = game.players;

  const W = 480; const H = 200;
  const pad = { top: 20, right: 16, bottom: 28, left: 40 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const n = rounds.length;
  const xStep = n > 1 ? iw / (n - 1) : iw;
  const toX = (i: number) => pad.left + (n > 1 ? i * xStep : iw / 2);

  // Extract per-round data
  const p0Trust = rounds.map((r) => r.traces[p0]?.trustComposite ?? 0.5);
  const p1Trust = rounds.map((r) => r.traces[p1]?.trustComposite ?? 0.5);
  const p0Shock = rounds.map((r) => r.traces[p0]?.betrayalShock ?? 0);
  const p1Shock = rounds.map((r) => r.traces[p1]?.betrayalShock ?? 0);

  // Scale: trust 0..1, shock 0..1
  const toY = (v: number) => pad.top + ih * (1 - v);
  const makeLine = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={W - pad.right} y1={toY(v)} y2={toY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <text x={pad.left - 4} y={toY(v) + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="monospace">{pct(v)}</text>
        </g>
      ))}
      {rounds.map((_, i) => (
        <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="monospace">R{i + 1}</text>
      ))}

      {/* Trust lines */}
      <path d={makeLine(p0Trust)} fill="none" stroke="#66d9ff" strokeWidth={2} opacity={0.9} />
      <path d={makeLine(p1Trust)} fill="none" stroke="#9b87ff" strokeWidth={2} opacity={0.9} />
      {p0Trust.map((v, i) => <circle key={`t0${i}`} cx={toX(i)} cy={toY(v)} r={2.5} fill="#66d9ff" />)}
      {p1Trust.map((v, i) => <circle key={`t1${i}`} cx={toX(i)} cy={toY(v)} r={2.5} fill="#9b87ff" />)}

      {/* Shock bars */}
      {p0Shock.map((v, i) => (v > 0.01 ? <circle key={`s0${i}`} cx={toX(i) - 3} cy={toY(0) + 2} r={Math.min(4, v * 6)} fill="#ff5c7a" opacity={0.7} /> : null))}
      {p1Shock.map((v, i) => (v > 0.01 ? <circle key={`s1${i}`} cx={toX(i) + 3} cy={toY(0) + 2} r={Math.min(4, v * 6)} fill="#ff5c7a" opacity={0.7} /> : null))}

      {/* Legend */}
      <line x1={pad.left + 8} y1={10} x2={pad.left + 20} y2={10} stroke="#66d9ff" strokeWidth={2} />
      <text x={pad.left + 24} y={13} fill="rgba(255,255,255,0.5)" fontSize={8}>A trust</text>
      <line x1={pad.left + 68} y1={10} x2={pad.left + 80} y2={10} stroke="#9b87ff" strokeWidth={2} />
      <text x={pad.left + 84} y={13} fill="rgba(255,255,255,0.5)" fontSize={8}>B trust</text>
      <circle cx={pad.left + 128} cy={10} r={3} fill="#ff5c7a" />
      <text x={pad.left + 134} y={13} fill="rgba(255,255,255,0.5)" fontSize={8}>shock</text>
    </svg>
  );
};

/* ── Strategy bars ── */

const StrategyBars: React.FC<{ scores: StrategyMatchScores; label: string }> = ({ scores, label }) => {
  const entries = Object.entries(scores) as [string, number][];
  const best = bestStrategy(scores);
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-canon-muted">{label}</div>
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <div className="text-[10px] text-canon-muted w-28 text-right truncate">{STRAT_LABEL[key] ?? key}</div>
          <div className="flex-1 h-3 bg-canon-bg rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.max(2, val * 100)}%`,
              backgroundColor: STRAT_COLOR[key] ?? '#66d9ff',
              opacity: best.name === (STRAT_LABEL[key] ?? key) ? 1 : 0.5,
            }} />
          </div>
          <div className="text-[10px] font-mono text-canon-muted w-10 text-right">{pct(val)}</div>
        </div>
      ))}
    </div>
  );
};

/* ── Hesitation badge ── */

const HesitationBadge: React.FC<{ qMargin: number }> = ({ qMargin }) => {
  const abs = Math.abs(qMargin);
  let label: string;
  let color: string;
  if (abs < 0.03) { label = 'колеблется'; color = 'text-yellow-400 bg-yellow-400/15'; }
  else if (abs < 0.10) { label = 'неуверен'; color = 'text-orange-300 bg-orange-300/10'; }
  else { label = 'уверен'; color = 'text-canon-good bg-canon-good/10'; }
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {label} <span className="opacity-60">ΔQ={abs.toFixed(3)}</span>
    </span>
  );
};

/* ── Mini bar for a 0..1 value ── */

const MiniBar: React.FC<{ value: number; label: string; color?: string; signed?: boolean }> = ({ value, label, color = '#66d9ff', signed }) => (
  <div className="flex items-center gap-1.5 text-[9px]">
    <span className="text-canon-faint w-16 text-right truncate">{label}</span>
    <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden" style={{ maxWidth: 60 }}>
      <div className="h-full rounded-full" style={{
        width: `${Math.max(2, (signed ? Math.abs(value) : value) * 100)}%`,
        backgroundColor: color,
        opacity: 0.8,
      }} />
    </div>
    <span className="font-mono text-canon-muted w-8 text-right">
      {signed ? (value >= 0 ? '+' : '') + value.toFixed(2) : (value * 100).toFixed(0)}
    </span>
  </div>
);

/* ── DRME bar: a single signed value bar for the decomposition ── */

const DRMEBar: React.FC<{ label: string; value: number; maxAbs?: number; color: string; desc?: string }> = ({ label, value, maxAbs = 0.6, color, desc }) => {
  const pct = Math.abs(value) / maxAbs * 50;
  const isPos = value >= 0;
  return (
    <div className="flex items-center gap-1.5 text-[9px]" title={desc}>
      <span className="text-canon-faint w-5 text-right font-bold">{label}</span>
      <div className="flex-1 h-2 bg-canon-bg rounded-full overflow-hidden relative" style={{ maxWidth: 100 }}>
        {/* center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-canon-border/50" />
        <div className="absolute h-full rounded-full" style={{
          width: `${Math.min(50, pct)}%`,
          backgroundColor: color,
          opacity: 0.85,
          left: isPos ? '50%' : `${50 - Math.min(50, pct)}%`,
        }} />
      </div>
      <span className={`font-mono w-10 text-right ${value > 0.01 ? 'text-canon-good' : value < -0.01 ? 'text-canon-bad' : 'text-canon-faint'}`}>
        {value >= 0 ? '+' : ''}{value.toFixed(3)}
      </span>
    </div>
  );
};

/* ── Single trace block ── */

const TraceBlock: React.FC<{
  round: number; spec: DilemmaSpec; game: DilemmaGameState; narrative: boolean;
}> = ({ round, spec, game, narrative }) => {
  const [open, setOpen] = useState(round === game.rounds.length - 1);
  const r = game.rounds[round];
  if (!r) return null;
  const [p0, p1] = game.players;

  const aLabel = (actionId: string) => {
    if (narrative && spec.framing.actionLabels[actionId]) return spec.framing.actionLabels[actionId];
    return spec.actions.find((a) => a.id === actionId)?.label ?? actionId;
  };

  const TRAIT_SHORT: Record<string, string> = {
    A_Safety_Care: 'safety', A_Power_Sovereignty: 'power', A_Liberty_Autonomy: 'liberty',
    A_Knowledge_Truth: 'truth', A_Tradition_Continuity: 'tradition', A_Legitimacy_Procedure: 'procedure',
    C_reciprocity_index: 'reciproc.', C_betrayal_cost: 'betray₋cost', C_coalition_loyalty: 'coalition',
    C_reputation_sensitivity: 'reput.', C_dominance_empathy: 'empathy',
    B_exploration_rate: 'explore', B_tolerance_ambiguity: 'ambiguity', B_decision_temperature: 'temp',
    B_goal_coherence: 'coherence', B_discount_rate: 'discount',
  };

  const renderTrace = (pid: string, accentClass: string) => {
    const t = r.traces[pid];
    if (!t || t.ranked.length === 0) {
      return <div className="text-[10px] text-canon-muted italic">Trace недоступен (manual mode)</div>;
    }

    const sorted = [...t.ranked].sort((a, b) => b.q - a.q);
    const chosen = t.ranked.find((a) => a.chosen);

    const relEntries = t.relSnapshot
      ? Object.entries(t.relSnapshot).filter(([, v]) => Math.abs(v) > 0.01)
      : [];

    return (
      <div className="space-y-2">
        {/* Header: trust + hesitation + temperature */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[10px] text-canon-muted">
            trust = <span className={`font-mono ${accentClass}`}>{f2(t.trustComposite)}</span>
          </div>
          <HesitationBadge qMargin={t.qMargin} />
          <span className="text-[9px] text-canon-faint font-mono">T={f2(t.temperature)}</span>
        </div>

        {/* Ranked actions with Q */}
        {sorted.map((e, i) => (
          <div key={i} className={`flex items-center gap-2 text-[10px] px-1.5 py-0.5 rounded ${e.chosen ? 'bg-canon-accent/10 text-canon-accent' : 'text-canon-muted'}`}>
            <span className="font-mono w-14 text-right">Q={f2(e.q)}</span>
            <span className="flex-1 truncate">{aLabel(e.actionId)}</span>
            {e.chosen && <span className="text-[9px] text-canon-accent">◀</span>}
          </div>
        ))}

        {/* D/R/M/E decomposition for chosen action */}
        {chosen && (
          <div className="mt-1 bg-canon-bg/50 rounded-lg p-2 space-y-0.5">
            <div className="text-[9px] text-canon-muted font-semibold mb-1">
              U({aLabel(chosen.actionId)}) = D + R + M + P + E
            </div>
            <DRMEBar label="D" value={chosen.D} color="#9b87ff"
              desc={`Disposition: cooperative_disp = ${f2(t.cooperativeDisposition)}`} />
            <DRMEBar label="R" value={chosen.R} color="#66d9ff"
              desc={`Relational: trust_composite = ${f2(t.trustComposite)}`} />
            <DRMEBar label="M" value={chosen.M} color="#42f5b3"
              desc={`Momentum: opp_ema = ${f2(t.oppEma)}, trend = ${f2(t.oppTrend)}, inertia = ${t.myInertia}, shock = ${f2(t.betrayalShock)}`} />
            <DRMEBar label="P" value={chosen.P} color="#ff79c6"
              desc={`Payoff: EV = ${f2(t.evPerAction[chosen.actionId] ?? 0)}`} />
            <DRMEBar label="E" value={chosen.E} color="#ffaa44"
              desc={`Endgame: shadow = ${f2(t.effectiveShadow)}`} />
          </div>
        )}

        {/* Compare D/R/M/E for ALL actions */}
        {sorted.length > 1 && (
          <details className="text-[10px]">
            <summary className="text-canon-muted cursor-pointer hover:text-canon-text">
              сравнить все действия
            </summary>
            <div className="mt-1 space-y-2">
              {sorted.map((a) => (
                <div key={a.actionId} className={`p-1.5 rounded ${a.chosen ? 'bg-canon-accent/5' : ''}`}>
                  <div className="text-[9px] font-semibold text-canon-muted mb-0.5">
                    {aLabel(a.actionId)} {a.chosen ? '◀' : ''} Q={f2(a.q)}
                  </div>
                  <div className="space-y-0.5">
                    <DRMEBar label="D" value={a.D} color="#9b87ff" />
                    <DRMEBar label="R" value={a.R} color="#66d9ff" />
                    <DRMEBar label="M" value={a.M} color="#42f5b3" />
                    <DRMEBar label="P" value={a.P} color="#ff79c6" />
                    <DRMEBar label="E" value={a.E} color="#ffaa44" />
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Momentum details */}
        <details className="text-[10px]">
          <summary className="text-canon-muted cursor-pointer hover:text-canon-text">
            📈 momentum
          </summary>
          <div className="mt-1 space-y-0.5 pl-1">
            <MiniBar label="opp_ema" value={t.oppEma} color="#42f5b3" />
            <MiniBar label="trend" value={t.oppTrend} color={t.oppTrend >= 0 ? '#42f5b3' : '#ff5c7a'} signed />
            <div className="flex items-center gap-1.5 text-[9px]">
              <span className="text-canon-faint w-16 text-right">inertia</span>
              <span className={`font-mono ${t.myInertia > 0 ? 'text-canon-good' : t.myInertia < 0 ? 'text-canon-bad' : 'text-canon-faint'}`}>
                {t.myInertia > 0 ? '→ coop' : t.myInertia < 0 ? '→ defect' : 'neutral'}
              </span>
            </div>
            {t.betrayalShock > 0.01 && (
              <MiniBar label="shock" value={t.betrayalShock} color="#ff5c7a" />
            )}
            <MiniBar label="shadow" value={t.effectiveShadow} color="#ffaa44" />
          </div>
        </details>

        {/* EV per action */}
        {Object.keys(t.evPerAction).length > 0 && (
          <details className="text-[10px]">
            <summary className="text-canon-muted cursor-pointer hover:text-canon-text">
              📊 EV (payoff × prediction)
            </summary>
            <div className="mt-1 space-y-0.5 pl-1">
              {Object.entries(t.evPerAction).map(([aid, ev]) => (
                <MiniBar key={aid} label={aLabel(aid)} value={ev} color="#ff79c6" />
              ))}
              <div className="text-[8px] text-canon-faint mt-1">
                P(opp coop) = {(t.oppEma * 100).toFixed(0)}%
              </div>
            </div>
          </details>
        )}

        {/* Trust composite breakdown */}
        <details className="text-[10px]">
          <summary className="text-canon-muted cursor-pointer hover:text-canon-text">
            🤝 trust composite = {(t.trustComposite * 100).toFixed(0)}
          </summary>
          <div className="mt-1 space-y-0.5 pl-1">
            <MiniBar label="rel.trust" value={t.trustComponents.relTrust} color="#9b87ff" />
            <MiniBar label="rel.bond" value={t.trustComponents.relBond} color="#9b87ff" />
            <MiniBar label="1−conflict" value={1 - t.trustComponents.relConflict} color="#9b87ff" />
            <MiniBar label="tom.trust" value={t.trustComponents.tomTrust} color="#ffaa44" />
            <MiniBar label="tom.reliab" value={t.trustComponents.tomReliability} color="#ffaa44" />
            <MiniBar label="2nd:trust" value={t.trustComponents.soPerceivedTrust} color="#ffaa44" />
          </div>
        </details>

        {/* Relationship */}
        {relEntries.length > 0 && (
          <details className="text-[10px]">
            <summary className="text-canon-muted cursor-pointer hover:text-canon-text">
              rel ({relEntries.length})
            </summary>
            <div className="mt-1 space-y-0.5">
              {relEntries.map(([k, v]) => (
                <MiniBar key={k} label={k} value={v} color={k === 'conflict' || k === 'fear' ? '#ff5c7a' : '#9b87ff'} />
              ))}
            </div>
          </details>
        )}

        {/* Traits */}
        {t.traitSnapshot && Object.keys(t.traitSnapshot).length > 0 && (
          <details className="text-[10px]">
            <summary className="text-canon-muted cursor-pointer hover:text-canon-text">
              🧬 traits ({Object.keys(t.traitSnapshot).length})
            </summary>
            <div className="mt-1 space-y-0.5">
              {Object.entries(t.traitSnapshot).map(([k, v]) => (
                <MiniBar key={k} label={TRAIT_SHORT[k] ?? k} value={v} color="#66d9ff" />
              ))}
            </div>
          </details>
        )}
      </div>
    );
  };

  const c0 = r.choices[p0]; const c1 = r.choices[p1];
  const t0 = r.traces[p0];
  const t1 = r.traces[p1];

  const hesitIcon = (t: typeof t0) => {
    if (!t) return '';
    if (t.qMargin < 0.03) return '⚖';
    if (t.qMargin < 0.10) return '~';
    return '';
  };

  return (
    <div className="border border-canon-border/50 rounded-lg bg-canon-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-canon-accent/5 transition text-left">
        <div className="text-xs font-semibold text-canon-text flex items-center gap-2">
          <span className="text-canon-faint">{open ? '▾' : '▸'}</span>
          R{round + 1}
          {(hesitIcon(t0) || hesitIcon(t1)) && (
            <span className="text-[9px] text-yellow-400">
              {hesitIcon(t0) && `A${hesitIcon(t0)}`}
              {hesitIcon(t0) && hesitIcon(t1) && ' '}
              {hesitIcon(t1) && `B${hesitIcon(t1)}`}
            </span>
          )}
        </div>
        <div className="text-[10px] text-canon-muted font-mono">
          {c0} × {c1} → <span className="text-canon-accent">{f2(r.payoffs[p0])}</span> / <span className="text-canon-accent-2">{f2(r.payoffs[p1])}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-3 border-t border-canon-border/30">
          <div>
            <div className="text-[10px] font-semibold text-canon-accent mb-1">{p0}</div>
            {renderTrace(p0, 'text-canon-accent')}
          </div>
          <div>
            <div className="text-[10px] font-semibold text-canon-accent-2 mb-1">{p1}</div>
            {renderTrace(p1, 'text-canon-accent-2')}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Stat card ── */

const Stat: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
  <div className="bg-canon-card border border-canon-border/50 rounded-lg p-3">
    <div className="text-[10px] text-canon-muted uppercase tracking-wider">{label}</div>
    <div className={`text-lg font-mono font-bold mt-0.5 ${color ?? 'text-canon-text'}`}>{value}</div>
    {sub && <div className="text-[10px] text-canon-faint mt-0.5">{sub}</div>}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// Main page component
// ═══════════════════════════════════════════════════════════════

/**
 * DilemmaLabPage
 *
 * Полноценный UI для двух режимов:
 * 1) Pipeline — решения берутся из runDilemmaGame (scorePossibility → decideAction)
 * 2) Manual — действия задаются вручную по раундам
 *
 * Плюс: матрица выплат, история раундов, аналитика и трассы решений.
 */
export const DilemmaLabPage: React.FC = () => {
  const { characters } = useSandbox();

  // Config
  const specIds = useMemo(() => Object.keys(CATALOG), []);
  const [specId, setSpecId] = useState(specIds[0] ?? 'prisoners_dilemma');
  const [totalRounds, setTotalRounds] = useState(10);
  const [p0, setP0] = useState('');
  const [p1, setP1] = useState('');
  const [initialTrust, setInitialTrust] = useState<number | null>(null); // null = auto pair-specific
  const [narrative, setNarrative] = useState(false);
  const [seed, setSeed] = useState(42);

  // State
  const [mode, setMode] = useState<Mode>('idle');
  const [game, setGame] = useState<DilemmaGameState | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [manualA0, setManualA0] = useState('');
  const [manualA1, setManualA1] = useState('');

  const spec = getSpec(specId);
  const analysis = game ? analyzeGame(spec, game) : null;

  /**
   * Объединяем базовый реестр персонажей и sandbox-персонажей.
   * Sandbox имеет приоритет (override), чтобы UI всегда отражал текущую сессию.
   */
  const allCharacters = useMemo(() => {
    const base = getAllCharactersWithRuntime();
    const map = new Map<string, CharacterEntity>();

    for (const c of base) map.set(c.entityId, c);
    for (const c of characters) map.set(c.entityId, c as CharacterEntity);

    return Array.from(map.values());
  }, [characters]);

  const agentOptions = useMemo(
    () => allCharacters.map((c) => ({ id: c.entityId, label: c.title || c.entityId })),
    [allCharacters],
  );

  // Auto-select players from sandbox
  useEffect(() => {
    if (agentOptions.length >= 2) {
      setP0((prev) => (agentOptions.some((a) => a.id === prev) ? prev : agentOptions[0].id));
      setP1((prev) => {
        if (agentOptions.some((a) => a.id === prev) && prev !== agentOptions[0].id) return prev;
        return agentOptions[1]?.id ?? agentOptions[0].id;
      });
    }
  }, [agentOptions]);

  // Reset picks on spec change
  useEffect(() => {
    if (spec.actions.length > 0) {
      setManualA0(spec.actions[0].id);
      setManualA1(spec.actions[0].id);
    }
  }, [specId, spec.actions]);

  // ── Actions ──

  const reset = useCallback(() => {
    setGame(null);
    setMode('idle');
    setPipelineError(null);
  }, []);

  const startManual = useCallback(() => {
    const id0 = p0.trim() || 'agent:a';
    const id1 = p1.trim() || 'agent:b';
    if (id0 === id1) { setPipelineError('Players must be different'); return; }
    try {
      setGame(createGame(spec, [id0, id1], Math.max(1, Math.floor(totalRounds))));
      setMode('manual');
      setPipelineError(null);
    } catch (e) { setPipelineError(String(e)); }
  }, [spec, p0, p1, totalRounds]);

  const startPipeline = useCallback(() => {
    const id0 = p0.trim() || 'agent:a';
    const id1 = p1.trim() || 'agent:b';
    if (id0 === id1) { setPipelineError('Players must be different'); return; }
    setPipelineError(null);
    try {
      const world = buildMinimalWorld(allCharacters);
      const findAgent = (id: string) =>
        world.agents?.find((a) => (a as any).entityId === id || (a as any).id === id);
      if (!findAgent(id0)) throw new Error(`Agent "${id0}" не найден в Sandbox. Добавь персонажей или используй Manual.`);
      if (!findAgent(id1)) throw new Error(`Agent "${id1}" не найден в Sandbox.`);

      const result = runDilemmaGame({
        specId: spec.id,
        players: [id0, id1],
        totalRounds: Math.max(1, Math.floor(totalRounds)),
        world,
        initialTrust: initialTrust ?? undefined,
        seed,
      });
      setGame(result.game);
      setMode('pipeline');
    } catch (e: unknown) {
      setPipelineError(e instanceof Error ? e.message : String(e));
      setMode('idle');
    }
  }, [spec, p0, p1, totalRounds, initialTrust, seed, allCharacters]);

  const playManualRound = useCallback(() => {
    if (!game || isGameOver(game)) return;
    try {
      setGame(advanceGame(spec, game, {
        [game.players[0]]: manualA0 || spec.actions[0].id,
        [game.players[1]]: manualA1 || spec.actions[0].id,
      }));
    } catch (e) { console.error('[DilemmaLab] advanceGame failed', e); }
  }, [game, spec, manualA0, manualA1]);

  const actionLabel = (actionId: string) => {
    if (narrative && spec.framing.actionLabels[actionId]) return spec.framing.actionLabels[actionId];
    return spec.actions.find((a) => a.id === actionId)?.label ?? actionId;
  };

  const lastRound = game?.rounds[game.rounds.length - 1] ?? null;
  const lastOutcome = lastRound && narrative && game
    ? spec.framing.outcomeDescriptions[lastRound.choices[game.players[0]]]?.[lastRound.choices[game.players[1]]]
    : null;

  /**
   * Экспортирует полностью одну игровую сессию:
   * - конфиг запуска,
   * - спецификацию дилеммы,
   * - все раунды + pipeline traces/расчёты,
   * - агрегированную аналитику.
   *
   * Это позволяет воспроизвести и оффлайн разбирать конкретную игру.
   */
  const downloadSession = useCallback(() => {
    if (!game) return;
    const exportedAt = new Date().toISOString();
    const [id0, id1] = game.players;
    const playerCharacters = allCharacters.filter((c) => c.entityId === id0 || c.entityId === id1);
    const payload = {
      schema: 'DilemmaLabSessionExportV1',
      exportedAt,
      config: {
        mode,
        narrative,
        seed,
        initialTrust,
        selectedSpecId: spec.id,
        selectedPlayers: game.players,
        totalRoundsRequested: totalRounds,
      },
      spec,
      game,
      analysis,
      /**
       * Снимок персонажей-участников в момент экспорта:
       * помогает сравнивать сессии между разными версиями sandbox/world.
       */
      participants: playerCharacters,
    };
    const safeSpec = spec.id.replace(/[^a-z0-9_-]/gi, '_');
    const safeP0 = id0.replace(/[^a-z0-9_-]/gi, '_');
    const safeP1 = id1.replace(/[^a-z0-9_-]/gi, '_');
    const stamp = exportedAt.replace(/[:.]/g, '-');
    downloadJson(payload, `dilemma-lab__${safeSpec}__${safeP0}__${safeP1}__${stamp}.json`);
  }, [game, mode, narrative, seed, initialTrust, spec, totalRounds, analysis, allCharacters]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-canon-text flex items-center gap-2">
          <span className="text-canon-accent">◆</span> DilemmaLab
        </h1>
        <p className="text-xs text-canon-muted mt-1">
          Формальные дилеммы теории игр для тестирования decision pipeline.
          <span className="text-canon-accent"> Pipeline</span> прогоняет через scorePossibility → decideAction.
          <span className="text-canon-text"> Manual</span> — ручной ввод действий.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-canon-panel border border-canon-border rounded-lg p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">Дилемма</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {allSpecs().map((s) => (
                <DilemmaCard key={s.id} spec={s} selected={specId === s.id}
                  onClick={() => { setSpecId(s.id); reset(); }} />
              ))}
            </div>
          </div>

          {narrative && (
            <div className="text-xs text-canon-muted bg-canon-card border border-canon-border/50 rounded-lg p-3 italic">
              {spec.framing.setup}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <label className="text-xs text-canon-muted">
              Player A
              {agentOptions.length > 0 ? (
                <select value={p0} onChange={(e) => setP0(e.target.value)}
                  className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text">
                  {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              ) : (
                <input value={p0} onChange={(e) => setP0(e.target.value)} placeholder="agent:a"
                  className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text" />
              )}
            </label>
            <label className="text-xs text-canon-muted">
              Player B
              {agentOptions.length > 0 ? (
                <select value={p1} onChange={(e) => setP1(e.target.value)}
                  className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text">
                  {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              ) : (
                <input value={p1} onChange={(e) => setP1(e.target.value)} placeholder="agent:b"
                  className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text" />
              )}
            </label>
            <label className="text-xs text-canon-muted">
              Rounds
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min={1} max={50} value={totalRounds}
                  onChange={(e) => setTotalRounds(Number(e.target.value))}
                  className="flex-1 accent-canon-accent" />
                <span className="text-sm font-mono text-canon-text w-8 text-right">{totalRounds}</span>
              </div>
            </label>
            <label className="text-xs text-canon-muted">
              Trust
              <div className="flex items-center gap-1 mt-1">
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input type="checkbox" checked={initialTrust === null}
                    onChange={(e) => setInitialTrust(e.target.checked ? null : 0.5)}
                    className="accent-canon-accent" />
                  <span className="text-[9px]">auto</span>
                </label>
                {initialTrust !== null && (
                  <>
                    <input type="range" min={0} max={100} value={Math.round(initialTrust * 100)}
                      onChange={(e) => setInitialTrust(Number(e.target.value) / 100)}
                      className="flex-1 accent-canon-accent" />
                    <span className="text-sm font-mono text-canon-text w-8 text-right">{f2(initialTrust)}</span>
                  </>
                )}
              </div>
            </label>
            <label className="text-xs text-canon-muted">
              Seed
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={1} max={99999} value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 42)}
                  className="w-full bg-canon-bg border border-canon-border rounded-lg p-2 text-sm font-mono text-canon-text" />
              </div>
            </label>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={startPipeline}
              className="px-4 py-2 rounded-lg bg-canon-accent text-canon-bg text-sm font-bold hover:brightness-110 transition">
              ▶ Pipeline
            </button>
            <button onClick={startManual}
              disabled={mode === 'manual' && game !== null}
              className="px-4 py-2 rounded-lg bg-canon-card border border-canon-border text-sm text-canon-text hover:border-canon-accent/40 transition disabled:opacity-40">
              ✎ Manual
            </button>
            {mode !== 'idle' && (
              <button onClick={reset}
                className="px-3 py-2 rounded-lg bg-canon-card border border-canon-border text-sm text-canon-muted hover:text-canon-bad transition">
                ✕ Reset
              </button>
            )}
            <label className="flex items-center gap-1.5 text-xs text-canon-muted ml-auto cursor-pointer select-none">
              <input type="checkbox" checked={narrative} onChange={(e) => setNarrative(e.target.checked)}
                className="accent-canon-accent" />
              Нарративная обёртка
            </label>
          </div>

          {pipelineError && (
            <div className="text-xs text-canon-bad bg-canon-bad/10 border border-canon-bad/20 rounded-lg p-3">
              {pipelineError}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-canon-panel border border-canon-border rounded-lg p-4">
          <PayoffMatrixView
            spec={spec}
            narrative={narrative}
            highlight={lastRound && game ? { a0: lastRound.choices[game.players[0]], a1: lastRound.choices[game.players[1]] } : null}
          />
          <div className="mt-3 text-[10px] text-canon-faint space-y-0.5">
            <div><span className="text-canon-accent">A</span> / <span className="text-canon-accent-2">B</span> payoffs</div>
            {spec.actions.map((a) => {
              const m = spec.scoringMap[a.id];
              return <div key={a.id}>{a.id} → <span className="font-mono text-canon-muted">{m.idPrefix}</span> ({m.kind})</div>;
            })}
          </div>
        </div>
      </div>

      {game && (
        <div className="bg-canon-panel border border-canon-border rounded-lg overflow-hidden">
          <Tabs syncKey="dlt" className="flex flex-col" contentClassName="min-h-0"
            tabs={[
              {
                label: mode === 'pipeline' ? 'Результаты' : 'Play',
                content: (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-sm font-semibold text-canon-text">
                        {isGameOver(game) ? `Игра завершена · ${game.totalRounds} раундов` : `Round ${game.currentRound + 1} / ${game.totalRounds}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-canon-muted font-mono">
                          {mode === 'pipeline' ? '🔧 Pipeline' : '✎ Manual'} · {spec.name}
                        </div>
                        <button
                          onClick={downloadSession}
                          className="px-2.5 py-1 rounded-md bg-canon-card border border-canon-border text-[11px] text-canon-text hover:border-canon-accent/50 transition"
                          title="Скачать полную сессию (1 игра, все расчёты)"
                        >
                          ⬇ Session JSON
                        </button>
                      </div>
                    </div>

                    {mode === 'pipeline' && game.rounds.length > 0 && (() => {
                      const r0 = game.rounds[0];
                      const t0 = r0?.traces[game.players[0]];
                      const t1 = r0?.traces[game.players[1]];
                      return t0 && t1 ? (
                        <div className="flex gap-4 text-[10px] text-canon-muted">
                          <span>Init trust: <span className="text-canon-accent font-mono">{game.players[0].replace('character-', '')}</span>→ {(t0.relSnapshot?.trust ?? t0.trustComposite)?.toFixed?.(2) ?? '?'}</span>
                          <span><span className="text-canon-accent-2 font-mono">{game.players[1].replace('character-', '')}</span>→ {(t1.relSnapshot?.trust ?? t1.trustComposite)?.toFixed?.(2) ?? '?'}</span>
                          <span>D: <span className="text-canon-accent">{f2(t0.cooperativeDisposition)}</span> / <span className="text-canon-accent-2">{f2(t1.cooperativeDisposition)}</span></span>
                        </div>
                      ) : null;
                    })()}

                    {mode === 'manual' && !isGameOver(game) && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div>
                          <div className="text-xs font-semibold text-canon-accent mb-1.5">{game.players[0]}</div>
                          <div className="space-y-1">
                            {spec.actions.map((a) => (
                              <button key={a.id} onClick={() => setManualA0(a.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${manualA0 === a.id
                                  ? 'border-canon-accent bg-canon-accent/10 text-canon-accent'
                                  : 'border-canon-border bg-canon-card text-canon-muted hover:border-canon-accent/40'}`}>
                                {actionLabel(a.id)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-canon-accent-2 mb-1.5">{game.players[1]}</div>
                          <div className="space-y-1">
                            {spec.actions.map((a) => (
                              <button key={a.id} onClick={() => setManualA1(a.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${manualA1 === a.id
                                  ? 'border-canon-accent-2 bg-canon-accent-2/10 text-canon-accent-2'
                                  : 'border-canon-border bg-canon-card text-canon-muted hover:border-canon-accent-2/40'}`}>
                                {actionLabel(a.id)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button onClick={playManualRound}
                          className="px-4 py-3 rounded-lg bg-canon-accent text-canon-bg font-bold text-sm hover:brightness-110 transition">
                          ▶ Play Round
                        </button>
                      </div>
                    )}

                    {lastOutcome && (
                      <div className="text-xs text-canon-muted bg-canon-card border border-canon-border/50 rounded-lg p-3 italic">
                        {lastOutcome}
                      </div>
                    )}

                    <div>
                      <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">История</div>
                      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                        {game.rounds.length === 0 && <div className="text-xs text-canon-faint italic">Ещё нет раундов</div>}
                        {game.rounds.map((r) => {
                          const c0 = r.choices[game.players[0]];
                          const c1 = r.choices[game.players[1]];
                          return (
                            <div key={r.index}
                              className="flex items-center gap-2 text-xs bg-canon-card border border-canon-border/30 rounded-lg px-3 py-1.5">
                              <span className="text-canon-faint font-mono w-6">R{r.index + 1}</span>
                              <span className={c0 === spec.cooperativeActionId ? 'text-canon-good' : 'text-canon-bad'}>
                                {actionLabel(c0)}
                              </span>
                              <span className="text-canon-faint">×</span>
                              <span className={c1 === spec.cooperativeActionId ? 'text-canon-good' : 'text-canon-bad'}>
                                {actionLabel(c1)}
                              </span>
                              <span className="ml-auto font-mono text-canon-muted">
                                <span className="text-canon-accent">{f2(r.payoffs[game.players[0]])}</span>
                                {' / '}
                                <span className="text-canon-accent-2">{f2(r.payoffs[game.players[1]])}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                label: 'Analysis',
                content: analysis && game ? (
                  <div className="p-4 space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Stat label="Mutual cooperation" value={pct(analysis.mutualCooperationRate)} color="text-canon-good" />
                      <Stat label="Mutual defection" value={pct(analysis.mutualDefectionRate)} color="text-canon-bad" />
                      <Stat label={`Payoff ${game.players[0]}`} value={f2(analysis.totalPayoffs[game.players[0]])}
                        sub={`avg ${f2(analysis.totalPayoffs[game.players[0]] / Math.max(1, game.rounds.length))}/r`}
                        color="text-canon-accent" />
                      <Stat label={`Payoff ${game.players[1]}`} value={f2(analysis.totalPayoffs[game.players[1]])}
                        sub={`avg ${f2(analysis.totalPayoffs[game.players[1]] / Math.max(1, game.rounds.length))}/r`}
                        color="text-canon-accent-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Stat label={`Nash align · ${game.players[0]}`}
                        value={pct(analysis.nashAlignment[game.players[0]] ?? 0)}
                        sub="Доля раундов в Nash eq" />
                      <Stat label={`Nash align · ${game.players[1]}`}
                        value={pct(analysis.nashAlignment[game.players[1]] ?? 0)}
                        sub="Доля раундов в Nash eq" />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">Cooperation Curve</div>
                      <div className="bg-canon-card border border-canon-border/50 rounded-lg p-3">
                        <CoopCurveChart curve={analysis.cooperationCurve} players={game.players} game={game} spec={spec} />
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">Trust Evolution</div>
                      <div className="bg-canon-card border border-canon-border/50 rounded-lg p-3">
                        <TrustEvolutionChart game={game} />
                      </div>
                    </div>

                    {game.rounds.length >= 3 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-canon-card border border-canon-border/50 rounded-lg p-3">
                          <StrategyBars scores={analysis.strategyMatch[game.players[0]]} label={game.players[0]} />
                        </div>
                        <div className="bg-canon-card border border-canon-border/50 rounded-lg p-3">
                          <StrategyBars scores={analysis.strategyMatch[game.players[1]]} label={game.players[1]} />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-canon-faint italic">Strategy matching: нужно 3+ раундов.</div>
                    )}
                  </div>
                ) : <div className="p-4 text-xs text-canon-faint italic">Сыграйте хотя бы один раунд.</div>,
              },
              {
                label: 'Traces',
                content: (
                  <div className="p-4 space-y-3">
                    <div className="text-xs text-canon-muted">
                      Q-values, trust и atoms для каждого решения. Полные traces — в Pipeline mode.
                    </div>
                    {game.rounds.length === 0 && <div className="text-xs text-canon-faint italic">Ещё нет раундов.</div>}
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {game.rounds.map((_, i) => (
                        <TraceBlock key={i} round={i} spec={spec} game={game} narrative={narrative} />
                      ))}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {mode === 'idle' && !game && (
        <div className="text-center py-12 space-y-2">
          <div className="text-3xl opacity-20">◆</div>
          <div className="text-sm text-canon-faint">
            Выбери дилемму и игроков → <span className="text-canon-accent">▶ Pipeline</span> или <span className="text-canon-text">✎ Manual</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DilemmaLabPage;
