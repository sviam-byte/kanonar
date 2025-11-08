import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SimulationMeta } from '../../types';
import { LogisticsPayload, LogisticsState, createInitialLogisticsState, runLogisticsStep, Shipment } from '../../lib/simulations/logistics';

interface RunnerProps {
  sim: SimulationMeta;
}

const DepotNode: React.FC<{ depot: { id: string, inventory: number, cap: number }, pos: {x: string, y: string} }> = ({ depot, pos }) => {
  const fillPercentage = (depot.inventory / depot.cap);
  const colorClass = fillPercentage > 0.5 ? 'text-canon-green' : fillPercentage > 0.2 ? 'text-yellow-500' : 'text-canon-red';
  const strokeColor = fillPercentage > 0.5 ? '#33ff99' : fillPercentage > 0.2 ? '#f59e0b' : '#ff4444';
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - fillPercentage);

  return (
    <div className="absolute transform -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: pos.x, top: pos.y }}>
        <svg className="w-24 h-24" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={radius} className="text-canon-border" strokeWidth="4" fill="none" stroke="currentColor"/>
            <circle 
                cx="50" cy="50" r={radius} 
                stroke={strokeColor}
                strokeWidth="5" 
                fill="none"
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ strokeDasharray: circumference, strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-out' }}
            />
        </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
         <div className="text-xs font-mono">{depot.id}</div>
         <div className={`font-bold text-lg ${colorClass}`}>{depot.inventory.toFixed(0)}</div>
         <div className="text-xs text-canon-text-light">/{depot.cap}</div>
      </div>
    </div>
  );
};

const ShipmentPacket: React.FC<{ shipment: Shipment, day: number }> = ({ shipment, day }) => {
    const progress = (day - shipment.departureDay + (performance.now() % 1000) / 1000) / (shipment.arrivalDay - shipment.departureDay);
    if (progress < 0 || progress >= 1) return null;

    const left = `${15 + progress * 70}%`;

    return (
        <div 
            className="absolute top-1/2 -mt-2.5 w-5 h-5 bg-canon-accent rounded-full shadow-lg shadow-canon-accent/50"
            style={{ left, transition: 'left 0.2s linear' }}
            title={`Отправка: ${shipment.amount.toFixed(0)}`}
        >
          <div className="w-full h-full bg-canon-blue rounded-full animate-pulse"></div>
        </div>
    );
};


export const LogisticsRunner: React.FC<RunnerProps> = ({ sim }) => {
    const payload = sim.payload as LogisticsPayload;
    
    const [day, setDay] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [state, setState] = useState<LogisticsState>(() => createInitialLogisticsState(payload));
    const [history, setHistory] = useState<any[]>([]);

    const animationFrameRef = useRef<number>();
    const lastUpdateTimeRef = useRef<number>(0);
    const simulationSpeed = 300; // ms per day

    // FIX: Changed function signature to accept no arguments, making it callable from both useEffect and onClick handlers without ambiguity.
    const advanceDay = useCallback(() => {
        setDay(prevDay => {
            const nextDay = prevDay + 1;
            if (nextDay > payload.days) {
                setIsRunning(false);
                return prevDay;
            }
            setState(prevState => {
                const nextState = runLogisticsStep(prevState, payload, nextDay);
                setHistory(h => [...h, { day: nextDay, ...Object.fromEntries(Object.values(nextState.depots).map(d => [d.id, d.inventory]))}]);
                return nextState;
            });
            return nextDay;
        });
    }, [payload]);
    
    useEffect(() => {
        if (day === 0 && history.length === 0) {
             const initialState = createInitialLogisticsState(payload);
             setHistory([{ day: 0, ...Object.fromEntries(Object.values(initialState.depots).map(d => [d.id, d.inventory]))}]);
        }
    }, [day, history.length, payload]);

    useEffect(() => {
        const animate = (timestamp: number) => {
            if (isRunning) {
                if (timestamp - lastUpdateTimeRef.current > simulationSpeed) {
                    lastUpdateTimeRef.current = timestamp;
                    advanceDay();
                }
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        if (isRunning) {
            lastUpdateTimeRef.current = performance.now();
            animationFrameRef.current = requestAnimationFrame(animate);
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isRunning, advanceDay, simulationSpeed]);

    const handleReset = () => {
        setIsRunning(false);
        setDay(0);
        const initialState = createInitialLogisticsState(payload);
        setState(initialState);
        setHistory([{ day: 0, ...Object.fromEntries(Object.values(initialState.depots).map(d => [d.id, d.inventory]))}]);
    };

    const totalDemand = payload.demand.reduce((sum, d) => sum + d.daily, 0) * day;
    const fillRate = totalDemand > 0 ? (state.filledOrders / totalDemand) * 100 : 100;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 {/* CONTROLS */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="text-center font-mono p-4 bg-canon-bg rounded-lg border border-canon-border">
                        <div className="text-canon-text-light text-sm">ДЕНЬ</div>
                        <div className="text-5xl font-bold">{day}</div>
                        <div className="text-canon-text-light text-sm">из {payload.days}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setIsRunning(!isRunning)} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors">{isRunning ? 'Пауза' : 'Старт'}</button>
                        <button onClick={handleReset} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-red hover:text-white transition-colors">Сброс</button>
                        <button onClick={advanceDay} disabled={isRunning || day >= payload.days} className="col-span-2 bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Шаг вперёд</button>
                    </div>
                     <div className="border-t border-canon-border pt-4 text-sm space-y-2">
                        <h4 className="font-bold mb-2">Метрики</h4>
                        <div className="flex justify-between"><span className="text-canon-text-light">Уровень выполнения:</span><span className={`font-mono ${fillRate > 90 ? 'text-canon-green' : 'text-yellow-500'}`}>{fillRate.toFixed(1)}%</span></div>
                        <div className="flex justify-between"><span className="text-canon-text-light">Просрочено:</span><span className={`font-mono ${state.backorders > 0 ? 'text-canon-red' : 'text-canon-green'}`}>{state.backorders.toFixed(0)}</span></div>
                        <div className="flex justify-between"><span className="text-canon-text-light">В пути:</span><span className="font-mono">{state.inTransit.length}</span></div>
                    </div>
                </div>
                 {/* VISUALIZER */}
                <div className="lg:col-span-2 bg-canon-bg border border-canon-border rounded-lg p-4 h-64 flex items-center justify-center">
                   <div className="relative w-full h-full">
                       <DepotNode depot={state.depots.core} pos={{x: '15%', y: '50%'}} />
                       <div className="absolute top-1/2 left-[15%] w-[70%] h-0.5 bg-canon-border" />
                       <DepotNode depot={state.depots.plaza} pos={{x: '85%', y: '50%'}} />
                       {state.inTransit.map(shipment => (
                           <ShipmentPacket key={shipment.id} shipment={shipment} day={day}/>
                       ))}
                   </div>
                </div>
            </div>
            {/* CHART */}
            <div className="bg-canon-bg border border-canon-border rounded-lg p-4 h-80">
                <h3 className="font-bold text-canon-text mb-2">Запасы на складах</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <LineChart data={history} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                        <XAxis dataKey="day" tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" />
                        <YAxis tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" />
                        <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }} />
                        <Legend wrapperStyle={{fontSize: "12px"}}/>
                        {Object.keys(state.depots).map((depotId, i) => (
                           <Line key={depotId} type="monotone" dataKey={depotId} stroke={['#00aaff', '#33ff99', '#ff4444'][i % 3]} strokeWidth={2} dot={false} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};