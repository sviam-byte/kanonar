import React, { useMemo, useState } from 'react';
import { useSandbox } from '../../../contexts/SandboxContext';
import { SimMapView } from '../../../components/SimMapView';
import { PlacementMapEditor } from '../../../components/ScenarioSetup/PlacementMapEditor';

type SetupStage = 'loc' | 'entities' | 'env';

function safeName(e: any) {
  return String(e?.name || e?.title || e?.id || '—');
}

const Icon: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center justify-center text-[11px] leading-none" aria-hidden="true">
    {label}
  </span>
);

export const SimulatorLab: React.FC = () => {
  const { sandboxState, entities } = useSandbox();
  const [setupStage, setSetupStage] = useState<SetupStage>('loc');

  // NOTE: Use sandboxState.actions.* to avoid assuming concrete runner APIs.
  const actions = (sandboxState as any)?.actions;

  const isRunning = Boolean((sandboxState as any)?.isSimRunning);
  const selectedLocId =
    (sandboxState as any)?.simAnchorLocationId ||
    (sandboxState as any)?.selectedLocationId ||
    (sandboxState as any)?.activeLocationId ||
    null;

  const characters = useMemo(
    () => (entities || []).filter((e: any) => e?.type === 'character' || e?.type === 'essence' || e?.type === 'actor'),
    [entities]
  );
  const locations = useMemo(() => (entities || []).filter((e: any) => e?.type === 'location'), [entities]);

  const selectedLoc = useMemo(
    () => locations.find((l: any) => String(l?.id) === String(selectedLocId)),
    [locations, selectedLocId]
  );

  const startSim = () => actions?.startSim?.() ?? null;
  const stopSim = () => actions?.stopSim?.() ?? null;
  const nextTick = () => actions?.nextTick?.() ?? actions?.stepSim?.() ?? null;

  /**
   * Try multiple setters so the UI works across Sandbox implementations.
   * If none exist, keep the warning so integrators can wire it up.
   */
  const setAnchor = (locId: string) => {
    if (actions?.setSimAnchorLocationId) return actions.setSimAnchorLocationId(locId);
    if (actions?.setSelectedLocationId) return actions.setSelectedLocationId(locId);
    if (actions?.setActiveLocationId) return actions.setActiveLocationId(locId);

    console.warn('No sandbox actions to set anchor location. Implement setSimAnchorLocationId/setSelectedLocationId.');
  };

  return (
    <div className="h-screen bg-black text-slate-300 flex flex-col font-mono p-1 gap-1 overflow-hidden">
      {/* TOP CONTROL BAR */}
      <header className="h-12 bg-slate-900/80 border border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest">Setup_Engine</span>
            <span className="text-sm text-white font-black italic">KANONAR_SIMKIT</span>
          </div>

          <div className="flex bg-black/40 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => (isRunning ? stopSim() : startSim())}
              className={`px-4 py-1 flex items-center gap-2 text-[10px] rounded transition ${
                isRunning
                  ? 'bg-red-900/20 text-red-300'
                  : 'bg-emerald-600/20 text-emerald-300 shadow-lg shadow-emerald-500/10'
              }`}
            >
              {isRunning ? (
                <>
                  <Icon label="⏳" /> STOP
                </>
              ) : (
                <>
                  <Icon label="▶" /> START_SIM
                </>
              )}
            </button>

            <button
              onClick={nextTick}
              className="ml-2 px-4 py-1 flex items-center gap-2 text-[10px] rounded transition bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15"
              title="Сделать один тик"
            >
              <Icon label="⏭" /> NEXT_TICK
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          {(['loc', 'entities', 'env'] as SetupStage[]).map((s) => (
            <button
              key={s}
              onClick={() => setSetupStage(s)}
              className={`text-[9px] px-2 py-1 uppercase font-bold transition border-b-2 ${
                setupStage === s ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {s === 'loc' ? 'Setup_Location' : s === 'entities' ? 'Populate_World' : 'Environment_Facts'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-1 overflow-hidden">
        {/* LEFT: Setup / Map Viewport */}
        <section className="col-span-8 bg-[#020617] border border-slate-800 relative overflow-hidden">
          {isRunning ? (
            <SimMapView />
          ) : (
            <div className="h-full overflow-hidden">
              {setupStage === 'loc' && (
                <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-light text-white tracking-tight">Select_Simulation_Anchor</h2>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Selected: <span className="text-cyan-300">{selectedLoc ? safeName(selectedLoc) : '—'}</span>
                      </div>
                    </div>

                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 flex items-center gap-2">
                      <Icon label="⚠" /> {selectedLoc ? 'Anchor OK' : 'No_Target_Location'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {locations.map((loc: any) => {
                      const isSel = String(loc?.id) === String(selectedLocId);
                      return (
                        <button
                          key={String(loc?.id)}
                          onClick={() => setAnchor(String(loc?.id))}
                          className={`text-left p-4 bg-slate-900/30 border rounded hover:border-cyan-500/50 cursor-pointer transition group ${
                            isSel ? 'border-cyan-500/80' : 'border-slate-800'
                          }`}
                        >
                          <div className="text-[10px] text-slate-500 group-hover:text-cyan-300">LOCATION_ID</div>
                          <div className="text-sm font-bold text-white mb-4">{safeName(loc)}</div>
                          <div className="text-[10px] uppercase font-black text-cyan-300">
                            {isSel ? 'Selected' : 'Select_Anchor'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {setupStage === 'entities' && (
                <div className="h-full">
                  {/* Placement editor for scenario setup. */}
                  <PlacementMapEditor />
                </div>
              )}

              {setupStage === 'env' && (
                <div className="h-full p-6 overflow-y-auto custom-scrollbar">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
                    <Icon label="🌐" /> Environment_Facts (ctx:*)
                  </div>

                  <div className="bg-black/40 border border-slate-800 rounded p-4 text-[11px] text-slate-300">
                    Тут должен быть UI для ctx-атомов симуляции. Если у тебя уже есть такой в другом месте —
                    просто перенеси компонент сюда.
                    <div className="mt-3 text-[10px] text-slate-500">
                      (Пример: actions.addContextAtom('ctx:danger', 0.8))
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT: Character List + Quick Info */}
        <aside className="col-span-4 flex flex-col gap-1 overflow-hidden">
          <div className="flex-1 bg-slate-900/20 border border-slate-800 flex flex-col overflow-hidden">
            <div className="p-3 bg-slate-900/40 border-b border-slate-800 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
              <Icon label="👥" /> Available_Characters
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {characters.map((char: any) => (
                <div
                  key={String(char?.id)}
                  className="p-2 border border-slate-800 bg-black/40 hover:border-cyan-900 flex justify-between items-center transition"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-white font-bold truncate">{safeName(char)}</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-tighter truncate">
                      id: {String(char?.id)}
                    </div>
                  </div>

                  <button
                    className="text-[10px] bg-slate-800 hover:bg-cyan-900 px-2 py-1 rounded"
                    onClick={() => actions?.addToScene?.(String(char?.id)) ?? null}
                    title="Добавить персонажа в сцену/плейсменты"
                  >
                    ADD
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="h-40 bg-slate-950 border border-slate-800 p-4 flex flex-col">
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
              <Icon label="🛡" /> Anchor_Status
            </div>
            <div className="text-[11px] text-slate-300">
              Location: <span className="text-cyan-300">{selectedLoc ? safeName(selectedLoc) : '— not selected —'}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              Если кнопка выбора не работает — проверь, что у тебя есть один из setters:
              <div className="mt-1 text-slate-400">
                actions.setSimAnchorLocationId / setSelectedLocationId / setActiveLocationId
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="h-6 bg-slate-900 border border-slate-800 flex items-center justify-between px-4 text-[9px] text-slate-500 font-bold tracking-widest uppercase shrink-0">
        <div className="flex gap-6">
          <span className="flex items-center gap-1">
            <Icon label="🛡" /> Integrity_Verified
          </span>
          <span>Local_Host: 127.0.0.1</span>
        </div>
        <div className="flex items-center gap-4 text-cyan-900">
          <span className="animate-pulse">{isRunning ? '● SIM_RUNNING' : '● SIM_IDLE'}</span>
        </div>
      </footer>
    </div>
  );
};
