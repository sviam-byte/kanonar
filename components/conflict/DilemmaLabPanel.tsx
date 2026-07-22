import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { runConflictLabSessionV1 } from '../../lib/dilemma/integration/liveSession';
import {
  runConflictTargetMatrixLabSessionV1,
  type ConflictTargetMatrixLabSessionReportV1,
} from '../../lib/dilemma/integration/ntargetLiveSession';
import type { ConflictDirectedActionMatrixV1 } from '../../lib/dilemma/nkernel/ntargetmatrix';
import type { ConflictRelationState } from '../../lib/dilemma/dynamics/types';
import type { ConflictChoiceTraceV1 } from '../../lib/dilemma/integration/types';
import {
  buildConflictTargetMatrixSessionExport,
  makeConflictTargetMatrixSessionFileName,
} from '../../lib/dilemma/sessionExport';
import { allScenarios, getScenario } from '../../lib/dilemma/scenarios';
import { allMechanics } from '../../lib/dilemma/mechanics';
import { TRUST_EXCHANGE_ACTION_LABELS, TRUST_EXCHANGE_ACTION_ORDER } from '../../lib/dilemma/dynamics/trustExchange';
import { CONFLICT_SCENARIO_INVENTORY, conflictCatalogLane } from '../../lib/dilemma/definition';
import type { ConflictInventoryEntry, ConflictInventoryKind } from '../../lib/dilemma/definition';
import type {
  ScenarioTemplate, V2GameState, V2RoundTrace, V2RunResult, MechanicTemplate, PressureSchedule, ProtocolCardView,
} from '../../lib/dilemma/types';
import type { WorldState, AgentState, CharacterEntity } from '../../types';
import { useSandbox } from '../../contexts/SandboxContext';
import { getAllCharactersWithRuntime } from '../../data';
import { Tabs } from '../Tabs';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const CLASS_ICONS: Record<string, string> = {
  trust: '🔍', protection: '🛡', authority: '⚖', loyalty: '🏛',
  sacrifice: '🩸', opacity: '🌫', mutiny: '⚔', care: '💊', bargain: '🤝',
};

const MECHANIC_ICONS: Record<string, string> = {
  trust_exchange: '🔐',
  authority_conflict: '⚔',
  judgment_sanction: '⚖',
  resource_split: '🤝',
  care_under_surveillance: '👁',
  ultimatum_split: '🪓',
  volunteer_sacrifice: '🩸',
  signaling_trust: '📡',
};

// R6 step 4: honest typed-inventory badge on every card. Presentation never
// promotes a card into an executable mechanic — the label states what it is.
const INVENTORY_KIND_META: Record<ConflictInventoryKind, { label: string; cls: string }> = {
  canonical_mechanic: { label: 'canonical kernel', cls: 'text-canon-good bg-canon-good/10 border-canon-good/25' },
  parameter_variant: { label: 'parameter variant', cls: 'text-canon-muted bg-canon-bg/60 border-canon-border/40' },
  skin: { label: 'skin', cls: 'text-canon-muted bg-canon-bg/60 border-canon-border/40' },
  duplicate: { label: 'duplicate', cls: 'text-canon-faint bg-canon-bg/60 border-canon-border/40' },
  unsupported: { label: 'no typed kernel', cls: 'text-yellow-300 bg-yellow-300/10 border-yellow-300/25' },
  needs_multi_agent: { label: 'needs multi-agent', cls: 'text-orange-300 bg-orange-300/10 border-orange-300/25' },
};

const InventoryBadge: React.FC<{ entry?: ConflictInventoryEntry }> = ({ entry }) => {
  if (!entry) return null;
  const meta = INVENTORY_KIND_META[entry.kind];
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-medium ${meta.cls}`} title={entry.reason}>
      {meta.label}
    </span>
  );
};

const TIMING_LABELS: Record<ProtocolCardView['timing'], string> = {
  simultaneous: 'simultaneous',
  sequential: 'sequential',
  multi_phase: 'multi-phase',
};

const INFO_LABELS: Record<ProtocolCardView['information'], string> = {
  complete: 'complete info',
  hidden_type: 'hidden type',
  partial_observation: 'partial observation',
};

const AXIS_META: Record<string, { label: string; color: string; desc: string }> = {
  G: { label: 'G', color: '#9b87ff', desc: 'Goal — служит ли действие цели' },
  R: { label: 'R', color: '#66d9ff', desc: 'Relational — как для отношений' },
  I: { label: 'I', color: '#42f5b3', desc: 'Identity — совместимость с Я' },
  L: { label: 'L', color: '#ffaa44', desc: 'Legitimacy — процедурно' },
  S: { label: 'S', color: '#ff79c6', desc: 'Safety — снижение угрозы' },
  M: { label: 'M', color: '#c9a0ff', desc: 'Mirror — как выгляжу' },
  O: { label: 'O', color: '#7ee787', desc: 'Other — ожидаемый ответ партнёра' },
  X: { label: 'X', color: '#ff5c7a', desc: 'Cost — цена (вычитается)' },
};

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

type DilemmaLabCardinality = 'dyad' | 'triad';
type DilemmaLabResult =
  | { readonly kind: 'dyad'; readonly value: V2RunResult }
  | { readonly kind: 'triad'; readonly value: ConflictTargetMatrixLabSessionReportV1 };

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
    leadership: { leaderId: null } as unknown as WorldState['leadership'],
    initialRelations: {},
  };
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

const ScenarioCard: React.FC<{
  s: ScenarioTemplate; selected: boolean; disabled?: boolean; onClick?: () => void; inventory?: ConflictInventoryEntry;
}> = ({ s, selected, disabled = false, onClick, inventory }) => {
  const protocol = s.protocol;
  return (
    <button onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`text-left p-3 rounded-lg border transition-all ${disabled
        ? 'border-canon-border/40 bg-canon-bg/40 opacity-55 cursor-not-allowed'
        : selected
          ? 'border-canon-accent bg-canon-accent/10 shadow-canon-1'
          : 'border-canon-border bg-canon-card hover:border-canon-accent/40'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{CLASS_ICONS[s.dilemmaClass] ?? '◆'}</span>
          <span className={`text-sm font-semibold truncate ${selected ? 'text-canon-accent' : 'text-canon-text'}`}>{s.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <InventoryBadge entry={inventory} />
          <span className="rounded-full border border-canon-border/50 px-1.5 py-0.5 text-[8px] text-canon-faint">{protocol.kernel}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded bg-canon-bg/70 px-1.5 py-0.5 text-[9px] text-canon-muted">{protocol.typeLabel}</span>
        <span className="rounded bg-canon-bg/70 px-1.5 py-0.5 text-[9px] text-canon-muted">{protocol.symmetry}</span>
        <span className="rounded bg-canon-bg/70 px-1.5 py-0.5 text-[9px] text-canon-muted">{INFO_LABELS[protocol.information]}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {protocol.roles.map((role) => (
          <div key={role.id} className="rounded border border-canon-border/30 bg-canon-bg/35 px-2 py-1">
            <div className="text-[9px] font-semibold text-canon-text truncate">{role.label}</div>
            <div className="text-[8px] text-canon-faint line-clamp-1">{role.description}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {protocol.phases.slice(0, 3).map((phase, index) => (
          <div key={phase.id} className="flex items-center gap-1.5 text-[9px] text-canon-muted">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-canon-accent/10 font-mono text-[8px] text-canon-accent">{index + 1}</span>
            <span className="truncate">{phase.label}</span>
          </div>
        ))}
        {protocol.phases.length > 3 && <div className="pl-5 text-[8px] text-canon-faint">+{protocol.phases.length - 3} phase</div>}
      </div>
      <div className="mt-2 text-[9px] text-canon-faint line-clamp-2">
        main: {protocol.primaryParameter}; secondary pressure {pct(s.institutionalPressure)}
      </div>
      {inventory && <div className="text-[9px] text-canon-faint mt-2 line-clamp-2">{inventory.reason}</div>}
      {disabled && s.disabledReason && <div className="text-[10px] text-canon-faint mt-1 line-clamp-3">{s.disabledReason}</div>}
    </button>
  );
};

const ProtocolSkeleton: React.FC<{ protocol: ProtocolCardView; compact?: boolean }> = ({ protocol, compact = false }) => {
  const lineClass = protocol.timing === 'sequential'
    ? 'border-l border-canon-accent/30 pl-3'
    : protocol.timing === 'multi_phase'
      ? 'border-l border-dashed border-canon-accent-2/40 pl-3'
      : 'grid grid-cols-1 sm:grid-cols-2 gap-2';

  return (
    <div className={`rounded-lg border border-canon-border/50 bg-canon-bg/35 p-3 ${compact ? 'space-y-2' : 'space-y-3'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-canon-faint">protocol kernel</div>
          <div className="text-sm font-semibold text-canon-text">{protocol.title}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-canon-accent">{TIMING_LABELS[protocol.timing]}</div>
          <div className="text-[8px] text-canon-faint">{INFO_LABELS[protocol.information]}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {protocol.roles.map((role) => (
          <div key={role.id} className="rounded-md border border-canon-border/40 bg-canon-card/60 p-2">
            <div className="text-[10px] font-semibold text-canon-text">{role.label}</div>
            <div className="text-[9px] text-canon-muted">{role.description}</div>
          </div>
        ))}
      </div>

      <div className={lineClass}>
        {protocol.phases.map((phase, index) => (
          <div key={phase.id} className={`rounded-md border border-canon-border/30 bg-canon-card/40 p-2 ${protocol.timing === 'simultaneous' ? '' : 'mb-2 last:mb-0'}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-canon-accent/10 font-mono text-[9px] text-canon-accent">{index + 1}</span>
              <span className="text-[10px] font-semibold text-canon-text">{phase.label}</span>
              <span className="ml-auto rounded bg-canon-bg px-1.5 py-0.5 text-[8px] text-canon-faint">{phase.actor}</span>
            </div>
            <div className="mt-1 text-[9px] text-canon-muted">{phase.description}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[9px]">
        <div className="rounded-md bg-canon-card/50 p-2">
          <div className="text-canon-faint">payoff rule</div>
          <div className="text-canon-muted">{protocol.coreRule}</div>
        </div>
        <div className="rounded-md bg-canon-card/50 p-2">
          <div className="text-canon-faint">observation</div>
          <div className="text-canon-muted">{protocol.observation}</div>
        </div>
      </div>
    </div>
  );
};

const MechanicSection: React.FC<{
  mechanic: MechanicTemplate;
  scenarios: ScenarioTemplate[];
  selectedScenarioId: string;
  onSelect: (scenarioId: string) => void;
  inventoryByScenario: Map<string, ConflictInventoryEntry>;
}> = ({ mechanic, scenarios, selectedScenarioId, onSelect, inventoryByScenario }) => {
  if (scenarios.length === 0) return null;
  return (
    <div className="rounded-lg border border-canon-border/60 bg-canon-card p-3 space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-lg">{MECHANIC_ICONS[mechanic.id] ?? '◆'}</span>
          <div className="text-sm font-semibold text-canon-text">{mechanic.name}</div>
        </div>
        <div className="text-[10px] text-canon-muted mt-1">{mechanic.description}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {scenarios.map((s) => (
          <ScenarioCard key={s.id} s={s} selected={selectedScenarioId === s.id} onClick={() => onSelect(s.id)} inventory={inventoryByScenario.get(s.id)} />
        ))}
      </div>
    </div>
  );
};

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

const REGIME_CLASS: Record<string, string> = {
  secure: 'text-canon-good bg-canon-good/10 border-canon-good/20',
  strained: 'text-yellow-300 bg-yellow-300/10 border-yellow-300/20',
  volatile: 'text-orange-300 bg-orange-300/10 border-orange-300/20',
  hostile: 'text-canon-bad bg-canon-bad/10 border-canon-bad/20',
  ruptured: 'text-red-300 bg-red-300/10 border-red-300/20',
};

const CoreDynamicsBlock: React.FC<{ core: V2RunResult['conflictCore'] }> = ({ core }) => {
  if (!core) {
    return (
      <div className="p-4 text-xs text-canon-muted">
        Canonical dynamics report is not available for this run.
      </div>
    );
  }

  if (core.runtime === 'unsupported_kernel') {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-lg border border-canon-border/50 bg-canon-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-canon-faint">canonical runtime</div>
          <div className="mt-1 text-sm font-semibold text-canon-text">Kernel pending</div>
          <div className="mt-2 text-xs text-canon-muted">{core.reason}</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
            <div className="rounded bg-canon-bg/50 p-2">
              <span className="text-canon-faint">mechanic</span>
              <span className="float-right text-canon-text">{core.mechanicId}</span>
            </div>
            <div className="rounded bg-canon-bg/50 p-2">
              <span className="text-canon-faint">protocol kernel</span>
              <span className="float-right text-canon-text">{core.protocolKernel ?? 'unknown'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [a, b] = core.players;
  const directions = [
    { from: a, to: b, relation: core.finalState.relations[a]?.[b], memory: core.finalState.memories[a]?.[b], regime: core.finalState.regimes[a]?.[b] },
    { from: b, to: a, relation: core.finalState.relations[b]?.[a], memory: core.finalState.memories[b]?.[a], regime: core.finalState.regimes[b]?.[a] },
  ];
  const frames = core.frames.slice(-Math.min(24, core.frames.length));
  const actionLabel = (id: keyof typeof TRUST_EXCHANGE_ACTION_LABELS | string) =>
    TRUST_EXCHANGE_ACTION_LABELS[id as keyof typeof TRUST_EXCHANGE_ACTION_LABELS] ?? id;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-canon-border/50 bg-canon-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-canon-faint">canonical runtime</div>
          <div className="mt-1 text-sm font-semibold text-canon-text">{core.runtime}</div>
          <div className="mt-1 text-[10px] text-canon-muted">protocol: {core.protocolId}</div>
          <div className="mt-3 text-[10px] text-canon-faint">trust-only canonical kernel; legacy action cards are not replayed here.</div>
        </div>
        <div className="rounded-lg border border-canon-border/50 bg-canon-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-canon-faint">trajectory metrics</div>
          <MiniBar label="distance" value={core.metrics.distanceFromStart} color="#66d9ff" />
          <MiniBar label="collapse" value={core.metrics.collapseScore} color="#ff5c7a" />
          <MiniBar label="repair cap" value={core.metrics.repairCapacity} color="#42f5b3" />
          {core.metrics.cyclePeriod !== undefined && <div className="text-[9px] text-canon-muted mt-1">cycle period: {core.metrics.cyclePeriod}</div>}
        </div>
        <div className="rounded-lg border border-canon-border/50 bg-canon-card p-3">
          <div className="text-[10px] uppercase tracking-wider text-canon-faint">action vocabulary</div>
          <div className="mt-2 space-y-1 text-[10px]">
            <div><span className="text-canon-accent">trust</span><span className="text-canon-faint"> = {TRUST_EXCHANGE_ACTION_LABELS.trust}</span></div>
            <div><span className="text-canon-accent">withhold</span><span className="text-canon-faint"> = {TRUST_EXCHANGE_ACTION_LABELS.withhold}</span></div>
            <div><span className="text-canon-accent">betray</span><span className="text-canon-faint"> = {TRUST_EXCHANGE_ACTION_LABELS.betray}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {directions.map(({ from, to, relation, memory, regime }) => (
          <div key={`${from}-${to}`} className="rounded-lg border border-canon-border/50 bg-canon-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-canon-faint">directed pair</div>
                <div className="text-sm font-semibold text-canon-text">{from.replace('character-', '')}{' -> '}{to.replace('character-', '')}</div>
              </div>
              {regime && (
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${REGIME_CLASS[regime.regime] ?? 'border-canon-border text-canon-muted'}`}>
                  {regime.regime}
                </span>
              )}
            </div>

            {relation ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                <MiniBar label="T trust" value={relation.trust} color="#42f5b3" />
                <MiniBar label="B bond" value={relation.bond} color="#9b87ff" />
                <MiniBar label="C conflict" value={relation.conflict} color="#ff5c7a" />
                <MiniBar label="F fear" value={relation.perceivedThreat} color="#ffaa44" />
                <MiniBar label="V volatility" value={relation.volatility} color="#66d9ff" />
              </div>
            ) : <div className="text-[10px] text-canon-faint">No relation vector.</div>}

            {memory ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 border-t border-canon-border/40 pt-2">
                <MiniBar label="betray debt" value={memory.betrayalDebt} color="#ff5c7a" />
                <MiniBar label="repair" value={memory.repairCredit} color="#42f5b3" />
                <MiniBar label="momentum" value={memory.conflictMomentum} color="#ffaa44" />
                <MiniBar label="fear trace" value={memory.fearTrace} color="#ff79c6" />
                <MiniBar label="volatility" value={memory.volatility} color="#66d9ff" />
              </div>
            ) : <div className="text-[10px] text-canon-faint">No learning memory.</div>}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-canon-border/50 bg-canon-card p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-canon-faint">trajectory frames</div>
          <div className="text-[9px] text-canon-muted">{core.frames.length} frames</div>
        </div>
        <div className="mt-3 space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {frames.map((frame, index) => (
            <div key={`${frame.tick}-${frame.agentId}-${index}`} className="rounded-md border border-canon-border/30 bg-canon-bg/35 p-2 text-[10px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-canon-faint">t{frame.tick}</span>
                <span className="text-canon-text">{frame.agentId.replace('character-', '')}</span>
                <span className="text-canon-faint">chose</span>
                <span className="text-canon-accent">{actionLabel(frame.actionId)}</span>
                <span className="text-canon-faint">vs</span>
                <span className="text-canon-accent-2">{actionLabel(frame.otherActionId)}</span>
                <span className={`ml-auto rounded-full border px-1.5 py-0.5 ${REGIME_CLASS[frame.regimeAfter.regime] ?? 'border-canon-border text-canon-muted'}`}>
                  {frame.regimeBefore.regime}{' -> '}{frame.regimeAfter.regime}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[9px]">
                <div><span className="text-canon-faint">PE</span> <span className="font-mono text-canon-text">{f3(frame.prediction.predictionError)}</span></div>
                <div><span className="text-canon-faint">reward</span> <span className="font-mono text-canon-text">{f3(frame.reward.total)}</span></div>
                <div><span className="text-canon-faint">U</span> <span className="font-mono text-canon-text">{f3(frame.utility.finalU)}</span></div>
                <div><span className="text-canon-faint">margin</span> <span className="font-mono text-canon-text">{f3(frame.utility.marginFromSecondBest)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

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
            <div className="text-[9px] text-canon-muted font-semibold mb-1">U({aLbl(chosen.actionId)}) = G+R+I+L+S+M+O−X</div>
            {(['G', 'R', 'I', 'L', 'S', 'M', 'O'] as const).map(a => <AxisBar key={a} axis={a} value={(chosen as any)[a]} />)}
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
                  {(['G', 'R', 'I', 'L', 'S', 'M', 'O'] as const).map(a => <AxisBar key={a} axis={a} value={(s as any)[a]} />)}
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
            <div>vs: {aLbl(t.stateUpdate.againstActionId)} · {t.stateUpdate.outcomeTag}</div>
            {chosen?.expectedOtherActionId && <div>ожидался ответ: {aLbl(chosen.expectedOtherActionId)} ({pct(chosen.expectedOtherProbability ?? 0)})</div>}
            <div>will: {t.stateUpdate.willDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.willDelta)}</div>
            <div>burnout: {t.stateUpdate.burnoutDelta >= 0 ? '+' : ''}{f3(t.stateUpdate.burnoutDelta)}</div>
            <div>stress: {t.stateUpdate.stressDelta >= 0 ? '+' : ''}{t.stateUpdate.stressDelta}</div>
            <div>Δtrust: {t.stateUpdate.trustDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.trustDelta)}</div>
            <div>Δbond: {t.stateUpdate.bondDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.bondDelta)}</div>
            <div>Δconflict: {t.stateUpdate.conflictDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.conflictDelta)}</div>
            <div>Δfear: {t.stateUpdate.fearDelta >= 0 ? '+' : ''}{f2(t.stateUpdate.fearDelta)}</div>
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

const DirectedActionMatrix: React.FC<{
  matrix?: ConflictDirectedActionMatrixV1;
  actionLabel: (actionId: string) => string;
}> = ({ matrix, actionLabel }) => {
  if (!matrix || !Array.isArray(matrix.participantIds)) return <div className="text-[10px] text-canon-faint">Матрица действий недоступна</div>;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-[10px] border-collapse">
      <thead><tr><th className="p-1.5 text-left text-canon-faint">actor \ target</th>{matrix.participantIds.map((id) => <th key={id} className="p-1.5 text-canon-muted">{id.replace('character-', '')}</th>)}</tr></thead>
      <tbody>{matrix.participantIds.map((actorId) => <tr key={actorId} className="border-t border-canon-border/30">
        <th className="p-1.5 text-left text-canon-muted">{actorId.replace('character-', '')}</th>
        {matrix.participantIds.map((targetId) => {
          const actionId = actorId === targetId ? undefined : matrix.actionsByActorTarget?.[actorId]?.[targetId];
          return <td key={targetId} className="p-1.5 text-center text-canon-text">{actorId === targetId ? '—' : actionId ? actionLabel(actionId) : 'н/д'}</td>;
        })}
      </tr>)}</tbody>
    </table></div>
  );
};

const DirectedRelationMatrix: React.FC<{
  players: readonly string[];
  relations?: Readonly<Record<string, Readonly<Record<string, ConflictRelationState>>>>;
}> = ({ players, relations }) => (
  <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-[9px] border-collapse">
    <thead><tr><th className="p-1.5 text-left text-canon-faint">from \ to</th>{players.map((id) => <th key={id} className="p-1.5 text-canon-muted">{id.replace('character-', '')}</th>)}</tr></thead>
    <tbody>{players.map((fromId) => <tr key={fromId} className="border-t border-canon-border/30">
      <th className="p-1.5 text-left text-canon-muted">{fromId.replace('character-', '')}</th>
      {players.map((toId) => {
        const relation = fromId === toId ? undefined : relations?.[fromId]?.[toId];
        return <td key={toId} className="p-1.5 align-top text-canon-muted">{fromId === toId ? <div className="text-center">—</div> : relation ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono">
            <span>T {f2(relation.trust)}</span><span>B {f2(relation.bond)}</span>
            <span>Th {f2(relation.perceivedThreat)}</span><span>C {f2(relation.conflict)}</span>
            <span>L {f2(relation.perceivedLegitimacy)}</span><span>V {f2(relation.volatility)}</span>
          </div>
        ) : <div className="text-center text-canon-faint">н/д</div>}</td>;
      })}
    </tr>)}</tbody>
  </table></div>
);

const TargetChoiceTrace: React.FC<{
  session: ConflictTargetMatrixLabSessionReportV1;
  actionLabel: (actionId: string) => string;
}> = ({ session, actionLabel }) => {
  const renderChoice = (choice?: ConflictChoiceTraceV1) => choice ? (
    <div className="mt-2 space-y-1 text-[10px]">
      <div className="flex flex-wrap gap-3">
        <span className="text-canon-text">{actionLabel(choice.kernelActionId)}</span>
        <span className="text-canon-muted">rng={choice.rngChannelId}</span>
        <span className="text-canon-muted">T={f3(choice.temperature)} ({choice.temperatureSource})</span>
        <span className="text-canon-muted">topK={choice.topK} · pool={choice.samplingPoolCandidateIds?.length ?? 0}</span>
      </div>
      <div className="text-canon-faint">used atoms: {choice.usedAtomIds?.length ?? 0}</div>
      {(choice.ranked ?? []).map((candidate) => <div key={candidate.utilityCandidateId} className={candidate.chosen ? 'text-canon-accent' : 'text-canon-muted'}>
        {actionLabel(candidate.kernelActionId)} · Q={f3(candidate.q)} · sample={f3(candidate.sampleScore)}{candidate.inSamplingPool ? ' · pool' : ''}
      </div>)}
    </div>
  ) : <div className="mt-2 text-[10px] text-canon-faint">Trace недоступен</div>;

  return <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">{(session.decisions ?? []).map((decision) => (
    <details key={decision.tick} className="rounded-lg border border-canon-border/50 bg-canon-card p-3" open={decision.tick === session.decisions.length - 1}>
      <summary className="cursor-pointer text-xs text-canon-text">R{decision.tick + 1} · {decision.divergence.anyDifference ? 'canonical/reference divergence' : 'canonical/reference agree'}</summary>
      <div className="mt-2 space-y-2">{(decision.players ?? []).flatMap((actorId) => (decision.players ?? []).filter((targetId) => targetId !== actorId).map((targetId) => {
        const choice = decision.choices?.[actorId]?.[targetId];
        const divergence = decision.divergence.byActorTarget?.[actorId]?.[targetId];
        return <details key={JSON.stringify([actorId, targetId])} className="rounded bg-canon-bg/50 p-2">
          <summary className="cursor-pointer text-[10px] text-canon-muted">
            <span className="text-canon-text">{actorId.replace('character-', '')} → {targetId.replace('character-', '')}</span>
            {' · '}{choice ? actionLabel(choice.kernelActionId) : 'н/д'}
            {divergence && <span className={divergence.same ? ' text-canon-good' : ' text-yellow-300'}>{divergence.same ? ' · agree' : ` · ref ${actionLabel(divergence.referenceActionId)}`}</span>}
          </summary>
          {renderChoice(choice)}
        </details>;
      }))}</div>
    </details>
  ))}</div>;
};

export const DilemmaLabPanel: React.FC = () => {
  const { characters } = useSandbox();
  const scenarios = useMemo(() => allScenarios(), []);
  const disabledScenarios = useMemo(() => allScenarios({ includeDisabled: true }).filter((s) => s.disabled), []);
  const mechanics = useMemo(() => allMechanics(), []);
  const inventoryByScenario = useMemo(
    () => new Map<string, ConflictInventoryEntry>(CONFLICT_SCENARIO_INVENTORY.map((e) => [e.scenarioId, e])),
    [],
  );
  // R6 step 4: active scenarios are runnable, so their lane is decided by typed
  // inventory kind (canonical kernel vs explicit compatibility run). Disabled
  // scenarios are not in the runnable registry → always the unavailable lane.
  const canonicalScenarios = useMemo(
    () => scenarios.filter((s) => conflictCatalogLane(inventoryByScenario.get(s.id)?.kind, true) === 'canonical'),
    [scenarios, inventoryByScenario],
  );
  const compatScenarios = useMemo(
    () => scenarios.filter((s) => conflictCatalogLane(inventoryByScenario.get(s.id)?.kind, true) === 'compatibility'),
    [scenarios, inventoryByScenario],
  );
  const scenarioIds = useMemo(() => scenarios.map((s) => s.id), [scenarios]);
  const [scenarioId, setScenarioId] = useState(scenarioIds[0] ?? 'trust_interrogation');
  const [cardinality, setCardinality] = useState<DilemmaLabCardinality>('dyad');
  const [totalRounds, setTotalRounds] = useState(10);
  const [p0, setP0] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [instPressure, setInstPressure] = useState<number | null>(null);
  const [pressureSchedule, setPressureSchedule] = useState<PressureSchedule | undefined>(undefined);
  const [seed, setSeed] = useState(42);
  const [result, setResult] = useState<DilemmaLabResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenario = getScenario(scenarioId);
  const groupByMechanic = (list: ScenarioTemplate[]): Record<string, ScenarioTemplate[]> => {
    const grouped: Record<string, ScenarioTemplate[]> = {};
    for (const s of list) (grouped[s.mechanicId] ??= []).push(s);
    return grouped;
  };
  const canonicalByMechanic = useMemo(() => groupByMechanic(canonicalScenarios), [canonicalScenarios]);
  const compatByMechanic = useMemo(() => groupByMechanic(compatScenarios), [compatScenarios]);
  const dyadResult = result?.kind === 'dyad' ? result.value : null;
  const triadResult = result?.kind === 'triad' ? result.value : null;
  const game = dyadResult?.game ?? null;
  const canonicalVocabulary = conflictCatalogLane(inventoryByScenario.get(scenario.id)?.kind, true) === 'canonical';
  const displayedActions: Array<{ id: string; label: string; requires?: ScenarioTemplate['actionPool'][number]['requires'] }> = canonicalVocabulary
    ? TRUST_EXCHANGE_ACTION_ORDER.map((id) => ({ id, label: TRUST_EXCHANGE_ACTION_LABELS[id] }))
    : scenario.actionPool;
  const displayActionLabel = (actionId: string): string => canonicalVocabulary
    ? TRUST_EXCHANGE_ACTION_LABELS[actionId as keyof typeof TRUST_EXCHANGE_ACTION_LABELS] ?? actionId
    : scenario.actionPool.find((action) => action.id === actionId)?.label ?? actionId;

  const allChars = useMemo(() => {
    const base = getAllCharactersWithRuntime();
    const m = new Map<string, CharacterEntity>();
    for (const c of base) m.set(c.entityId, c);
    for (const c of characters) m.set(c.entityId, c as CharacterEntity);
    return Array.from(m.values());
  }, [characters]);

  const opts = useMemo(() => allChars.map(c => ({ id: c.entityId, label: c.title || c.entityId })), [allChars]);
  const triadAvailable = canonicalVocabulary && scenario.mechanicId === 'trust_exchange' && opts.length >= 3;

  useEffect(() => {
    if (opts.length >= 2) {
      setP0(p => opts.some(a => a.id === p) ? p : opts[0].id);
      setP1(p => {
        if (opts.some(a => a.id === p) && p !== opts[0].id) return p;
        return opts[1]?.id ?? opts[0].id;
      });
      setP2(p => {
        if (opts.some(a => a.id === p) && p !== opts[0].id && p !== opts[1]?.id) return p;
        return opts[2]?.id ?? '';
      });
    }
  }, [opts]);

  useEffect(() => {
    setP2((current) => {
      if (opts.some((option) => option.id === current) && current !== p0 && current !== p1) return current;
      return opts.find((option) => option.id !== p0 && option.id !== p1)?.id ?? '';
    });
  }, [opts, p0, p1]);

  useEffect(() => {
    if (cardinality === 'triad' && !triadAvailable) {
      setCardinality('dyad');
      setResult(null);
    }
  }, [cardinality, triadAvailable]);

  const reset = useCallback(() => { setResult(null); setError(null); }, []);

  /**
   * Запуск v2 раннера с валидацией входных границ:
   * - два различных персонажа;
   * - наличие агентов в world-state.
   */
  const run = useCallback(() => {
    const id0 = p0.trim(); const id1 = p1.trim(); const id2 = p2.trim();
    const selectedIds = cardinality === 'triad' ? [id0, id1, id2] : [id0, id1];
    if (selectedIds.some((id) => !id) || new Set(selectedIds).size !== selectedIds.length) {
      setError(cardinality === 'triad' ? 'Выбери трёх разных персонажей' : 'Выбери двух разных персонажей');
      return;
    }
    setError(null);
    try {
      const world = buildMinimalWorld(allChars);
      const find = (id: string) => world.agents?.find(a => (a as any).entityId === id || (a as any).id === id);
      const missingId = cardinality === 'triad' ? selectedIds.find((id) => !find(id)) : undefined;
      if (missingId) throw new Error(`"${missingId}" not found`);
      if (cardinality === 'triad') {
        const triad = runConflictTargetMatrixLabSessionV1({
          scenarioId,
          players: [id0, id1, id2],
          totalRounds: Math.max(1, Math.floor(totalRounds)),
          world,
          seed,
          institutionalPressure: instPressure ?? undefined,
          pressureSchedule,
        });
        if (triad.ok === false) {
          setError(triad.error.message);
          setResult(null);
          return;
        }
        setResult({ kind: 'triad', value: triad.value });
        return;
      }
      if (!find(id0)) throw new Error(`"${id0}" не найден`);
      if (!find(id1)) throw new Error(`"${id1}" не найден`);
      const res = runConflictLabSessionV1({
        scenarioId,
        players: [id0, id1],
        totalRounds: Math.max(1, Math.floor(totalRounds)),
        world,
        seed,
        institutionalPressure: instPressure ?? undefined,
        pressureSchedule,
      });
      setResult({ kind: 'dyad', value: res });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  }, [scenarioId, cardinality, p0, p1, p2, totalRounds, seed, instPressure, pressureSchedule, allChars]);

  const download = useCallback(() => {
    if (!result) return;
    const ts = new Date().toISOString();
    if (result.kind === 'triad') {
      const players = result.value.players;
      const payload = buildConflictTargetMatrixSessionExport({
        exportedAt: ts,
        config: {
          scenarioId,
          selectedPlayers: players,
          totalRoundsRequested: totalRounds,
          seed,
          institutionalPressure: instPressure ?? undefined,
          pressureSchedule,
        },
        scenario,
        participants: players.map((playerId) => allChars.find((character) => character.entityId === playerId)).filter((character): character is CharacterEntity => Boolean(character)),
        session: result.value,
      });
      downloadJson(payload, makeConflictTargetMatrixSessionFileName({ scenarioId, players, exportedAt: ts }));
      return;
    }
    const dyadGame = result.value.game;
    const safe = (s: string) => s.replace(/[^a-z0-9_-]/gi, '_');
    downloadJson({ schema: result.value.canonicalSession ? 'ConflictLabSessionV1' : 'DilemmaLabV2', exportedAt: ts, scenarioId, scenario, ...result.value },
      `dilemma-v2__${safe(scenarioId)}__${safe(dyadGame.players[0])}__${safe(dyadGame.players[1])}__${ts.replace(/[:.]/g, '-')}.json`);
  }, [result, scenarioId, scenario, totalRounds, seed, instPressure, pressureSchedule, allChars]);

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
        <div className="mt-2">
          <Link
            to="/access"
            className="inline-flex items-center gap-1 rounded-md border border-canon-border bg-canon-card px-2 py-1 text-[11px] text-canon-text hover:border-canon-accent/50 hover:text-canon-accent transition"
            title="Перейти в модуль доступа к Lab"
          >
            🔐 Доступ в Lab
          </Link>
        </div>
        <div className="mt-2 rounded-lg border border-canon-border/60 bg-canon-card px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] text-canon-muted">Mafia вынесена в отдельный режим, чтобы не смешивать multi-agent hidden-role игру с dyad-v2.</div>
            <div className="text-[10px] text-canon-faint mt-1">Там отдельный фронт, нормальный конфиг ролей, single/batch и таймлайн по дням/ночам.</div>
          </div>
          <Link
            to="/conflict-lab?tab=mafia"
            className="inline-flex items-center gap-1 rounded-md border border-canon-accent/40 bg-canon-accent/10 px-3 py-1.5 text-[11px] text-canon-accent hover:bg-canon-accent/20 transition"
          >
            ◈ Открыть Mafia Lab
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-canon-panel border border-canon-border rounded-lg p-4 space-y-4">
          <div className="space-y-3">
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">Protocol kernel → preset</div>
            <div className="text-[11px] text-canon-muted">Каталог размечен типизированным R6-инвентарём. <span className="text-canon-good">Canonical kernel</span> исполняет S8-ядро; остальные — явные compatibility-прогоны (legacy V2 + <span className="text-yellow-300">unsupported_kernel</span>). Presentation не повышает пресет до исполнимой механики.</div>

            <div className="text-[10px] font-semibold uppercase tracking-wider text-canon-good/80 pt-1">Canonical kernel</div>
            {mechanics
              .filter((mechanic) => (canonicalByMechanic[mechanic.id] ?? []).length > 0)
              .map((mechanic) => (
                <MechanicSection
                  key={`canon-${mechanic.id}`}
                  mechanic={mechanic}
                  scenarios={canonicalByMechanic[mechanic.id] ?? []}
                  selectedScenarioId={scenarioId}
                  onSelect={(id) => { setScenarioId(id); reset(); }}
                  inventoryByScenario={inventoryByScenario}
                />
              ))}

            {compatScenarios.length > 0 && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-yellow-300/80 pt-2">Совместимость — вне типизированного kernel</div>
                <div className="text-[10px] text-canon-faint">Выбираемы и запускаются, но не имеют типизированного transition-ядра: прогон идёт на legacy/unsupported_kernel-полосе.</div>
                {mechanics
                  .filter((mechanic) => (compatByMechanic[mechanic.id] ?? []).length > 0)
                  .map((mechanic) => (
                    <MechanicSection
                      key={`compat-${mechanic.id}`}
                      mechanic={mechanic}
                      scenarios={compatByMechanic[mechanic.id] ?? []}
                      selectedScenarioId={scenarioId}
                      onSelect={(id) => { setScenarioId(id); reset(); }}
                      inventoryByScenario={inventoryByScenario}
                    />
                  ))}
              </>
            )}

            {disabledScenarios.length > 0 && (
              <div className="rounded-lg border border-canon-border/40 bg-canon-bg/30 p-3 space-y-2">
                <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Недоступно — вне runnable-реестра</div>
                <div className="text-[10px] text-canon-faint">Убраны из активного каталога (не чистые dyad-сцены / дубликаты) и не запускаются.</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {disabledScenarios.map((s) => (
                    <ScenarioCard key={s.id} s={s} selected={false} disabled inventory={inventoryByScenario.get(s.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="text-xs text-canon-muted bg-canon-card border border-canon-border/50 rounded-lg p-3 italic">{scenario.setup}</div>
          <ProtocolSkeleton protocol={scenario.protocol} />
          <div className="text-[10px] text-canon-faint">
            Механика: <span className="text-canon-text">{scenario.mechanicName}</span> · класс: {scenario.dilemmaClass} · действия: {displayedActions.map(a => a.label).join(' · ')}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-canon-border bg-canon-bg p-1 w-fit">
            <button type="button" onClick={() => { setCardinality('dyad'); reset(); }} className={`px-3 py-1 rounded text-xs transition ${cardinality === 'dyad' ? 'bg-canon-accent text-canon-bg font-semibold' : 'text-canon-muted hover:text-canon-text'}`}>Диада</button>
            <button type="button" disabled={!triadAvailable} title={triadAvailable ? 'Три участника с направленными решениями' : 'Триада доступна только для canonical trust_exchange и минимум трёх персонажей'} onClick={() => { setCardinality('triad'); reset(); }} className={`px-3 py-1 rounded text-xs transition ${cardinality === 'triad' ? 'bg-canon-accent text-canon-bg font-semibold' : 'text-canon-muted hover:text-canon-text'} disabled:opacity-35 disabled:cursor-not-allowed`}>Триада</button>
          </div>

          <div className={`grid grid-cols-2 ${cardinality === 'triad' ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-3`}>
            <label className="text-xs text-canon-muted">A
              <select value={p0} onChange={e => { setP0(e.target.value); reset(); }} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text">
                {opts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-canon-muted">B
              <select value={p1} onChange={e => { setP1(e.target.value); reset(); }} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text">
                {opts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            {cardinality === 'triad' && <label className="text-xs text-canon-muted">C
              <select value={p2} onChange={e => { setP2(e.target.value); reset(); }} className="w-full mt-1 bg-canon-bg border border-canon-border rounded-lg p-2 text-sm text-canon-text">
                {opts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>}
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
              <div className="flex items-center gap-1 mt-1">
                <select value={pressureSchedule?.shape ?? 'flat'} onChange={e => {
                  const v = e.target.value;
                  if (v === 'flat') setPressureSchedule(undefined);
                  else if (v === 'rising') setPressureSchedule({ shape: 'rising', floor: 0.1 });
                  else if (v === 'falling') setPressureSchedule({ shape: 'falling', floor: 0.1 });
                  else if (v === 'spike') setPressureSchedule({ shape: 'spike', peakRound: Math.floor(totalRounds / 2), floor: 0.1 });
                }} className="bg-canon-bg border border-canon-border rounded px-1 py-0.5 text-[10px] text-canon-text">
                  <option value="flat">▬ плоское</option>
                  <option value="rising">↗ нарастание</option>
                  <option value="falling">↘ спад</option>
                  <option value="spike">⌒ пик</option>
                </select>
                {pressureSchedule && 'floor' in pressureSchedule && <>
                  <span className="text-[9px] text-canon-faint ml-1">мин:</span>
                  <input type="range" min={0} max={100} value={Math.round(pressureSchedule.floor * 100)} onChange={e => setPressureSchedule({ ...pressureSchedule, floor: Number(e.target.value) / 100 })} className="flex-1 accent-canon-accent" style={{ maxWidth: 60 }} />
                  <span className="text-[9px] font-mono text-canon-faint">{f2(pressureSchedule.floor)}</span>
                </>}
                {pressureSchedule?.shape === 'spike' && <>
                  <span className="text-[9px] text-canon-faint ml-1">пик:</span>
                  <input type="number" min={0} max={totalRounds - 1} value={pressureSchedule.peakRound} onChange={e => setPressureSchedule({ ...pressureSchedule, peakRound: Number(e.target.value) })} className="bg-canon-bg border border-canon-border rounded px-1 py-0.5 text-[10px] text-canon-text w-10" />
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
          <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider">Ставки и протокол</div>
          <div className="text-[10px] text-canon-faint">{scenario.mechanicDescription}</div>
          <div className="rounded-lg border border-canon-border/40 bg-canon-bg/35 p-2 space-y-1 text-[10px]">
            <div className="flex justify-between gap-2">
              <span className="text-canon-faint">kernel</span>
              <span className="text-canon-text text-right">{scenario.protocol.kernel}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-canon-faint">type</span>
              <span className="text-canon-text text-right">{scenario.protocol.typeLabel}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-canon-faint">main parameter</span>
              <span className="text-canon-text text-right">{scenario.protocol.primaryParameter}</span>
            </div>
            <div>
              <div className="text-canon-faint">state</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {scenario.protocol.stateVariables.map((v) => (
                  <span key={v} className="rounded bg-canon-card px-1.5 py-0.5 text-[9px] text-canon-muted">{v}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-canon-faint">attractor risk</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {scenario.protocol.attractorRisks.map((risk) => (
                  <span key={risk} className="rounded bg-canon-bad/10 px-1.5 py-0.5 text-[9px] text-canon-muted">{risk}</span>
                ))}
              </div>
            </div>
          </div>
          <MiniBar label="personal" value={scenario.stakes.personal} color="#ff79c6" />
          <MiniBar label="relational" value={scenario.stakes.relational} color="#9b87ff" />
          <MiniBar label="institutional" value={scenario.stakes.institutional} color="#ffaa44" />
          <MiniBar label="physical" value={scenario.stakes.physical} color="#ff5c7a" />
          <div className="text-[10px] text-canon-faint">
            Видимость: {scenario.visibility.actionsVisible ? 'открыто' : 'скрыто'}
            {scenario.visibility.audiencePresent ? ' + публика' : ''}
            {scenario.visibility.consequencesDeferred ? ' + отложенные последствия' : ''}
            {' · '}
            Давл: {pct(instPressure ?? scenario.institutionalPressure)}{pressureSchedule ? ` (${pressureSchedule.shape})` : ''}
          </div>
          <div className="border-t border-canon-border/30 pt-2 mt-2">
            <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-1">Действия</div>
            {displayedActions.map(a => (
              <div key={a.id} className="text-[10px] text-canon-muted py-0.5">
                <span className="text-canon-text font-medium">{a.label}</span>
                {a.requires && <span className="text-canon-faint ml-1">[{a.requires.roles?.join('/') || ''}{a.requires.minClearance ? ` cl≥${a.requires.minClearance}` : ''}]</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {dyadResult && game && (
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
                    {game.players.map(pid => <div key={pid} className="flex items-center gap-1.5"><span className="text-canon-muted">{pid.replace('character-', '')}</span><ConfBadge value={dyadResult.confidence[pid] ?? 0} /></div>)}
                  </div>
                  {game.players.map(pid => <div key={pid} className="text-[10px] text-canon-muted italic bg-canon-card border border-canon-border/30 rounded p-2">{dyadResult.summaries[pid]}</div>)}
                  {actionCounts && <div className="grid grid-cols-2 gap-4">
                    {game.players.map(pid => (
                      <div key={pid}>
                        <div className="text-[10px] font-semibold text-canon-muted mb-1">{pid.replace('character-', '')}</div>
                        {(Object.entries(actionCounts[pid] ?? {}) as Array<[string, number]>).sort((a, b) => b[1] - a[1]).map(([aid, cnt]) => (
                          <div key={aid} className="flex items-center gap-1 text-[10px]">
                            <span className="text-canon-text flex-1 truncate">{displayActionLabel(aid)}</span>
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
                          <span className="text-canon-accent truncate flex-1">{displayActionLabel(r.choices[game.players[0]])}</span>
                          <span className="text-canon-faint">×</span>
                          <span className="text-canon-accent-2 truncate flex-1 text-right">{displayActionLabel(r.choices[game.players[1]])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              label: 'Core Dynamics', content: (
                <CoreDynamicsBlock core={dyadResult.conflictCore} />
              ),
            },
            {
              label: dyadResult.canonicalSession ? 'S8 Choice Trace' : 'Legacy V2 Trace', content: dyadResult.canonicalSession ? (
                <div className="p-4 space-y-3">
                  <div className="text-xs text-canon-muted">
                    Authoritative policy: {dyadResult.canonicalSession.policyId} v{dyadResult.canonicalSession.policyVersion}. Kernel autonomous choice remains the reference lane.
                  </div>
                  {dyadResult.canonicalSession.decisions.map((decision) => (
                    <div key={decision.tick} className="rounded-lg border border-canon-border/50 bg-canon-card p-3 space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-canon-text">tick {decision.tick}</span>
                        <span className={decision.divergence.anyDifference ? 'text-yellow-300' : 'text-canon-good'}>
                          {decision.divergence.anyDifference ? 'canonical/reference divergence' : 'canonical/reference agree'}
                        </span>
                      </div>
                      {decision.players.map((playerId) => {
                        const choice = decision.choices[playerId];
                        if (!choice) return null;
                        return (
                          <div key={playerId} className="rounded bg-canon-bg/50 p-2 space-y-1 text-[10px]">
                            <div className="flex flex-wrap gap-3">
                              <span className="text-canon-text">{playerId}: {displayActionLabel(choice.kernelActionId)}</span>
                              <span className="text-canon-muted">T={f3(choice.temperature)} ({choice.temperatureSource})</span>
                              <span className="text-canon-muted">topK={choice.topK}</span>
                              <span className="text-canon-muted">pool={choice.samplingPoolCandidateIds.length}</span>
                            </div>
                            <div className="text-canon-faint">used atoms: {choice.usedAtomIds.length}</div>
                            {choice.ranked.map((candidate) => (
                              <div key={candidate.utilityCandidateId} className={candidate.chosen ? 'text-canon-accent' : 'text-canon-muted'}>
                                {displayActionLabel(candidate.kernelActionId)} · Q={f3(candidate.q)} · sample={f3(candidate.sampleScore)}{candidate.inSamplingPool ? ' · pool' : ''}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <div className="text-xs text-canon-muted">Legacy/experimental runner trace: 7-осевой utility · confidence · объяснения · state updates</div>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {game.rounds.map((_, i) => <V2TraceBlock key={i} round={i} game={game} scenario={scenario} />)}
                  </div>
                </div>
              ),
            },
          ]} />
        </div>
      )}

      {triadResult && (
        <div className="bg-canon-panel border border-canon-border rounded-lg overflow-hidden">
          <Tabs syncKey="dlv2-triad" className="flex flex-col" contentClassName="min-h-0" tabs={[
            {
              label: 'Результаты N=3', content: (
                <div className="p-4 space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div><div className="text-sm font-semibold text-canon-text">{scenario.name} · {triadResult.totalRounds} раундов · directed target matrix</div><div className="text-[10px] text-canon-faint">{triadResult.schemaVersion} · {triadResult.runtime}</div></div>
                    <button onClick={download} className="px-2.5 py-1 rounded-md bg-canon-card border border-canon-border text-[11px] text-canon-text hover:border-canon-accent/50 transition">⬇ Export</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px]">
                    <div className="rounded bg-canon-card p-2"><div className="text-canon-faint">distance</div><div className="font-mono text-canon-text">{f3(triadResult.metrics.distanceFromStart)}</div></div>
                    <div className="rounded bg-canon-card p-2"><div className="text-canon-faint">collapse</div><div className="font-mono text-canon-text">{f3(triadResult.metrics.collapseScore)}</div></div>
                    <div className="rounded bg-canon-card p-2"><div className="text-canon-faint">repair</div><div className="font-mono text-canon-text">{f3(triadResult.metrics.repairCapacity)}</div></div>
                    <div className="rounded bg-canon-card p-2"><div className="text-canon-faint">cycle</div><div className="font-mono text-canon-text">{triadResult.metrics.cyclePeriod ?? '—'}</div></div>
                    <div className="rounded bg-canon-card p-2"><div className="text-canon-faint">divergence rate</div><div className="font-mono text-canon-text">{triadResult.metrics.divergenceRate === undefined ? '—' : f3(triadResult.metrics.divergenceRate)}</div></div>
                  </div>
                  <div><div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">Directed relation matrix · final state</div><DirectedRelationMatrix players={triadResult.players ?? []} relations={triadResult.finalState?.relations} /></div>
                  <div>
                    <div className="text-xs font-semibold text-canon-muted uppercase tracking-wider mb-2">Action matrices by round</div>
                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">{(triadResult.decisions ?? []).map((decision) => <details key={decision.tick} className="rounded-lg border border-canon-border/50 bg-canon-card p-3" open={decision.tick === triadResult.decisions.length - 1}>
                      <summary className="cursor-pointer text-xs text-canon-text">R{decision.tick + 1} · {decision.divergence.anyDifference ? 'divergence' : 'agree'}</summary>
                      <div className="mt-2"><DirectedActionMatrix matrix={decision.canonical?.actionMatrix} actionLabel={displayActionLabel} /></div>
                    </details>)}</div>
                  </div>
                </div>
              ),
            },
            { label: 'S8 Cell Traces', content: <div className="p-4 space-y-3"><div className="text-xs text-canon-muted">Один S8 choice trace на каждую направленную пару actor → target.</div><TargetChoiceTrace session={triadResult} actionLabel={displayActionLabel} /></div> },
          ]} />
        </div>
      )}

      {!result && <div className="text-center py-12 space-y-2"><div className="text-3xl opacity-20">◆</div><div className="text-sm text-canon-faint">Выбери сценарий и персонажей → <span className="text-canon-accent">▶ Запустить</span></div></div>}
    </div>
  );
};
