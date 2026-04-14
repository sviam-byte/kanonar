
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { AnyEntity, CharacterEntity } from '../../types';
import { characterSchema } from '../../data/character-schema';
import { calculateSdeDiagnostics } from '../../lib/sde-helpers';
import { useBranch } from '../../contexts/BranchContext';
import { calculateLatentsAndQuickStates } from '../../lib/metrics';
import { flattenObject, getNestedValue, setNestedValue } from '../../lib/param-utils';

interface WhatIfHeatmapProps {
    entity: AnyEntity;
}

const getHeatmapColor = (value: number, min: number, max: number) => { // value is 0-100
    const range = Math.max(max - min, 1e-9);
    const t = (value - min) / range;
    const hue = t * 120; // 0 (red) -> 120 (green)
    return `hsl(${hue}, 80%, ${30 + t * 20}%)`;
};


export const WhatIfHeatmap: React.FC<WhatIfHeatmapProps> = ({ entity }) => {
    const { branch } = useBranch();
    const GRID_SIZE = 10;
    
    const vectorBaseParams = useMemo(() => {
        const params: { key: string; name: string }[] = [];
        ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(cat => {
            Object.entries(characterSchema[cat]).forEach(([key, schema]) => {
                params.push({ key: `vector_base.${key}`, name: schema.name });
            });
        });
        return params;
    }, []);

    const [paramX, setParamX] = useState<string>(vectorBaseParams[0].key);
    const [paramY, setParamY] = useState<string>(vectorBaseParams[1].key);

    const [heatmapResult, setHeatmapResult] = useState<{data: { x: number; y: number; value: number }[][], min: number, max: number} | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        const calculateHeatmap = () => {
            const charEntity = entity as CharacterEntity;
            if (!charEntity.vector_base) {
                setHeatmapResult(null);
                setIsLoading(false);
                return;
            };

            const data: { x: number; y: number; value: number }[][] = [];
            let minVal = Infinity;
            let maxVal = -Infinity;
            
            for (let i = 0; i < GRID_SIZE; i++) {
                const row: { x: number; y: number; value: number }[] = [];
                const yValue = i / (GRID_SIZE - 1); // 0 to 1

                for (let j = 0; j < GRID_SIZE; j++) {
                    const xValue = j / (GRID_SIZE - 1); // 0 to 1

                    const tempEntity = JSON.parse(JSON.stringify(charEntity));
                    setNestedValue(tempEntity, paramX, xValue);
                    setNestedValue(tempEntity, paramY, yValue);

                    const flatParams = flattenObject(tempEntity);
                    const { latents, quickStates } = calculateLatentsAndQuickStates(flatParams);
                    
                    const sdeDiags = calculateSdeDiagnostics(tempEntity, latents, quickStates);
                    
                    minVal = Math.min(minVal, sdeDiags.S_star);
                    maxVal = Math.max(maxVal, sdeDiags.S_star);
                    
                    row.push({ x: xValue, y: yValue, value: sdeDiags.S_star });
                }
                data.push(row);
            }
            setHeatmapResult({ data, min: minVal, max: maxVal });
            setIsLoading(false);
        };
        // Use timeout to prevent blocking UI thread on initial render/change
        const timer = setTimeout(calculateHeatmap, 50);
        return () => clearTimeout(timer);

    }, [entity, paramX, paramY, branch]);

    const ParamSelector: React.FC<{ value: string, onChange: (val: string) => void, label: string }> = ({ value, onChange, label }) => (
        <div>
            <label className="text-xs text-canon-text-light">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1 text-xs">
                {vectorBaseParams.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
        </div>
    );

    return (
        <div className="h-full flex flex-col">
            <div className="grid grid-cols-2 gap-4 mb-2">
                <ParamSelector label="Ось X" value={paramX} onChange={setParamX} />
                <ParamSelector label="Ось Y" value={paramY} onChange={setParamY} />
            </div>
            {isLoading ? (
                 <div className="flex-grow flex items-center justify-center text-canon-text-light">Расчет...</div>
            ) : heatmapResult && heatmapResult.data.length > 0 ? (
                <div className="flex-grow grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)` }}>
                    {heatmapResult.data.flat().map((cell, i) => (
                        <div 
                            key={i}
                            style={{ backgroundColor: getHeatmapColor(cell.value, heatmapResult.min, heatmapResult.max) }}
                            className="w-full h-full"
                            title={`S* = ${cell.value.toFixed(1)}`}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex-grow flex items-center justify-center text-canon-text-light">Нет данных.</div>
            )}
        </div>
    );
};
