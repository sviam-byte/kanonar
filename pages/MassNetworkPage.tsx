
import React, { useMemo } from 'react';
import { useBranch } from '../contexts/BranchContext';
import { Branch, AnyEntity, MassNetworkEI, MassNodeId } from '../types';
import { useSandbox } from '../contexts/SandboxContext';
import { buildDefaultMassNetworkEI } from '../lib/mass/build_ei';
import { computeMassInputsFromMembership, MicroToMesoConfigEI } from '../lib/mass/membership';
import { stepMassNetworkEI } from '../lib/mass/ei_dynamics';

// Re-implementing the hook inline or you can create a new file for useMassSimulationEI if preferred.
// For simplicity in this patch, I will define the hook logic inside this component file 
// or just update the existing logic if cleaner. 
// Let's create a separate hook function here for clarity.

import { useEffect, useRef, useState } from 'react';

function useMassSimulationEI(
  branch: Branch,
  entities: AnyEntity[],
  cfg: { dt: number; microToMeso: MicroToMesoConfigEI }
) {
  const [network, setNetwork] = useState<MassNetworkEI>(() =>
    buildDefaultMassNetworkEI(branch)
  );
  const [running, setRunning] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => {
    setNetwork(buildDefaultMassNetworkEI(branch));
  }, [branch]);

  const entitiesRef = useRef<AnyEntity[]>(entities);
  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    if (!running) return;
    let frameId: number;
    let lastTime = performance.now();
    const loop = (time: number) => {
      const dtMs = time - lastTime;
      const dtSim = cfg.dt * (dtMs / 16.67) * speed;
      lastTime = time;

      setNetwork(prev => {
        const inputs = computeMassInputsFromMembership(prev, entitiesRef.current, cfg.microToMeso);
        return stepMassNetworkEI(prev, dtSim, inputs);
      });
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [running, speed, cfg.dt]);

  const reset = () => setNetwork(buildDefaultMassNetworkEI(branch));
  return { network, running, setRunning, speed, setSpeed, reset };
}

export const MassNetworkPage: React.FC = () => {
  const { branch } = useBranch();
  const { characters } = useSandbox();

  // Initialize membership for visualization if missing
  const preparedCharacters = useMemo(() => {
      return characters.map(c => {
          if (!c.massMembership) {
              // Default logic: prioritize massNodeId, else map to first node
              const defaultNet = buildDefaultMassNetworkEI(branch);
              const nodeId = c.massNodeId && defaultNet.nodes[c.massNodeId] 
                  ? c.massNodeId 
                  : defaultNet.nodeOrder[0];
              return { ...c, massMembership: { [nodeId]: 1.0 } };
          }
          return c;
      });
  }, [characters, branch]);

  const simCfg = useMemo(
    () => ({
      dt: 0.1,
      microToMeso: {
        weightStressToE: 0.2,
        weightDarkToE: 0.1,
        weightRiskToE: 0.1,
        weightStressToI: 0.05,
        weightDarkToI: 0.01,
        weightRiskToI: 0.0,
        baseNoiseE: 0.3,
        baseNoiseI: 0.2,
      },
    }),
    []
  );

  const {
    network,
    running,
    setRunning,
    speed,
    setSpeed,
    reset,
  } = useMassSimulationEI(branch as Branch, preparedCharacters as AnyEntity[], simCfg);

  const { nodeOrder, nodes } = network;

  const getCharsInNode = (nodeId: string) => {
      return preparedCharacters.filter(c => c.massMembership?.[nodeId] && c.massMembership[nodeId] > 0.1);
  };

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <header className="space-y-3">
        <div>
            <h1 className="text-2xl font-bold text-canon-accent">
            Слой масс E/I (Excitation/Inhibition)
            </h1>
            <p className="text-sm text-canon-text-light mt-1">
            Узлы описываются моделью Вильсона-Кована. <strong className="text-canon-accent">E</strong> (Excitation) — паника/возбуждение. <strong className="text-blue-400">I</strong> (Inhibition) — контроль/подавление.
            </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-canon-bg-light p-2 rounded border border-canon-border/50">
          <button
            onClick={() => setRunning(!running)}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded border transition-colors ${
                running 
                ? 'bg-canon-accent text-canon-bg border-canon-accent' 
                : 'bg-canon-bg text-canon-text border-canon-border hover:border-canon-accent'
            }`}
          >
            {running ? 'Пауза' : 'Симуляция'}
          </button>
          <button
            onClick={reset}
            className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded border border-canon-border bg-canon-bg text-canon-text hover:text-canon-red hover:border-canon-red transition-colors"
          >
            Сброс
          </button>

          <div className="h-6 w-px bg-canon-border mx-2" />

          <div className="flex items-center gap-3 text-xs text-canon-text-light">
            <span>Скорость:</span>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
              className="w-24 h-1.5 bg-canon-border rounded-lg appearance-none cursor-pointer accent-canon-accent"
            />
            <span className="font-mono w-8 text-right">
              {speed.toFixed(1)}×
            </span>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {nodeOrder.map((id: MassNodeId) => {
            const node = nodes[id];
            if (!node) return null;

            const eVal = Math.min(1, Math.max(0, node.E));
            const iVal = Math.min(1, Math.max(0, node.I));
            const population = getCharsInNode(id);

            return (
              <div
                key={id}
                className="border border-canon-border rounded-lg p-3 bg-canon-bg-light shadow-sm flex flex-col gap-3 transition-all hover:border-canon-border/70"
              >
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm text-canon-text leading-tight">{node.label}</div>
                    <div className="text-[10px] font-mono text-canon-text-light opacity-70">
                        {id}
                    </div>
                  </div>
                </div>

                {/* E/I Bars */}
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono w-4 text-canon-accent font-bold">E</span>
                        <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                            <div className="h-full bg-canon-accent transition-[width] duration-100 ease-linear" style={{ width: `${eVal * 100}%` }} />
                        </div>
                        <span className="font-mono text-[9px] w-6 text-right">{node.E.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono w-4 text-blue-400 font-bold">I</span>
                        <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                            <div className="h-full bg-blue-400 transition-[width] duration-100 ease-linear" style={{ width: `${iVal * 100}%` }} />
                        </div>
                         <span className="font-mono text-[9px] w-6 text-right">{node.I.toFixed(2)}</span>
                    </div>
                </div>

                {/* Params Grid */}
                <dl className="grid grid-cols-3 gap-1 text-[9px] text-canon-text-light border-t border-b border-canon-border/30 py-2">
                  <div className="flex flex-col items-center border-r border-canon-border/20 last:border-0">
                    <dt>τ (E/I)</dt>
                    <dd className="font-mono text-canon-text">{node.params.tauE}/{node.params.tauI}</dd>
                  </div>
                  <div className="flex flex-col items-center border-r border-canon-border/20 last:border-0">
                    <dt>Gain</dt>
                    <dd className="font-mono text-canon-text">{node.params.gainE.toFixed(1)}</dd>
                  </div>
                  <div className="flex flex-col items-center">
                    <dt>Noise</dt>
                    <dd className="font-mono text-canon-text">{node.params.noiseScaleE.toFixed(1)}</dd>
                  </div>
                </dl>
                
                {/* Population */}
                <div className="flex-grow">
                    <div className="flex justify-between items-center mb-1.5">
                        <div className="text-[9px] text-canon-text-light uppercase font-bold tracking-wider">
                            Pop ({population.length})
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 content-start">
                        {population.map(c => {
                            const stress = c.body?.acute?.stress ?? 0;
                            const isStressed = stress > 50;
                            const weight = c.massMembership?.[id] ?? 0;
                            return (
                                <div 
                                    key={c.entityId} 
                                    className={`
                                        px-1.5 py-0.5 rounded border text-[9px] truncate max-w-[100%] flex items-center gap-1 transition-colors
                                        ${isStressed 
                                            ? 'bg-red-900/20 border-red-500/30 text-red-300' 
                                            : 'bg-canon-bg border-canon-border/50 text-canon-text-light'
                                        }
                                    `}
                                    style={{ opacity: 0.5 + weight * 0.5 }}
                                    title={`${c.title} (w=${weight.toFixed(1)}, Stress=${stress.toFixed(0)}%)`}
                                >
                                   <div className={`w-1 h-1 rounded-full ${isStressed ? 'bg-red-500 animate-pulse' : 'bg-green-500/50'}`}></div>
                                   <span className="truncate">{c.title.split(' ')[0]}</span>
                                </div>
                            );
                        })}
                        {population.length === 0 && (
                            <div className="text-[10px] text-canon-text-light/40 italic w-full text-center py-2">
                                Пусто
                            </div>
                        )}
                    </div>
                </div>
                
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
