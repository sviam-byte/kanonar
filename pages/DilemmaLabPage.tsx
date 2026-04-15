import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { runDilemmaV2 } from '../lib/dilemma/runner';
import { SCENARIO_CATALOG, allScenarios, getScenario } from '../lib/dilemma/scenarios';
import type {
  ScenarioTemplate, V2GameState, V2RoundTrace, V2RunResult,
} from '../lib/dilemma/types';
import type { WorldState, AgentState, CharacterEntity } from '../types';
import { useSandbox } from '../contexts/SandboxContext';
import { getAllCharactersWithRuntime } from '../data';
import { Tabs } from '../components/Tabs';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const CLASS_ICONS: Record<string, string> = {
  trust: '🔍', protection: '🛡', authority: '⚖', loyalty: '🏛',
  sacrifice: '🩸', opacity: '🌫', mutiny: '⚔', care: '💊', bargain: '🤝',
};

const AXIS_META: Record<string, { label: string; color: string; desc: string }> = {
  G: { label: 'G', color: '#9b87ff', desc: 'Goal — служит ли действие цели' },
  R: { label: 'R', color: '#66d9ff', desc: 'Relational — как для отношений' },
  I: { label: 'I', color: '#42f5b3', desc: 'Identity — совместимость с Я' },
  L: { label: 'L', color: '#ffaa44', desc: 'Legitimacy — процедурно' },
  S: { label: 'S', color: '#ff79c6', desc: 'Safety — снижение угрозы' },
  M: { label: 'M', color: '#c9a0ff', desc: 'Mirror — как выгляжу' },
  X: { label: 'X', color: '#ff5c7a', desc: 'Cost — цена (вычитается)' },
};

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

/**
 * Скачивание JSON-отчёта по запуску.
 * Храним в одном helper, чтобы формат экспорта был единообразным.
 */
function downloadJson(payload: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/**
 * Минимальное валидное world-состояние для runner-а.
 * Нужен guard на границе UI -> модель, чтобы запуск не падал из-за отсутствующих полей.
 */
function buildMinimalWorld(chars: { entityId: string; [k: string]: unknown }[]): WorldState {
  return {
    tick: 0,
    agents: chars as unknown as AgentState[],
    locations: [],
    leadership: { leaderId: null } as WorldState['leadership'],
    initialRelations: {},
  };
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

const ScenarioCard: React.FC<{
  s: ScenarioTemplate; selected: boolean; onClick: () => void;
}> = ({ s, selected, onClick }) => (
  <button onClick={onClick}
    className={`text-left p-3 rounded-lg border transition-all ${selected
      ? 'border-canon-accent bg-canon-accent/10 shadow-canon-1'
      : 'border-canon-border bg-canon-card hover:border-canon-accent/40'}`}>
    <div className="flex items-center gap-2">
      <span className="text-lg">{CLASS_ICONS[s.dilemmaClass] ?? '◆'}</span>
      <span className={`text-sm font-semibold ${selected ? 'text-canon-accent' : 'text-canon-text'}`}>{s.name}</span>
    </div>
    <div className="text-[10px] text-canon-muted mt-1 line-clamp-2">
      {s.dilemmaClass} · {s.actionPool.length} действий · давл. {pct(s.institutionalPressure)}
    </div>
  </button>
);

const ConfBadge: React.FC<{ value: number; label?: string }> = ({ value, label }) => {
  const c = value >= 0.7 ? 'text-canon-good bg-canon-good/10' : value >= 0.4 ? 'text-yellow-400 bg-yellow-400/10' : 'text-canon-bad bg-canon-bad/10';
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c}`}>{label ?? 'conf'} {pct(value)}</span>;
};

const AxisBar: React.FC<{ axis: string; value: number; maxAbs?: number }> = ({ axis, value, maxAbs = 0.5 }) => {
  const m = AXIS_META[axis];
  const absPct = Math.abs(value) / maxAbs * 50;
  const isPos = value >= 0;
  return (
    <div className="flex items-center gap-1.5 text-[9px]" title={m?.desc}>
      <span className="text-canon-faint w-4 text-right font-bold" style={{ color: m?.color }}>{m?.label ?? axis}</span>
      <div className="flex-1 h-2 bg-canon-bg rounded-full overflow-hidden relative" style={{ maxWidth: 100 }}>
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-canon-border/50" />
        <div className="absolute h-full rounded-full" style={{
          width: `${Math.min(50, absPct)}%`, backgroundColor: m?.color ?? '#66d9ff', opacity: 0.85,
          left: isPos ? '50%' : `${50 - Math.min(50, absPct)}%`,
        }} />
      </div>
      <span className={`font-mono w-12 text-right ${value > 0.01 ? 'text-canon-good' : value < -0.01 ? 'text-canon-bad' : 'text-canon-faint'}`}>
        {value >= 0 ? '+' : ''}{f3(value)}
      </span>
    </div>
  );
};

const MiniBar: React.FC<{ value: number; label: string; color?: string }> = ({ value, label, color = '#66d9ff' }) => (
  <div className="flex items-center gap-1.5 text-[9px]">
    <span className="text-canon-faint w-20 text-right truncate">{label}</span>
    <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden" style={{ maxWidth: 60 }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.abs(value) * 100)}%`, backgroundColor: color, opacity: 0.8 }} />
    </div>
    <span className="font-mono text-canon-muted w-8 text-right">{f2(value)}</span>
  </div>
);

/* ── V2 trace block ── */

const V2TraceBlock: React.FC<{ round: number; game: V2GameState; scenario: ScenarioTemplate }> = ({ round, game, scenario }) => {
  const [open, setOpen] = useState(round === game.rounds.length - 1);
  const r = game.rounds[round];
  if (!r) return null;
  const [p0, p1] = game.players;
  const aLbl = (id: string) => scenario.actionPool.find(a => a.id === id)?.label ?? id;

  const renderTrace = (pid: string) => {
    const t: V2RoundTrace | undefined = r.traces[pid];
    if (!t) return <div className="text-[10px] text-canon-muted italic">—</div>;
    const sorted = [...t.scores].sort((a, b) => b.U - a.U);
    const chosen = sorted.find(s => s.chosen);

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ConfBadge value={t.compiled.agent.confidence} label="проф" />
          <ConfBadge value={t.compiled.dyad.confidence} label="пара" />
          <span className="text-[9px] text-canon-faint font-mono">τ={f2(t.compiled.agent.effectiveTemperature)} ★={f2(t.compiled.agent.perceivedStakes)}</span>
        </div>

        <div className="text-[10px] text-canon-muted italic bg-canon-bg/50 rounded p-1.5">{t.explanation}</div>

        {sorted.map((s, i) => (
          <div key={i} className={`flex items-center gap-2 text-[10px] px-1.5 py-0.5 rounded ${s.chosen ? 'bg-canon-accent/10 text-canon-accent' : 'text-canon-muted'}`}>
            <span className="font-mono w-14 text-right">U={f2(s.U)}</span>
            <span className="flex-1 truncate">{aLbl(s.actionId)}</span>
            <span className="font-mono text-[8px] text-canon-faint">p={pct(s.probability)}</span>
            {s.chosen && <span className="text-canon-accent">◀</span>}
          </div>
        ))}

        {chosen && (
          <div className="mt-1 bg-canon-bg/50 rounded-lg p-2 space-y-0.5">
            <div className="text-[9px] text-canon-muted font-semibold mb-1">U({aLbl(chosen.actionId)}) = G+R+I+L+S+M−X</div>
            {(['G', 'R', 'I', 'L', 'S', 'M'] as const).map(a => <AxisBar key={a} axis={a} value={(chosen as any)[a]} />)}
            <AxisBar axis="X" value={-(chosen as any).X} />
          </div>
        )}

        {sorted.length > 1 && (
          <details className="text-[10px]">
            <summary className="text-canon-muted cursor-pointer hover:text-canon-text">сравнить все</summary>
            <div className="mt-1 space-y-2">
              {sorted.map(s => (
                <div key={s.actionId} className={`p-1.5 rounded ${s.chosen ? 'bg-canon-accent/5' : ''}`}>
                  <div className="text-[9px] font-semibold text-canon-muted mb-0.5">{aLbl(s.actionId)} {s.chosen ? '◀' : ''} U={f2(s.U)}</div>
                  {(['G', 'R', 'I', 'L', 'S', 'M'] as const).map(a => <AxisBar key={a} axis={a} value={(s as any)[a]} />)}
                  <AxisBar axis="X" value={-(s as any).X} />
                </div>
              ))}
            </div>
          </details>
        )}

        {t.filteredOut.length > 0 && <div className="text-[9px] text-canon-faint">Недоступны: {t.filteredOut.map(aLbl).join(', ')}</div>}

        <details className="text-[10px]">
          <summary className="text-canon-muted cursor-pointer hover:text-canon-text">⚖ веса</summary>
          <div className="mt-1 space-y-0.5 pl-1">
            {Object.entries(t.compiled.agent.weights).map(([k, v]) => <MiniBar key={k} label={k} value={v} color={AXIS_META[k.replace('w', '')]?.color} />)}
          </div>
        </details>

        <details className="text-[10px]">
          <summary className="text-canon-muted cursor-pointer hover:text-canon-text">🤝 пара</summary>
          <div className="mt-1 space-y-0.5 pl-1">
            <MiniBar label="trust" value={t.compiled.dyad.rel.trust} color="#9b87ff" />
            <MiniBar label="bond" value={t.compiled.dyad.rel.bond} color="#9b87ff" />
            <MiniBar label="conflict" value={t.compiled.dyad.rel.conflict} color="#ff5c7a" />
            <MiniBar label="fear" value={t.compiled.dyad.rel.fear} color="#ff5c7a" />
            <MiniBar label="power" value={(t.compiled.dyad.powerAsymmetry + 1) / 2} color="#ffaa44" />
            <MiniBar label="history" value={t.compiled.dyad.sharedHistoryDensity} color="#42f5b3" />
            <MiniBar label="mirror" value={t.compiled.dyad.secondOrder.mirrorIndex} color="#c9a0ff" />
          </div>
        </details>

        <details className="text-[10px]">
          <summary className="text-canon-muted cursor-pointer hover:text-canon-text">📉 update</summary>
          <div className="mt-1 pl-1 text-[9px] font-mono space-y-0.5">
            <div>will: {t.stateUpdate.willDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.willDelta)}</div>
            <div>burnout: +{f3(t.stateUpdate.burnoutDelta)}</div>
            <div>stress: {t.stateUpdate.stressDelta >= 0 ? '+' : ''}{t.stateUpdate.stressDelta}</div>
            <div>Δtrust: {t.stateUpdate.trustDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.trustDelta)}</div>
            <div>Δconflict: {t.stateUpdate.conflictDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.conflictDelta)}</div>
          </div>
        </details>
      </div>
    );
  };

  return (
    <div className="border border-canon-border/50 rounded-lg bg-canon-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-canon-accent/5 transition text-left">
        <div className="text-xs font-semibold text-canon-text flex items-center gap-2">
          <span className="text-canon-faint">{open ? '▾' : '▸'}</span> R{round + 1}
        </div>
        <div className="text-[10px] text-canon-muted font-mono">
          <span className="text-canon-accent">{aLbl(r.choices[p0])}</span>
          <span className="text-canon-faint mx-1">×</span>
          <span className="text-canon-accent-2">{aLbl(r.choices[p1])}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-3 border-t border-canon-border/30">
          <div><div className="text-[10px] font-semibold text-canon-accent mb-1">{p0.replace('character-', '')}</div>{renderTrace(p0)}</div>
          <div><div className="text-[10px] font-semibold text-canon-accent-2 mb-1">{p1.replace('character-', '')}</div>{renderTrace(p1)}</div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

export const DilemmaLabPage: React.FC = () => {
  const { characters } = useSandbox();
  const scenarioIds = useMemo(() => Object.keys(SCENARIO_CATALOG), []);
  const [scenarioId, setScenarioId] = useState(scenarioIds[0] ?? 'trust_interrogation');
  const [totalRounds, setTotalRounds] = useState(10);
  const [p0, setP0] = useState('');
  const [p1, setP1] = useState('');
  const [instPressure, setInstPressure] = useState<number | null>(null);
  const [seed, setSeed] = useState(42);
  const [result, setResult] = useState<V2RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenario = getScenario(scenarioId);
  const game = result?.game ?? null;

  const allChars = useMemo(() => {
    const base = getAllCharactersWithRuntime();
    const m = new Map<string, CharacterEntity>();
    for (const c of base) m.set(c.entityId, c);
    for (const c of characters) m.set(c.entityId, c as CharacterEntity);
    return Array.from(m.values());
  }, [characters]);

  const opts = useMemo(() => allChars.map(c => ({ id: c.entityId, label: c.title || c.entityId })), [allChars]);

  useEffect(() => {
    if (opts.length >= 2) {
      setP0(p => opts.some(a => a.id === p) ? p : opts[0].id);
      setP1(p => {
        if (opts.some(a => a.id === p) && p !== opts[0].id) return p;
        return opts[1]?.id ?? opts[0].id;
      });
    }
  }, [opts]);

  const reset = useCallback(() => { setResult(null); setError(null); }, []);

  /**
   * Запуск v2 раннера с валидацией входных границ:
   * - два различных персонажа;
   * - наличие агентов в world-state.
   */
  const run = useCallback(() => {
    const id0 = p0.trim(); const id1 = p1.trim();
    if (!id0 || !id1 || id0 === id1) {
      setError('Выбери двух разных персонажей');
      return;
    }
    setError(null);
    try {
      const world = buildMinimalWorld(allChars);
      const find = (id: string) => world.agents?.find(a => (a as any).entityId === id || (a as any).id === id);
      if (!find(id0)) throw new Error(`"${id0}" не найден`);
      if (!find(id1)) throw new Error(`"${id1}" не найден`);
      const res = runDilemmaV2({
        scenarioId,
        players: [id0, id1],
        totalRounds: Math.max(1, Math.floor(totalRounds)),
        world,
        seed,
        institutionalPressure: instPressure ?? undefined,
      });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  }, [scenarioId, p0, p1, totalRounds, seed, instPressure, allChars]);

  const download = useCallback(() => {
    if (!game || !result) return;
    const ts = new Date().toISOString();
    const safe = (s: string) => s.replace(/[^a-z0-9_-]/gi, '_');
    downloadJson({ schema: 'DilemmaLabV2', exportedAt: ts, scenarioId, scenario, ...result },
      `dilemma-v2__${safe(scenarioId)}__${safe(game.players[0])}__${safe(game.players[1])}__${ts.replace(/[:.]/g, '-')}.json`);
  }, [game, result, scenarioId, scenario]);

  const actionCounts = useMemo(() => {
    if (!game) return null;
    const c: Record<string, Record<string, number>> = {};
    for (const pid of game.players) {
      c[pid] = {};
      for (const r of game.rounds) {
        const a = r.choices[pid];
        c[pid][a] = (c[pid][a] ?? 0) + 1;
      }
    }
    return c;
  }, [game]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-canon-text flex items-center gap-2">
          <span className="text-canon-accent">◆</span> DilemmaLab v2
        </h1>
        <p className="text-xs text-canon-muted mt-1">Асимметричные сценарии · 7-осевой utility · субъективные ставки · объяснения</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-canon-panel border border-canon-border rounded-lg p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">Сценарий</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {allScenarios().map(s => <ScenarioCard key={s.id} s={s} selected={scenarioId === s.id} onClick={() => { setScenarioId(s.id); reset(); }} />)}
            </div>
          </div>
          <div className="text-xs text-canon-muted bg-canon-card border border-canon-border/50 rounded-lg p-3 italic">{scenario.setup}</div>
          <div className="text-[10px] text-canon-faint">Действия: {scenario.actionPool.map(a => a.label).join(' · ')}</div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <label className="text-xs text-canon-muted">A
              <select value={p0} onChange={e => setP0(e.target.value)} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text">
                {opts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-canon-muted">B
              <select value={p1} onChange={e => setP1(e.target.value)} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text">
                {opts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-canon-muted">Раунды
              <div className="flex items-center gap-2 mt-1">
                <input type="range" min={1} max={30} value={totalRounds} onChange={e => setTotalRounds(Number(e.target.value))} className="flex-1 accent-canon-accent" />
                <span className="text-sm font-mono text-canon-text w-8 text-right">{totalRounds}</span>
              </div>
            </label>
            <label className="text-xs text-canon-muted">Давление
              <div className="flex items-center gap-1 mt-1">
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input type="checkbox" checked={instPressure === null} onChange={e => setInstPressure(e.target.checked ? null : scenario.institutionalPressure)} className="accent-canon-accent" />
                  <span className="text-[9px]">авто</span>
                </label>
                {instPressure !== null && <>
                  <input type="range" min={0} max={100} value={Math.round(instPressure * 100)} onChange={e => setInstPressure(Number(e.target.value) / 100)} className="flex-1 accent-canon-accent" />
                  <span className="text-sm font-mono text-canon-text w-8 text-right">{f2(instPressure)}</span>
                </>}
              </div>
            </label>
            <label className="text-xs text-canon-muted">Seed
              <input type="number" min={1} max={99999} value={seed} onChange={e => setSeed(Number(e.target.value) || 42)} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm font-mono text-canon-text" />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={run} className="px-5 py-2 rounded-lg bg-canon-accent text-canon-bg text-sm font-bold hover:brightness-110 transition">▶ Запустить</button>
            {result && <button onClick={reset} className="px-3 py-2 rounded-lg bg-canon-card border border-canon-border text-sm text-canon-muted hover:text-canon-bad transition">✕ Reset</button>}
          </div>
          {error && <div className="text-xs text-canon-bad bg-canon-bad/10 border border-canon-bad/20 rounded-lg p-3">{error}</div>}
        </div>

        <div className="bg-canon-panel border border-canon-border rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Ставки</div>
          <MiniBar label="personal" value={scenario.stakes.personal} color="#ff79c6" />
          <MiniBar label="relational" value={scenario.stakes.relational} color="#9b87ff" />
          <MiniBar label="institutional" value={scenario.stakes.institutional} color="#ffaa44" />
          <MiniBar label="physical" value={scenario.stakes.physical} color="#ff5c7a" />
          <div className="text-[10px] text-canon-faint">Видимость: {scenario.visibility} · Давл: {pct(instPressure ?? scenario.institutionalPressure)}</div>
          <div className="border-t border-canon-border/30 pt-2 mt-2">
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-1">Действия</div>
            {scenario.actionPool.map(a => (
              <div key={a.id} className="text-[10px] text-canon-muted py-0.5">
                <span className="text-canon-text font-medium">{a.label}</span>
                {a.requires && <span className="text-canon-faint ml-1">[{a.requires.roles?.join('/') || ''}{a.requires.minClearance ? ` cl≥${a.requires.minClearance}` : ''}]</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {result && game && (
        <div className="bg-canon-panel border border-canon-border rounded-lg overflow-hidden">
          <Tabs syncKey="dlv2" className="flex flex-col" contentClassName="min-h-0" tabs={[
            {
              label: 'Результаты', content: (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm font-semibold text-canon-text">{scenario.name} · {game.totalRounds} раундов</div>
                    <button onClick={download} className="px-2.5 py-1 rounded-md bg-canon-card border border-canon-border text-[11px] text-canon-text hover:border-canon-accent/50 transition">⬇ Export</button>
                  </div>
                  <div className="flex gap-4 text-[10px]">
                    {game.players.map(pid => <div key={pid} className="flex items-center gap-1.5"><span className="text-canon-muted">{pid.replace('character-', '')}</span><ConfBadge value={result.confidence[pid] ?? 0} /></div>)}
                  </div>
                  {game.players.map(pid => <div key={pid} className="text-[10px] text-canon-muted italic bg-canon-card border border-canon-border/30 rounded p-2">{result.summaries[pid]}</div>)}
                  {actionCounts && <div className="grid grid-cols-2 gap-4">
                    {game.players.map(pid => (
                      <div key={pid}>
                        <div className="text-[10px] font-semibold text-canon-muted mb-1">{pid.replace('character-', '')}</div>
                        {Object.entries(actionCounts[pid] ?? {}).sort((a, b) => b[1] - a[1]).map(([aid, cnt]) => (
                          <div key={aid} className="flex items-center gap-1 text-[10px]">
                            <span className="text-canon-text flex-1 truncate">{scenario.actionPool.find(a => a.id === aid)?.label ?? aid}</span>
                            <div className="h-2 bg-canon-accent/30 rounded" style={{ width: `${cnt / game.totalRounds * 60}px` }} />
                            <span className="font-mono text-canon-muted w-8 text-right">{cnt}/{game.totalRounds}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>}
                  <div>
                    <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">История</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {game.rounds.map(r => (
                        <div key={r.index} className="flex items-center gap-2 text-xs bg-canon-card border border-canon-border/30 rounded-lg px-3 py-1.5">
                          <span className="text-canon-faint font-mono w-6">R{r.index + 1}</span>
                          <span className="text-canon-accent truncate flex-1">{scenario.actionPool.find(a => a.id === r.choices[game.players[0]])?.label}</span>
                          <span className="text-canon-faint">×</span>
                          <span className="text-canon-accent-2 truncate flex-1 text-right">{scenario.actionPool.find(a => a.id === r.choices[game.players[1]])?.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              label: 'Traces', content: (
                <div className="p-4 space-y-3">
                  <div className="text-xs text-canon-muted">7-осевой utility · confidence · объяснения · state updates</div>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {game.rounds.map((_, i) => <V2TraceBlock key={i} round={i} game={game} scenario={scenario} />)}
                  </div>
                </div>
              ),
            },
          ]} />
        </div>
      )}

      {!result && <div className="text-center py-12 space-y-2"><div className="text-3xl opacity-20">◆</div><div className="text-sm text-canon-faint">Выбери сценарий и персонажей → <span className="text-canon-accent">▶ Запустить</span></div></div>}
    </div>
  );
};
