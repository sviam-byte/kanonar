
import React from 'react';
import { MetricDisplay } from './MetricDisplay';
import { V42Metrics, AgentState } from '../types';

interface V42MetricsDisplayProps {
  metrics: V42Metrics;
  agent?: AgentState; // Optional context for formulas
}

export const V42MetricsDisplay: React.FC<V42MetricsDisplayProps> = ({ metrics, agent }) => {
  const metricList = [
    { name: 'V', value: metrics.V_t, tooltip: 'Валентность', key: 'V_t' },
    { name: 'A', value: metrics.A_t, tooltip: 'Активация', key: 'A_t' },
    { name: 'WMcap', value: metrics.WMcap_t, tooltip: 'Рабочая память', key: 'WMcap_t' },
    { name: 'DQ', value: metrics.DQ_t, tooltip: 'Качество решений', key: 'DQ_t' },
    { name: 'Habit', value: metrics.Habit_t, tooltip: 'Привычный контроль', key: 'Habit_t' },
    { name: 'Agency', value: metrics.Agency_t, tooltip: 'Агентность', key: 'Agency_t' },
    { name: 'TailRisk', value: metrics.TailRisk_t, tooltip: 'Хвостовой риск', key: 'TailRisk_t' },
    { name: 'Rmargin', value: metrics.Rmargin_t, tooltip: 'Запас обратимости', key: 'Rmargin_t' },
    { name: 'PlanRobust', value: metrics.PlanRobust_t, tooltip: 'Робастность планов', key: 'PlanRobust_t' },
    { name: 'DriveU', value: metrics.DriveU_t, tooltip: 'Гомеостатическая потребность', key: 'DriveU_t' },
    { name: 'Exhaust', value: metrics.ExhaustRisk_t, tooltip: 'Риск истощения', key: 'ExhaustRisk_t' },
    { name: 'Recovery', value: metrics.Recovery_t, tooltip: 'Скорость восстановления', key: 'Recovery_t' },
    { name: 'ImpulseCtl', value: metrics.ImpulseCtl_t, tooltip: 'Контроль импульсов', key: 'ImpulseCtl_t' },
    { name: 'InfoHyg', value: metrics.InfoHyg_t, tooltip: 'Инфо-гигиена', key: 'InfoHyg_t' },
    { name: 'RAP', value: metrics.RAP_t, tooltip: 'Risk-Adjusted Performance', key: 'RAP_t' },
  ];

  return (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
      <h3 className="font-bold mb-3 text-canon-text">Метрики v4.2</h3>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {metricList.map(m => (
          <MetricDisplay 
            key={m.name} 
            name={m.name} 
            value={(m.value ?? 0).toFixed(3)} 
            tooltip={m.tooltip}
            formulaKey={m.key}
            context={agent}
          />
        ))}
      </div>
    </div>
  );
};
