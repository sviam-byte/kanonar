
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { allArchetypes, DOMAIN_NAMES, getDomainAndFunc, FUNCTION_NAMES } from '../data/archetypes';
import { METRIC_NAMES } from '../lib/archetypes/metrics';
import { ArchetypeMetricsPanel } from '../components/ArchetypeMetricsPanel';
import { ArchetypeGoalVector } from '../components/ArchetypeGoalVector';
import { ArchetypeData } from '../types';
import { useSyncedState } from '../lib/hooks/useSyncedState';

type MetricID = keyof typeof METRIC_NAMES;

interface FullArchetypeInfo {
    id: string;
    lambda: string;
    f: number;
    mu: string;
    data: ArchetypeData;
    metrics: Record<string, number>;
}

const MU_MAP: Record<string, number> = { 'SR': 0, 'OR': 1, 'SN': 2, 'ON': 3 };
const MU_LABELS = ['SR', 'OR', 'SN', 'ON'];
const DOMAIN_LABELS = DOMAIN_NAMES;
const CUBE_SIZE = 400;
const VOXEL_SPACING = CUBE_SIZE / 4;

const LAMBDA_NAMES: Record<string, string> = { H: 'Human', D: 'Divine', O: 'Other' };
const MU_NAMES: Record<string, string> = {
    SR: 'Творец / Хищник',
    OR: 'Аномалия / Глитч',
    SN: 'Закон / Новая норма',
    ON: 'Инструмент / Функция',
};

// Voxel component remains same...
const Voxel: React.FC<{ arch: any; rotation: { x: number, y: number }; onSelect: () => void; }> = React.memo(({ arch, rotation, onSelect }) => (
    <div
        className="archetype-voxel"
        style={{
            transform: `translate3d(${arch.pos3D.x}px, ${arch.pos3D.y}px, ${arch.pos3D.z}px)`,
            opacity: arch.visible ? (arch.isSelected ? 1 : 0.9) : 0,
            pointerEvents: arch.visible ? 'auto' : 'none',
            transition: 'opacity 0.4s'
        }}
        onClick={onSelect}
    >
        <div
            className="voxel-face"
            style={{
                width: arch.style.baseSize,
                height: arch.style.baseSize,
                transform: `translate(-50%, -50%) rotateY(${-rotation.y}deg) rotateX(${-rotation.x}deg) scale(${arch.isSelected ? 1.5 : 1})`,
                color: arch.style.color,
                opacity: arch.style.opacity,
                borderWidth: arch.style.borderWidth,
                transition: 'transform 0.3s, opacity 0.3s, color 0.3s'
            }}
        >
             <div className="voxel-core" style={{ width: arch.style.coreSize, height: arch.style.coreSize }}/>
        </div>
    </div>
));

export const ArchetypesPage: React.FC = () => {
    const metricKeys = Object.keys(METRIC_NAMES) as MetricID[];
    
    // Synced State
    const [activeLambda, setActiveLambda] = useSyncedState<'H'|'D'|'O'>('lambda', 'H');
    const [selectedMu, setSelectedMu] = useSyncedState('mu', 'SR');
    // We'll store selection as indexes in URL for shortness
    const [selectedDomainIndex, setSelectedDomainIndex] = useSyncedState('domain', '0', String, String);
    const [selectedFuncIndex, setSelectedFuncIndex] = useSyncedState('func', '0', String, String);

    const [visuals, setVisuals] = useState({
        hue: 'RADICAL' as MetricID,
        brightness: 'AGENCY' as MetricID,
        opacity: 'TRUTH' as MetricID,
        size: 'ACTION' as MetricID,
        border: 'FORMAL' as MetricID,
    });
    
    const [rotation, setRotation] = useState({ x: -20, y: 30 });
    const [isDragging, setIsDragging] = useState(false);
    const [autoRotate, setAutoRotate] = useState(true);
    const [selectedArchetype, setSelectedArchetype] = useState<FullArchetypeInfo | null>(null);

    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartRotation = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number | null>(null);

    const domIndex = parseInt(selectedDomainIndex, 10);
    const funcIndex = parseInt(selectedFuncIndex, 10);

    const functionOptions = useMemo(() => {
        const startIndex = domIndex * 4;
        return Array.from({ length: 4 }, (_, i) => ({
            value: i,
            label: FUNCTION_NAMES[startIndex + i] || `Func ${i}`
        }));
    }, [domIndex]);

    useEffect(() => {
        const f = domIndex * 4 + funcIndex + 1;
        const found = allArchetypes.find(a => 
            a.lambda === activeLambda && 
            a.f === f && 
            a.mu === selectedMu
        );
        setSelectedArchetype(found as unknown as FullArchetypeInfo || null);
    }, [activeLambda, selectedMu, domIndex, funcIndex]);

    const handleVisualsChange = (prop: keyof typeof visuals, value: MetricID) => {
        setVisuals(prev => ({ ...prev, [prop]: value }));
    };
    
    // ... (Rotation logic remains same) ...
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); setIsDragging(true); setAutoRotate(false);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        dragStartRotation.current = { ...rotation };
    }, [rotation]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        setRotation({ y: dragStartRotation.current.y + dx * 0.25, x: dragStartRotation.current.x - dy * 0.25 });
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        if(isDragging) { setIsDragging(false); setTimeout(() => setAutoRotate(true), 3000); }
    }, [isDragging]);
    
    useEffect(() => {
        let lastTime = 0;
        const animate = (time: number) => {
            if (!lastTime) lastTime = time;
            const deltaTime = time - lastTime;
            lastTime = time;
            if (autoRotate && !isDragging) setRotation(r => ({ ...r, y: r.y + deltaTime * 0.005 }));
            animationFrameRef.current = requestAnimationFrame(animate);
        };
        animationFrameRef.current = requestAnimationFrame(animate);
        return () => { if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current) };
    }, [autoRotate, isDragging]);
    // ...

    const processedArchetypes = useMemo(() => {
        return allArchetypes.map(p => {
            const i = MU_MAP[p.mu] !== undefined ? MU_MAP[p.mu] : 0;
            const j = Math.floor((p.f - 1) / 4);
            const k = (p.f - 1) % 4;
            
            const pos3D = {
                x: (i - 1.5) * VOXEL_SPACING,
                y: -(j - 1.5) * VOXEL_SPACING, 
                z: (k - 1.5) * VOXEL_SPACING,
            };

            const metrics = p.metrics;
            const hueMetric = metrics[visuals.hue] || 0.5;
            const brightnessMetric = metrics[visuals.brightness] || 0.5;
            const opacityMetric = metrics[visuals.opacity] || 0.5;
            const sizeMetric = metrics[visuals.size] || 0.5;
            const borderMetric = metrics[visuals.border] || 0.5;

            const hue = 240 - hueMetric * 240; 
            const lightness = 40 + brightnessMetric * 30;
            const saturation = 50 + brightnessMetric * 40;
            const color = `hsl(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`;

            const style = {
                baseSize: VOXEL_SPACING * 0.8,
                color,
                opacity: 0.3 + (1 - opacityMetric) * 0.7, 
                coreSize: 2 + sizeMetric * (VOXEL_SPACING * 0.2),
                borderWidth: borderMetric * 3,
            };

            return { ...p, pos3D, style, isSelected: selectedArchetype?.id === p.id, visible: p.lambda === activeLambda };
        });
    }, [visuals, selectedArchetype, activeLambda]);
    
    const handleVoxelSelect = (info: FullArchetypeInfo) => {
        // Sync selection to URL params implicitly via setting the state
        // But here we get the object, need to extract indices
        const domIdx = Math.floor((info.f - 1) / 4);
        const fIdx = (info.f - 1) % 4;
        
        setActiveLambda(info.lambda as any);
        setSelectedMu(info.mu);
        setSelectedDomainIndex(String(domIdx));
        setSelectedFuncIndex(String(fIdx));
    };

    return (
        <div className="p-4 md:p-8">
            <div className="bg-canon-bg-light border border-canon-border p-6">
                <h2 className="text-2xl font-bold mb-1">Пространство Архетипов (Куб)</h2>
                <div className="flex justify-between items-start">
                    <p className="text-canon-text-light mb-4 text-sm max-w-2xl">
                        Исследуйте три куба архетипов (H/D/O).
                    </p>
                    <div className="flex space-x-2">
                        {(['H', 'D', 'O'] as const).map(lambda => (
                            <button key={lambda} onClick={() => { setActiveLambda(lambda); }} className={`px-4 py-2 text-sm rounded-md transition-colors w-24 ${activeLambda === lambda ? 'bg-canon-accent text-canon-bg font-bold' : 'bg-canon-bg border border-canon-border hover:border-canon-accent'}`}>
                                {lambda === 'H' ? 'Human' : lambda === 'D' ? 'Divine' : 'Other'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                     <div>
                        <label className="text-xs font-bold text-canon-text-light uppercase">Модус (μ)</label>
                        <select value={selectedMu} onChange={e => setSelectedMu(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1.5 mt-1 text-sm">
                            <option value="SR">SR (Творец / Хищник)</option>
                            <option value="OR">OR (Аномалия / Глитч)</option>
                            <option value="SN">SN (Закон / Новая норма)</option>
                            <option value="ON">ON (Инструмент / Функция)</option>
                        </select>
                    </div>
                     <div>
                        <label className="text-xs font-bold text-canon-text-light uppercase">Домен</label>
                        <select value={selectedDomainIndex} onChange={e => { setSelectedDomainIndex(e.target.value); setSelectedFuncIndex('0');}} className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1.5 mt-1 text-sm">
                            {DOMAIN_NAMES.map((name, i) => <option key={i} value={String(i)}>{name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="text-xs font-bold text-canon-text-light uppercase">Функция</label>
                        <select value={selectedFuncIndex} onChange={e => setSelectedFuncIndex(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1.5 mt-1 text-sm">
                            {functionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Visuals selectors omitted for brevity but remain same */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4 border-t border-canon-border pt-4">
                    {(Object.keys(visuals) as Array<keyof typeof visuals>).map(prop => (
                        <div key={prop}>
                            <label className="text-xs font-bold text-canon-text-light uppercase">{prop}</label>
                            <select value={visuals[prop]} onChange={e => handleVisualsChange(prop, e.target.value as MetricID)} className="w-full bg-canon-bg border border-canon-border rounded px-2 py-1.5 mt-1 text-sm">
                                {metricKeys.map(key => <option key={key} value={key}>{METRIC_NAMES[key]}</option>)}
                            </select>
                        </div>
                    ))}
                </div>

                <div className="archetype-scene h-[65vh] p-2 relative flex items-center justify-center" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onMouseMove={handleMouseMove}>
                    <div className="archetype-rotator" style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`, transition: isDragging ? 'none' : 'transform 0.1s linear' }}>
                       {processedArchetypes.map(p => (
                           <Voxel key={p.id} arch={p} rotation={rotation} onSelect={() => handleVoxelSelect(p as unknown as FullArchetypeInfo)} />
                       ))}
                    </div>
                    {/* Axis Labels ... */}
                </div>
            </div>

            {selectedArchetype && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 animate-fade-in">
                    <div className="bg-canon-bg-light border-4 border-canon-border rounded-lg p-6 transition-all duration-300" style={{borderColor: processedArchetypes.find(p => p.id === selectedArchetype.id)?.style.color}}>
                        <p className="text-sm text-canon-text-light mb-2 font-mono">
                            {LAMBDA_NAMES[selectedArchetype.lambda] || selectedArchetype.lambda} / {MU_NAMES[selectedArchetype.mu] || selectedArchetype.mu} / {getDomainAndFunc(selectedArchetype.f).domain} / {getDomainAndFunc(selectedArchetype.f).funcName}
                        </p>
                        <h2 className="text-3xl font-bold mb-3" style={{color: processedArchetypes.find(p => p.id === selectedArchetype.id)?.style.color}}>{selectedArchetype.data.name}</h2>
                        <div className="text-canon-text leading-relaxed mb-4 [&_p]:mb-2" dangerouslySetInnerHTML={{ __html: selectedArchetype.data.description }} />
                        <Link to={`/character/ARCHETYPE::${selectedArchetype.id}`} className="inline-block text-sm text-canon-accent hover:underline">
                           Открыть паспорт архетипа &rarr;
                        </Link>
                    </div>
                     <div className="space-y-6">
                        <ArchetypeMetricsPanel metrics={selectedArchetype.metrics} title="Метрики Архетипа"/>
                        {selectedArchetype.data.goals && (
                            <ArchetypeGoalVector goals={selectedArchetype.data.goals as any} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
