import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SimulationMeta } from '../../types';
import { InfluenceState, createInitialInfluenceState, runInfluenceStep } from '../../lib/simulations/influence';
import { useSimulationRunner } from '../../hooks/useSimulationRunner';

interface RunnerProps {
  sim: SimulationMeta;
}

const MetricCard: React.FC<{title: string, value: string, colorClass?: string}> = ({ title, value, colorClass = 'text-canon-text'}) => (
    <div className="bg-canon-bg border border-canon-border rounded-lg p-3 text-center">
        <div className="text-canon-text-light text-xs uppercase">{title}</div>
        <div className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</div>
    </div>
);

export const InfluenceRunner: React.FC<RunnerProps> = ({ sim }) => {
  const { days, N, beta, gamma, seeds, pv_goal } = sim.payload;
  
  const { day, state, history, isRunning, controls } = useSimulationRunner<InfluenceState, any>({
    payload: { N, beta, gamma },
    initialStateFn: () => createInitialInfluenceState(N, seeds),
    stepFn: (currentState, p, day) => runInfluenceStep(currentState, p.N, p.beta, p.gamma),
    simulationSpeed: 100,
    totalDays: days,
  });

  const currentPv = (state.R / N) * 100;
  const pvProgress = Math.min(100, (currentPv / pv_goal) * 100);

  return (
     <div className="flex flex-col xl:flex-row gap-6">
        <div className="w-full xl:w-72 flex-shrink-0 space-y-4">
            <div className="text-center font-mono p-4 bg-canon-bg rounded-lg border border-canon-border">
                <div className="text-canon-text-light text-sm">ДЕНЬ</div>
                <div className="text-5xl font-bold">{day}</div>
                <div className="text-canon-text-light text-sm">из {days}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button onClick={controls.toggleRun} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors">{isRunning ? 'Пауза' : 'Старт'}</button>
                <button onClick={controls.reset} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-red hover:text-white transition-colors">Сброс</button>
            </div>

            <div className="border-t border-canon-border pt-4">
                 <MetricCard title="Канон-уровень (Pv)" value={`${currentPv.toFixed(1)}%`} colorClass={currentPv >= pv_goal ? 'text-canon-green' : 'text-canon-blue'} />
                 <div className="w-full bg-canon-border rounded-full h-2.5 mt-2">
                    <div className="bg-canon-blue h-2.5 rounded-full" style={{width: `${pvProgress}%`}}></div>
                </div>
                <div className="text-xs text-center text-canon-text-light mt-1">Цель: {pv_goal}%</div>
            </div>
             
        </div>
        <div className="flex-grow h-96 md:h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={history} margin={{ top: 5, right: 20, left: -10, bottom: 5 }} stackOffset="expand">
                    <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                    <XAxis dataKey="day" tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" />
                    <YAxis tickFormatter={(tick) => `${(tick * 100).toFixed(0)}%`} tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                        formatter={(value: number, name) => [`${(value / N * 100).toFixed(2)}% (${Math.round(value).toLocaleString()})`, name]}
                    />
                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                    <Area type="monotone" dataKey="S" name="Неопределившиеся" stackId="1" stroke="#888888" fill="#888888" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="I" name="Агенты влияния" stackId="1" stroke="#ffaa00" fill="#ffaa00" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="R" name="Убежденные" stackId="1" stroke="#00aaff" fill="#00aaff" fillOpacity={0.6} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
};
