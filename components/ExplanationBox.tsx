import React from 'react';
import { CalculatedMetrics, EntityType } from '../types';

interface ExplanationBoxProps {
    metrics: CalculatedMetrics;
    params: Record<string, number>;
    entityType: EntityType;
}

export const ExplanationBox: React.FC<ExplanationBoxProps> = ({ metrics, params, entityType }) => {

    if (entityType === EntityType.Character) {
        return (
             <ul className="space-y-2 text-xs text-canon-text-light font-mono">
                <li>
                    <span className="text-canon-text">• Influence</span> ≈ σ(γ₀ + γ₁·L + γ₂·Cap) = <span className="text-canon-accent">{metrics.influence?.toFixed(1)}</span>
                </li>
                <li>
                    <span className="text-canon-text">• Pv (Канон)</span> ≈ σ(a₀ + a₁·M + a₂·A) * TrustFactor
                </li>
                 <li>
                    <span className="text-canon-text">• Vσ (Хаос)</span> ≈ σ(v₀ + Risk - v_topo·topo - v_L·L)
                </li>
                 <li>
                    <span className="text-canon-text">• Pr[monstro]</span> ≈ 1 - exp(-λ_mon * T) = <span className="text-canon-accent">{(metrics.prMonstro * 100).toFixed(1)}%</span>
                </li>
                <li>
                    <span className="text-canon-text">• S (Стабильность)</span> = σ(s₁·Pv - s₂·Vσ + s₃·topo).
                </li>
            </ul>
        );
    }
    
    // Default to Object
    return (
        <ul className="space-y-2 text-xs text-canon-text-light font-mono">
            <li>
                <span className="text-canon-text">• dose</span> = E/A* = {params.E?.toFixed(0)}/{params.A_star?.toFixed(0)} = <span className="text-canon-accent">{metrics.dose.toFixed(3)}</span>
            </li>
            <li>
                <span className="text-canon-text">• Vσ (Хаос) ↑</span> от эксергии, инфр., опасности, кауз. штрафа и ошибок дозы.
            </li>
            <li>
                <span className="text-canon-text">• S (Стабильность)</span> = σ(1.2·Pv - 1.1·Vσ - 0.9·drift + 0.8·topo + 0.25·log(1+witness)).
            </li>
        </ul>
    );
};