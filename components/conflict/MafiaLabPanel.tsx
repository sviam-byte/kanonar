import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSandbox } from '../../contexts/SandboxContext';
import { getAllCharactersWithRuntime } from '../../data';
import type { AgentState, CharacterEntity, WorldState } from '../../types';
import {
  defaultDistribution,
  runMafiaBatch,
  runMafiaGame,
  type MafiaBatchResult,
  type MafiaGameResult,
  type RoleId,
} from '../../lib/mafia';

const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const ROLE_ORDER: RoleId[] = ['mafia', 'sheriff', 'doctor', 'citizen'];
const ROLE_LABEL: Record<RoleId, string> = {
  mafia: 'Mafia',
  sheriff: 'Sheriff',
  doctor: 'Doctor',
  citizen: 'Citizen',
};

/**
 * Минимальный world для runner-а Mafia.
 * Гард на границе UI -> модель, чтобы раннер всегда получал валидную структуру.
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

export const MafiaLabPanel: React.FC = () => {
  const { characters } = useSandbox();
  const allChars = useMemo(() => {
    const base = getAllCharactersWithRuntime();
    const map = new Map<string, CharacterEntity>();
    for (const c of base) map.set(c.entityId, c);
    for (const c of characters) map.set(c.entityId, c as CharacterEntity);
    return Array.from(map.values());
  }, [characters]);

  const defaultPlayers = useMemo(() => allChars.slice(0, 7).map((c) => c.entityId), [allChars]);
  const [players, setPlayers] = useState<string[]>(defaultPlayers);
  const [seed, setSeed] = useState(42);
  const [batchGames, setBatchGames] = useState(100);
  const [roleDist, setRoleDist] = useState<Record<RoleId, number>>(() => defaultDistribution(Math.max(4, defaultPlayers.length)));
  const [single, setSingle] = useState<MafiaGameResult | null>(null);
  const [batch, setBatch] = useState<MafiaBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const world = useMemo(() => buildMinimalWorld(allChars), [allChars]);

  const selectedSet = useMemo(() => new Set(players), [players]);

  /**
   * Нормализация конфигурации ролей.
   * Сумма ролей должна совпадать с числом игроков, иначе раннер не будет сопоставим между single/batch.
   */
  const normalizedRoleDist = useMemo(() => {
    const base = { ...roleDist };
    const total = ROLE_ORDER.reduce((sum, role) => sum + (base[role] ?? 0), 0);
    if (total === players.length) return base;
    const fallback = defaultDistribution(Math.max(4, players.length));
    if (players.length >= 4) {
      const fixed = { ...fallback, ...base };
      const otherSum = fixed.mafia + fixed.sheriff + fixed.doctor;
      fixed.citizen = Math.max(0, players.length - otherSum);
      return fixed;
    }
    return fallback;
  }, [players.length, roleDist]);

  const togglePlayer = (id: string) => {
    setPlayers((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      return next;
    });
  };

  const syncDefaultDistribution = (nextCount: number) => {
    if (nextCount < 4) return;
    setRoleDist(defaultDistribution(nextCount));
  };

  const onRoleChange = (role: RoleId, value: number) => {
    const safe = Math.max(0, Math.floor(value || 0));
    setRoleDist((prev) => {
      const next = { ...prev, [role]: safe };
      if (role !== 'citizen') {
        const used = (next.mafia ?? 0) + (next.sheriff ?? 0) + (next.doctor ?? 0);
        next.citizen = Math.max(0, players.length - used);
      }
      return next;
    });
  };

  const run = () => {
    if (players.length < 4) {
      setError('Нужно минимум 4 игрока');
      return;
    }
    const totalRoles = ROLE_ORDER.reduce((sum, role) => sum + (normalizedRoleDist[role] ?? 0), 0);
    if (totalRoles !== players.length) {
      setError(`Роли суммируются в ${totalRoles}, а игроков ${players.length}`);
      return;
    }

    try {
      setError(null);
      const singleResult = runMafiaGame({
        players,
        roleAssignment: 'random',
        roleDistribution: normalizedRoleDist,
        world,
        seed,
      });
      const batchResult = runMafiaBatch({
        players,
        roleDistribution: normalizedRoleDist,
        nGames: Math.max(1, Math.floor(batchGames)),
        world,
        baseSeed: seed * 17,
      });
      setSingle(singleResult);
      setBatch(batchResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSingle(null);
      setBatch(null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-canon-text flex items-center gap-2">
            <span className="text-canon-accent">◈</span> Mafia Lab
          </h1>
          <p className="text-xs text-canon-muted mt-1">
            Отдельный hidden-role режим: роли, день/ночь, claims, голосование, batch-статистика.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/conflict-lab?tab=dilemma" className="rounded-md border border-canon-border bg-canon-card px-3 py-1.5 text-xs text-canon-text hover:border-canon-accent/40 transition">
            ← Назад в Dilemma Lab
          </Link>
          <button
            onClick={() => syncDefaultDistribution(players.length)}
            className="rounded-md border border-canon-border bg-canon-card px-3 py-1.5 text-xs text-canon-text hover:border-canon-accent/40 transition"
          >
            Сбросить роли по умолчанию
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-canon-panel border border-canon-border rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Игроки</div>
          <div className="text-[11px] text-canon-faint">Отмечай состав партии. Для MVP лучше держать 5–8 игроков.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
            {allChars.map((c) => {
              const checked = selectedSet.has(c.entityId);
              return (
                <label key={c.entityId} className={`rounded-lg border p-2 cursor-pointer transition ${checked ? 'border-canon-accent bg-canon-accent/10' : 'border-canon-border bg-canon-card hover:border-canon-accent/40'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlayer(c.entityId)}
                      className="accent-canon-accent"
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-canon-text truncate">{c.title || c.entityId}</div>
                      <div className="text-[10px] text-canon-faint font-mono truncate">{c.entityId}</div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="bg-canon-panel border border-canon-border rounded-lg p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Конфиг</div>
            <div className="mt-2 text-[11px] text-canon-faint">Single и batch используют один и тот же role distribution — без фальшивых сравнений.</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-canon-muted">Игроков
              <input value={players.length} disabled className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text" />
            </label>
            <label className="text-xs text-canon-muted">Seed
              <input type="number" value={seed} min={1} max={99999} onChange={(e) => setSeed(Number(e.target.value) || 42)} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text font-mono" />
            </label>
            <label className="text-xs text-canon-muted col-span-2">Batch games
              <input type="number" value={batchGames} min={1} max={5000} onChange={(e) => setBatchGames(Number(e.target.value) || 100)} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text font-mono" />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Роли</div>
            {ROLE_ORDER.map((role) => (
              <label key={role} className="flex items-center justify-between gap-3 text-xs text-canon-muted">
                <span>{ROLE_LABEL[role]}</span>
                <input
                  type="number"
                  min={0}
                  max={players.length}
                  value={normalizedRoleDist[role] ?? 0}
                  onChange={(e) => onRoleChange(role, Number(e.target.value))}
                  className="w-20 bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm text-canon-text font-mono"
                />
              </label>
            ))}
            <div className="text-[10px] text-canon-faint">Сумма ролей: {ROLE_ORDER.reduce((sum, role) => sum + (normalizedRoleDist[role] ?? 0), 0)}</div>
          </div>

          <button onClick={run} className="w-full rounded-lg bg-canon-accent text-canon-bg py-2 text-sm font-bold hover:brightness-110 transition">
            ▶ Запустить Mafia Lab
          </button>

          {error && <div className="text-xs text-canon-bad bg-canon-bad/10 border border-canon-bad/30 rounded-lg p-3">{error}</div>}
        </div>
      </div>

      {batch && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <MetricCard label="Town win" value={pct(batch.aggregate.townWinRate)} />
          <MetricCard label="Mafia win" value={pct(batch.aggregate.mafiaWinRate)} />
          <MetricCard label="Draw" value={pct(batch.aggregate.drawRate)} />
          <MetricCard label="Avg cycles" value={f2(batch.aggregate.avgCycles)} />
        </div>
      )}

      {single && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-1 bg-canon-panel border border-canon-border rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Одна партия</div>
            <div className="text-sm text-canon-text">Победитель: <span className="text-canon-accent">{single.analysis.winner ?? '—'}</span></div>
            <div className="text-xs text-canon-muted">Циклов: {single.analysis.cycles}</div>
            <div className="space-y-2 pt-2 border-t border-canon-border/40">
              {players.map((id) => (
                <div key={id} className="rounded-lg border border-canon-border/50 bg-canon-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-canon-text truncate">{id}</span>
                    <span className="text-[10px] text-canon-accent font-mono uppercase">{single.state.roles[id]}</span>
                  </div>
                  <div className="text-[10px] text-canon-faint mt-1">
                    avg suspicion vs them: {f2(single.analysis.suspicionAccuracy[id]?.avgSuspicionAgainstThem ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-2 bg-canon-panel border border-canon-border rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Таймлайн</div>
            <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
              {single.state.history.days.map((day, idx) => {
                const night = single.state.history.nights[idx];
                return (
                  <div key={day.cycle} className="rounded-lg border border-canon-border bg-canon-card p-3 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-canon-text">Day {day.cycle}</div>
                      <div className="text-[11px] text-canon-faint">Eliminated: {day.eliminatedId ?? 'none'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-canon-muted mb-1">Claims</div>
                      <div className="space-y-1">
                        {day.claims.map((claim, i) => (
                          <div key={`${claim.actorId}-${i}`} className="text-xs text-canon-text">
                            <span className="text-canon-accent">{claim.actorId}</span> · {claim.kind}
                            {claim.targetId ? ` → ${claim.targetId}` : ''}
                            {claim.claimedCheck ? ` (${claim.claimedCheck.targetId} = ${claim.claimedCheck.asRole})` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-canon-muted mb-1">Votes</div>
                      <div className="space-y-1">
                        {day.votes.map((vote, i) => (
                          <div key={`${vote.voterId}-${i}`} className="text-xs text-canon-text">
                            <span className="text-canon-accent">{vote.voterId}</span> → {vote.targetId ?? 'abstain'}
                          </div>
                        ))}
                      </div>
                    </div>
                    {night && (
                      <div className="pt-2 border-t border-canon-border/40">
                        <div className="text-sm font-semibold text-canon-text">Night {night.cycle}</div>
                        <div className="text-[11px] text-canon-faint">Killed: {night.killedId ?? 'nobody'}</div>
                        <div className="space-y-1 mt-1">
                          {night.actions.map((action, i) => (
                            <div key={`${action.actorId}-${action.kind}-${i}`} className="text-xs text-canon-text">
                              <span className="text-canon-accent">{action.actorId}</span> · {action.kind} → {action.targetId}
                              {action.resolved?.info ? ` (${action.resolved.info})` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-canon-panel border border-canon-border rounded-lg p-4">
    <div className="text-[11px] uppercase tracking-wider text-canon-muted">{label}</div>
    <div className="text-lg font-bold text-canon-text mt-1">{value}</div>
  </div>
);

export default MafiaLabPanel;
