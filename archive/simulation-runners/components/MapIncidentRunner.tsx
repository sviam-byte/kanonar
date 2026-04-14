import React, { useMemo } from 'react';
import { SimulationMeta } from '../../types';
import { MapIncidentPayload, createInitialGrid, runSimulationStep } from '../../lib/simulations/mapIncident';
import { useSimulationRunner } from '../../hooks/useSimulationRunner';

interface MapIncidentRunnerProps {
  sim: SimulationMeta;
}

const getCellColor = (value: number, thresholds: { safe: number, alert: number }): string => {
    if (value < 0.01) return '#1e1e1e'; // canon-bg-light
    if (value >= thresholds.alert) return 'hsl(0, 80%, 50%)'; // Red
    
    // Scale from blue to yellow between safe and alert
    const ratio = Math.min(1, (value - thresholds.safe) / (thresholds.alert - thresholds.safe));
    const hue = 240 - (ratio * 180); // 240 (blue) -> 60 (yellow)
    const lightness = 40 + (ratio * 10);
    return `hsl(${hue}, 90%, ${lightness}%)`;
};


export const MapIncidentRunner: React.FC<MapIncidentRunnerProps> = ({ sim }) => {
    const payload = sim.payload as MapIncidentPayload;
    const { w, h } = payload.grid;
    
    const { day, state: grid, isRunning, controls } = useSimulationRunner<number[][], MapIncidentPayload>({
        payload,
        initialStateFn: (p) => createInitialGrid(p.grid.w, p.grid.h),
        stepFn: runSimulationStep,
        simulationSpeed: 250,
        totalDays: payload.days,
    });

    const areaAboveAlert = useMemo(() => {
        return grid.flat().filter(c => c >= payload.thresholds.alert).length;
    }, [grid, payload.thresholds.alert]);

    return (
        <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-grow">
                 <div 
                    className="grid bg-canon-bg border border-canon-border"
                    style={{
                        gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`,
                        aspectRatio: `${w} / ${h}`
                    }}
                >
                    {grid.map((row, y) => 
                        row.map((cellValue, x) => (
                            <div 
                                key={`${x}-${y}`} 
                                className="w-full h-full"
                                style={{ backgroundColor: getCellColor(cellValue, payload.thresholds) }}
                                title={`(${x},${y}): ${cellValue.toFixed(3)}`}
                            />
                        ))
                    )}
                </div>
            </div>
            <div className="w-full md:w-64 flex-shrink-0 space-y-4">
                <div className="text-center font-mono">
                    <div className="text-canon-text-light text-sm">ДЕНЬ</div>
                    <div className="text-4xl font-bold">{day} / {payload.days}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={controls.toggleRun}
                        className="bg-canon-bg border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors"
                    >
                        {isRunning ? 'Пауза' : 'Старт'}
                    </button>
                    <button 
                        onClick={controls.reset}
                        className="bg-canon-bg border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors"
                    >
                        Сброс
                    </button>
                    <button
                        onClick={controls.stepForward}
                        disabled={isRunning || day >= payload.days}
                        className="col-span-2 bg-canon-bg border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Шаг вперёд
                    </button>
                </div>

                 <div className="border-t border-canon-border pt-4 text-sm space-y-2">
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Диффузия (D):</span>
                        <span className="font-mono">{payload.grid.D}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-canon-text-light">Зона тревоги:</span>
                        <span className={`font-mono ${areaAboveAlert > 0 ? 'text-canon-red' : 'text-canon-green'}`}>{areaAboveAlert} кл.</span>
                    </div>
                </div>

                <div className="border-t border-canon-border pt-4 text-sm">
                    <h4 className="font-bold mb-2">Легенда</h4>
                    <div className="flex items-center space-x-2"><div className="w-4 h-4" style={{backgroundColor: getCellColor(payload.thresholds.alert, payload.thresholds)}}></div><span>Тревога ({`>=${payload.thresholds.alert}`})</span></div>
                    <div className="flex items-center space-x-2"><div className="w-4 h-4" style={{backgroundColor: getCellColor(payload.thresholds.safe + 0.01, payload.thresholds)}}></div><span>Заражение</span></div>
                    <div className="flex items-center space-x-2"><div className="w-4 h-4 bg-canon-bg-light border border-canon-border"></div><span>Безопасно</span></div>
                </div>
            </div>
        </div>
    );
};
