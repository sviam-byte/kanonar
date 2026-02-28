/**
 * SimulationHubPage — standalone entry point for the simulation orchestrator.
 *
 * The simulation module is an orchestrator: it does not do computation itself,
 * it wires together GoalLab pipelines, SimKit core, and scenario definitions.
 *
 * Entry cards:
 * - SimKit Lab (full orchestrator setup + run)
 * - Simulations catalog (pre-built scenarios)
 * - Quick Start (pick cast + location → run 10 ticks)
 */
import React, { useState, useMemo, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { allSimulations } from '../data/simulations';
import { getAllCharactersWithRuntime } from '../data';
import { allLocations } from '../data/locations';
import { useAccess } from '../contexts/AccessContext';

const SimulatorLab = lazy(() =>
  import('../lib/goal-lab/labs/SimulatorLab').then(m => ({ default: m.SimulatorLab }))
);

type View = 'hub' | 'simkit' | 'quick';

export const SimulationHubPage: React.FC = () => {
  const [view, setView] = useState<View>('hub');
  const { activeModule, isRestricted } = useAccess();

  if (view === 'simkit') {
    return (
      <div className="h-[calc(100vh-64px)] w-full flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-4 py-2 flex items-center gap-3">
          <button
            onClick={() => setView('hub')}
            className="text-[10px] text-slate-400 hover:text-white transition uppercase tracking-wider"
          >
            ← Hub
          </button>
          <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">SimKit Lab</span>
        </div>
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-600 animate-pulse text-sm">Loading SimKit…</div>}>
            <SimulatorLab orchestratorRegistry={[]} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (view === 'quick') {
    return <QuickStart onBack={() => setView('hub')} />;
  }

  const simulations = isRestricted && activeModule
    ? allSimulations.filter(s => activeModule.isSimulationAllowed(s.key))
    : allSimulations;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-2 text-white">Модуль Симуляции</h2>
        <p className="text-sm text-slate-400 max-w-2xl mx-auto">
          Оркестратор сценариев: подключает GoalLab pipeline, SimKit ядро и определения сценариев.
          Сама симуляция не вычисляет — она собирает модули воедино.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <button
          onClick={() => setView('simkit')}
          className="text-left p-6 bg-gradient-to-br from-slate-900 to-slate-800 border border-cyan-700/30 rounded-lg hover:border-cyan-500/60 hover:shadow-lg hover:shadow-cyan-500/10 transition-all group"
        >
          <div className="text-lg font-bold text-cyan-400 mb-1 group-hover:text-cyan-300">SimKit Lab</div>
          <p className="text-[11px] text-slate-400">Полный оркестратор: выбор локаций, каста, размещение, запуск тиков с pipeline.</p>
        </button>

        <button
          onClick={() => setView('quick')}
          className="text-left p-6 bg-gradient-to-br from-slate-900 to-slate-800 border border-emerald-700/30 rounded-lg hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/10 transition-all group"
        >
          <div className="text-lg font-bold text-emerald-400 mb-1 group-hover:text-emerald-300">Quick Start</div>
          <p className="text-[11px] text-slate-400">Быстрый запуск: выбери каст и локацию → 10 тиков автоматически.</p>
        </button>

        <Link
          to="/goal-lab-v2"
          className="block p-6 bg-gradient-to-br from-slate-900 to-slate-800 border border-amber-700/30 rounded-lg hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 transition-all group"
        >
          <div className="text-lg font-bold text-amber-400 mb-1 group-hover:text-amber-300">GoalLab v2</div>
          <p className="text-[11px] text-slate-400">Контекстная лаборатория: pipeline, POMDP, граф целей, анализ решений.</p>
        </Link>
      </div>

      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Каталог сценариев</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {simulations.map(sim => (
          <Link
            key={sim.key}
            to={`/simulations/${sim.key}`}
            className="block p-4 bg-slate-900/60 border border-slate-800 rounded-lg hover:border-slate-600 transition"
          >
            <div className="font-bold text-slate-200 mb-1">{sim.title}</div>
            <p className="text-[10px] text-slate-500">{sim.description}</p>
            <span className="inline-block mt-2 text-[9px] bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-500">{sim.mode}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

/** Quick start: pick characters + location → auto-run. */
const QuickStart: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const chars = useMemo(() => getAllCharactersWithRuntime().slice(0, 30), []);
  const locs = useMemo(() => allLocations.slice(0, 20), []);
  const [selChars, setSelChars] = useState<Set<string>>(new Set());
  const [selLoc, setSelLoc] = useState('');

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button onClick={onBack} className="text-[10px] text-slate-400 hover:text-white mb-4 uppercase tracking-wider">← Hub</button>
      <h2 className="text-xl font-bold mb-4 text-white">Quick Start</h2>
      <div className="space-y-4">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Location</div>
          <select value={selLoc} onChange={e => setSelLoc(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-300">
            <option value="">— choose —</option>
            {locs.map((l: any) => <option key={l.entityId} value={l.entityId}>{l.title}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Cast ({selChars.size})</div>
          <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
            {chars.map((ch: any) => {
              const sel = selChars.has(ch.entityId);
              return (
                <button
                  key={ch.entityId}
                  onClick={() => setSelChars(prev => { const n = new Set(prev); sel ? n.delete(ch.entityId) : n.add(ch.entityId); return n; })}
                  className={`px-2 py-0.5 rounded text-[10px] border transition ${sel ? 'bg-cyan-900/30 text-cyan-300 border-cyan-600/40' : 'bg-slate-800/40 text-slate-400 border-slate-700/30 hover:text-white'}`}
                >
                  {ch.title || ch.entityId}
                </button>
              );
            })}
          </div>
        </div>
        <button
          disabled={!selLoc || selChars.size < 1}
          className="px-4 py-2 bg-emerald-700/40 border border-emerald-600/40 rounded text-emerald-300 hover:bg-emerald-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold uppercase tracking-wider"
        >
          Run 10 Ticks →
        </button>
        <div className="text-[9px] text-slate-600 italic">
          (WIP: will wire into SimKit orchestrator with auto-placement and default scene preset)
        </div>
      </div>
    </div>
  );
};
