
import React from 'react';
import { StabilityBreakdown, SimulationPoint } from '../../types';

interface EquilibriumModelProps {
    breakdown: StabilityBreakdown;
}

const ParamBar: React.FC<{ label: string; value: number; max: number; color: string; tooltip: string; unit: string; }> = ({ label, value, max, color, tooltip, unit }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="grid grid-cols-12 gap-2 items-center text-xs group relative" title={tooltip}>
            <div className="col-span-2 text-canon-text-light">{label}</div>
            <div className="col-span-7">
                <div className="w-full bg-canon-border rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${percentage}%`, backgroundColor: color }} />
                </div>
            </div>
            <div className="col-span-3 font-mono text-right">{value.toFixed(3)} <span className="text-canon-text-light">{unit}</span></div>
        </div>
    );
};


export const EquilibriumModel: React.FC<EquilibriumModelProps> = ({ breakdown }) => {
    const { mu, kappa, h, S_star, S_ss, scenario_S, DS, DR } = breakdown;
    
    const N = (breakdown.N_pillar ?? 0) / 100;
    const H = (breakdown.H_pillar ?? 0) / 100;
    const C = (breakdown.C_pillar ?? 0) / 100;
    
    if (mu === undefined || kappa === undefined || h === undefined || S_star === undefined) {
        return <div className="h-full w-full flex items-center justify-center text-xs text-canon-text-light">Нет данных S*</div>;
    }
    
    const S_star_color = S_star > 60 ? 'text-canon-green' : S_star > 40 ? 'text-yellow-500' : 'text-canon-red';

    const sensitivity = {
        mu: (kappa + h) > 0 ? kappa / (kappa + h) : 0,
        kappa: (kappa + h) > 0 ? (mu * h) / ((kappa + h) ** 2) : 0,
        h: (kappa + h) > 0 ? -(kappa * mu) / ((kappa + h) ** 2) : 0,
    };
    
    return (
        <div className="w-full h-full flex flex-col justify-between items-center space-y-1">
            <div className="text-center">
                <div className={`font-mono text-3xl font-bold ${S_star_color}`}>
                    {S_star.toFixed(1)}
                </div>
                <div className="text-xs text-canon-text-light font-mono -mt-1">
                    S* = (κμ)/(κ+h)
                </div>
            </div>
            <div className="w-full grid grid-cols-2 gap-2 text-center text-xs mt-2">
                <div>
                    <div className="font-mono text-lg font-bold">{(S_ss ?? 0).toFixed(1)}</div>
                    <div className="text-canon-text-light">Trait S</div>
                </div>
                <div>
                    <div className="font-mono text-lg font-bold">{(scenario_S ?? 0).toFixed(1)}</div>
                    <div className="text-canon-text-light">Scenario S</div>
                </div>
            </div>
            <div className="w-full grid grid-cols-2 gap-2 text-center text-xs mt-2 border-t border-canon-border/50 pt-2">
                <div>
                    <div className="font-mono text-lg font-bold text-canon-red">{(DS ?? 0).toFixed(2)}</div>
                    <div className="text-canon-text-light" title="Dark Susceptibility / Чувствительность к стрессу">DS</div>
                </div>
                <div>
                    <div className="font-mono text-lg font-bold text-canon-green">{(DR ?? 0).toFixed(0)}%</div>
                    <div className="text-canon-text-light" title="Decision Readiness / Робастность">DR</div>
                </div>
            </div>
            <div className="w-full space-y-1 text-xs">
                <ParamBar label="N" value={N} max={1} color="#eab308" tooltip="Опора N: Нормативный корсет" unit="" />
                <ParamBar label="H" value={H} max={1} color="#00ccff" tooltip="Опора H: Гомеостаз ресурсов" unit="" />
                <ParamBar label="C" value={C} max={1} color="#33ff99" tooltip="Опора C: Когерентность/Адаптивность" unit="" />
                <hr className="border-canon-border/50 my-1" />
                <ParamBar label="μ" value={mu} max={1} color="#00aaff" tooltip={`Цель (μ). Чувствительность ∂S*/∂μ ≈ ${sensitivity.mu.toFixed(3)}`} unit=""/>
                <ParamBar label="κ" value={kappa} max={0.3} color="#33ff99" tooltip={`Жёсткость (κ). ∂S*/∂κ = ${sensitivity.kappa.toFixed(3)}`} unit=""/>
                <ParamBar label="h" value={h} max={0.1} color="#ff4444" tooltip={`Разрушитель (h). ∂S*/∂h = ${sensitivity.h.toFixed(3)}`} unit="" />
            </div>
        </div>
    );
};
