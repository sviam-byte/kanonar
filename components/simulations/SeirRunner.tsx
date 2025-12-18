import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SimulationMeta } from '../../types';
import { SeirPayload, SeirState, createInitialSeirState, runSeirStep } from '../../lib/simulations/seir';
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

export const SeirRunner: React.FC<RunnerProps> = ({ sim }) => {
  const payload = sim.payload as SeirPayload;
  
  const { day, state, history, isRunning, controls } = useSimulationRunner<SeirState, SeirPayload>({
    payload,
    initialStateFn: createInitialSeirState,
    stepFn: runSeirStep,
    simulationSpeed: 100,
    totalDays: payload.days,
  });
  
  const metrics = useMemo(() => {
      if (history.length === 0) {
        return { peakHospitalized: 0, totalInfected: 0, R0: 0 };
      }
      const peakHospitalized = Math.max(...history.map(h => h.H));
      const lastState = history[history.length - 1];
      const totalInfected = payload.N - lastState.S - lastState.E;
      
      let beta = payload.params.beta0;
      payload.controls.forEach(c => {
        if (day >= c.t && c.kind === 'lockdown') {
          beta *= (1 - c.eff);
        }
      });
      const R0 = beta / payload.params.gamma;

      return { peakHospitalized, totalInfected, R0 };
  }, [day, history, payload]);

  return (
     <div className="flex flex-col xl:flex-row gap-6">
        <div className="w-full xl:w-72 flex-shrink-0 space-y-4">
            <div className="text-center font-mono p-4 bg-canon-bg rounded-lg border border-canon-border">
                <div className="text-canon-text-light text-sm">ДЕНЬ</div>
                <div className="text-5xl font-bold">{day}</div>
                <div className="text-canon-text-light text-sm">из {payload.days}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button onClick={controls.toggleRun} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors">{isRunning ? 'Пауза' : 'Старт'}</button>
                <button onClick={controls.reset} className="bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-red hover:text-white transition-colors">Сброс</button>
                <button onClick={controls.stepForward} disabled={isRunning || day >= payload.days} className="col-span-2 bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Шаг вперёд</button>
            </div>
             <div className="border-t border-canon-border pt-4 grid grid-cols-2 gap-2">
                <MetricCard title="R₀" value={metrics.R0.toFixed(2)} colorClass={metrics.R0 < 1 ? 'text-canon-green' : 'text-canon-red'} />
                <MetricCard title="Пик госпитализаций" value={metrics.peakHospitalized.toLocaleString(undefined, {maximumFractionDigits: 0})} />
                <MetricCard title="Всего заражено" value={metrics.totalInfected.toLocaleString(undefined, {maximumFractionDigits: 0})} />
                <MetricCard title="Популяция" value={payload.N.toLocaleString()} />
            </div>
             <div className="border-t border-canon-border pt-4 text-sm">
                <h4 className="font-bold mb-2">Вмешательства</h4>
                {payload.controls.map(c => (
                    <div key={c.t} className={`transition-opacity p-2 rounded ${day >= c.t ? 'opacity-100 bg-canon-bg' : 'opacity-50'}`}>
                        День {c.t}: Локдаун ({c.eff * 100}% эфф.)
                    </div>
                ))}
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
                        formatter={(value: number, name) => [`${(value / payload.N * 100).toFixed(2)}% (${Math.round(value).toLocaleString()})`, name]}
                    />
                    <Legend wrapperStyle={{fontSize: "12px"}}/>
                    <Area type="monotone" dataKey="S" name="Восприимчивые" stackId="1" stroke="#00aaff" fill="#00aaff" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="E" name="Контактные" stackId="1" stroke="#ffaa00" fill="#ffaa00" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="I" name="Зараженные" stackId="1" stroke="#ff4444" fill="#ff4444" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="R" name="Выздоровевшие" stackId="1" stroke="#33ff99" fill="#33ff99" fillOpacity={0.4} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
};
