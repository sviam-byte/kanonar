import React from 'react';

interface VsigmaBreakdownProps {
    components: Record<string, number>;
}

const componentColors: Record<string, string> = {
    risk_posture: '#ff4444',
    causal_hygiene: '#eab308',
    apophenia: '#f59e0b',
    stability_discipline: '#33ff99',
    dark_susceptibility: '#888888',
    base: '#4b5563'
};

const componentNames: Record<string, string> = {
    risk_posture: 'Риск-поза',
    causal_hygiene: 'Гигиена',
    apophenia: 'Апофения',
    stability_discipline: 'Дисциплина',
    dark_susceptibility: 'Тьма',
    base: 'База',
}

export const VsigmaBreakdown: React.FC<VsigmaBreakdownProps> = ({ components }) => {
    if (!components) return null;

    const positiveComponents = Object.entries(components)
        .map(([key, value]) => ({ key, value: value as number }))
        .filter(c => c.value > 0)
        .sort((a, b) => b.value - a.value);

    const totalPositive = positiveComponents.reduce((sum, c) => sum + c.value, 0);
    if (totalPositive === 0) return null;


    return (
        <div className="w-full">
            <div className="flex w-full h-2 rounded-full overflow-hidden border border-canon-border/50">
                {positiveComponents.map(({key, value}) => {
                    if (value <= 0) return null;
                    const width = (value / totalPositive) * 100;
                    return (
                        <div
                            key={key}
                            className="h-full"
                            style={{ width: `${width}%`, backgroundColor: componentColors[key] || '#cccccc' }}
                            title={`${componentNames[key] || key}: ${value.toFixed(2)}`}
                        />
                    );
                })}
            </div>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1.5">
                {positiveComponents.slice(0, 4).map(({key, value}) => {
                    if(value <= 0) return null;
                    return (
                        <div key={key} className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: componentColors[key] || '#cccccc' }} />
                            <span className="text-[10px] text-canon-text-light">{componentNames[key] || key}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};