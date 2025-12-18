
import React from 'react';
import { Link } from 'react-router-dom';
import { ShadowMode } from '../types';
import { FullArchetypeInfo } from '../types';

interface ShadowArchetypeDisplayProps { shadow: ShadowMode; trauma_shadow_bias?: number; };

const ArchetypeCard: React.FC<{ 
    title: string; 
    subtitle: string;
    archetype: FullArchetypeInfo | null; 
    colorClass: string; 
    borderColorClass: string;
    icon?: string;
}> = ({ title, subtitle, archetype, colorClass, borderColorClass, icon }) => {
    if (!archetype) {
        return (
            <div className={`flex-1 bg-canon-bg border ${borderColorClass} border-opacity-30 rounded-lg p-4 flex items-center justify-center`}>
                <span className="text-canon-text-light italic text-sm">Не определен</span>
            </div>
        );
    }
    return (
        <div className={`flex-1 bg-canon-bg border-t-4 ${borderColorClass} rounded-lg p-4 shadow-sm hover:shadow-md transition-all`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h4 className={`font-bold text-xs uppercase tracking-wider ${colorClass}`}>{title}</h4>
                    <p className="text-[10px] text-canon-text-light">{subtitle}</p>
                </div>
                {icon && <span className="text-lg opacity-50">{icon}</span>}
            </div>
            
            <h5 className="font-bold text-lg text-canon-text mb-1 leading-tight">{archetype.data.name}</h5>
            <p className="text-xs font-mono text-canon-text-light mb-3 opacity-70">
                {archetype.lambda}-{archetype.f}-{archetype.mu}
            </p>
            
            {/* Mini stat bars */}
            <div className="space-y-1 mb-3">
                 <div className="flex justify-between text-[10px] text-canon-text-light">
                    <span>Gain</span>
                    <span>{archetype.data.system_gain?.toFixed(1) ?? 0}</span>
                </div>
                 <div className="flex justify-between text-[10px] text-canon-text-light">
                    <span>Relief</span>
                    <span>{archetype.data.pressure_relief?.toFixed(1) ?? 0}</span>
                </div>
            </div>

            <Link to={`/character/ARCHETYPE::${archetype.id}`} className={`text-xs ${colorClass} hover:underline mt-auto inline-block`}>
                Подробнее &rarr;
            </Link>
        </div>
    );
};

export const ShadowArchetypeDisplay: React.FC<ShadowArchetypeDisplayProps> = ({ shadow, trauma_shadow_bias }) => {
    const probPercent = shadow.shadow_activation_prob * 100;
    
    // Visualization of the "Pull"
    // 0% = Fully Self/Actual, 100% = Fully Shadow
    
    const getBarColor = (p: number) => {
        if (p < 30) return 'bg-canon-green';
        if (p < 70) return 'bg-yellow-400';
        return 'bg-canon-red';
    };

    return (
         <div className="mt-6">
            <div className="flex justify-between items-end mb-4">
                <div>
                    <h3 className="text-xl font-bold text-canon-accent">Динамика Тени</h3>
                    <p className="text-sm text-canon-text-light">
                        Конфликт между самовосприятием, реальностью и подавленными импульсами.
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-xs text-canon-text-light uppercase tracking-wider mb-1">Вероятность Срыва</div>
                    <span className={`font-mono font-bold text-2xl ${probPercent > 50 ? 'text-canon-red' : 'text-canon-green'}`}>
                        {probPercent.toFixed(1)}%
                    </span>
                </div>
            </div>

            {/* Tension Bar */}
            <div className="relative h-4 w-full bg-canon-bg-light rounded-full mb-6 border border-canon-border overflow-hidden">
                 {/* Background gradient to show danger zone */}
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-canon-red/10"></div>
                 
                 {/* The Indicator */}
                 <div 
                    className={`absolute top-0 bottom-0 w-2 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-500 ${getBarColor(probPercent)}`}
                    style={{ left: `${probPercent}%`, transform: 'translateX(-50%)' }}
                 />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ArchetypeCard 
                    title="Self (Маска)" 
                    subtitle="Кем я хочу быть"
                    archetype={shadow.self} 
                    colorClass="text-canon-blue" 
                    borderColorClass="border-canon-blue"
                    icon="🎭"
                />
                
                <ArchetypeCard 
                    title="Actual (Реальность)" 
                    subtitle="Кто я есть сейчас"
                    archetype={shadow.actual} 
                    colorClass="text-canon-green" 
                    borderColorClass="border-canon-green"
                    icon="👤"
                />

                <ArchetypeCard 
                    title="Shadow (Тень)" 
                    subtitle="Что я подавляю"
                    archetype={shadow.shadow} 
                    colorClass="text-canon-red" 
                    borderColorClass="border-canon-red"
                    icon="🌑"
                />
            </div>
            
            {trauma_shadow_bias !== undefined && trauma_shadow_bias > 0.05 && (
                <div className="mt-3 text-center">
                     <span className="text-xs bg-red-900/30 text-red-300 px-2 py-1 rounded border border-red-900/50">
                        ⚠️ Травма усиливает тень на +{(trauma_shadow_bias * 100).toFixed(0)}%
                    </span>
                </div>
            )}
        </div>
    );
};
