
import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell } from 'recharts';
import { GoalEcology } from '../types';
import { GOAL_AXIS_NAMES } from '../data/archetypes';
import { GoalAxisId } from '../types';

interface Props {
    ecology: GoalEcology;
}

const SectionHeader: React.FC<{ title: string, subtitle?: string }> = ({ title, subtitle }) => (
    <div className="mb-3 border-b border-canon-border/50 pb-1">
        <h4 className="text-xs font-bold text-canon-accent uppercase tracking-wider">{title}</h4>
        {subtitle && <p className="text-[10px] text-canon-text-light">{subtitle}</p>}
    </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const value = payload[0].value;
        return (
            <div className="bg-canon-bg border border-canon-border p-2 rounded shadow-lg text-xs z-50">
                <div className="font-bold text-canon-text mb-1">{label}</div>
                <div className="text-canon-text-light">
                    Val: <span className={`font-mono ${value > 0 ? 'text-canon-green' : 'text-canon-red'}`}>{typeof value === 'number' ? value.toFixed(3) : value}</span>
                </div>
            </div>
        );
    }
    return null;
};

const AxisChart: React.FC<{ data: any[], title: string, subtitle?: string, color: string, weight?: number }> = ({ data, title, subtitle, color, weight }) => {
    const maxAbs = Math.max(...data.map(d => Math.abs(d.value)), 0.1);
    const domain = [-maxAbs * 1.1, maxAbs * 1.1];

    return (
        <div className="h-72 bg-canon-bg border border-canon-border rounded-lg p-3 flex flex-col">
            <div className="mb-2 text-center">
                <div className="text-xs font-bold text-canon-text">{title}</div>
                {subtitle && <div className="text-[9px] text-canon-text-light">{subtitle}</div>}
                {weight !== undefined && (
                    <div className="mt-1 text-xs font-mono">w = {weight.toFixed(2)}</div>
                )}
            </div>
            <div className="flex-grow min-h-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                        data={data} 
                        layout="vertical" 
                        margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                        barCategoryGap={2}
                    >
                        <XAxis type="number" hide domain={domain} />
                        <YAxis 
                            type="category" 
                            dataKey="name" 
                            tick={{ fill: '#bbb', fontSize: 9 }} 
                            width={90}
                            interval={0}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.03)'}} />
                        <ReferenceLine x={0} stroke="#555" strokeWidth={1} strokeDasharray="3 3" />
                        <Bar dataKey="value" radius={[2, 2, 2, 2]}>
                            {data.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.value > 0 ? color : '#ef4444'} 
                                    fillOpacity={0.8} 
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const MetricBar: React.FC<{ label: string, value: number, colorOverride?: string }> = ({ label, value, colorOverride }) => {
    const p = Math.min(1, Math.max(0, value));
    let color = colorOverride || 'bg-canon-blue';
    if (!colorOverride) {
        if (p < 0.4) color = 'bg-canon-red';
        else if (p > 0.7) color = 'bg-canon-green';
    }
    return (
        <div className="flex flex-col gap-0.5 text-xs">
             <div className="flex justify-between">
                 <span className="text-canon-text-light">{label}</span>
                 <span className="font-mono">{p.toFixed(2)}</span>
             </div>
             <div className="w-full h-1.5 bg-canon-bg border border-canon-border/50 rounded-full overflow-hidden">
                 <div className={`h-full ${color} transition-all duration-500`} style={{width: `${p*100}%`}}></div>
             </div>
        </div>
    )
}

const WORLDVIEW_LABELS: Record<string, string> = {
    world_benevolence: "Доброжелательность",
    people_trust: "Доверие людям",
    system_legitimacy: "Легитимность",
    predictability: "Предсказуемость",
    controllability: "Контроль",
    fairness: "Справедливость",
    scarcity: "Дефицит",
    meaning_coherence: "Смысл"
};

const DISTORTION_LABELS: Record<string, string> = {
    trustBias: "Недоверие",
    threatBias: "Угроза",
    selfBlameBias: "Самообвинение",
    controlIllusion: "Иллюзия контроля",
    blackWhiteThinking: "Ч/Б мышление",
    catastrophizing: "Катастрофизация",
    discountingPositive: "Обесценивание (+)",
    personalization: "Персонализация",
    mindReading: "Чтение мыслей"
};


export const GoalCascadeVisualizer: React.FC<Props> = ({ ecology }) => {
    const debug = ecology.lifeGoalDebug;
    if (!debug) return <div className="p-4 italic text-canon-text-light text-sm">Нет данных движка целей.</div>;

    const { g_traits, g_bio, g_psych, g_archetype_main, weights, worldview, g_worldview, g_distortion, distortions } = debug;
    
    const mapData = (logits: Record<string, number>) => {
        const data = Object.keys(GOAL_AXIS_NAMES).map(key => ({
            name: GOAL_AXIS_NAMES[key as GoalAxisId] || key,
            value: logits[key] || 0
        }));
        return data;
    };

    const traitsData = mapData(g_traits);
    const psychData = mapData(g_psych);
    const archData = mapData(g_archetype_main);
    
    const wvLogitsData = g_worldview ? mapData(g_worldview) : [];
    const bioOnlyData = g_worldview ? mapData(Object.fromEntries(
        Object.entries(g_bio).map(([k, v]) => [k, (v as number) - (g_worldview[k as GoalAxisId] || 0)])
    ) as Record<string, number>) : mapData(g_bio);

    const distLogitsData = g_distortion ? mapData(g_distortion) : [];
    
    // Calculate Total Pre-Goal Logits
    const totalData = [];
    const keys = Object.keys(GOAL_AXIS_NAMES) as GoalAxisId[];
    const wA = 2.0;

    for (const key of keys) {
        const val = 
            weights.wT * (g_traits[key] || 0) + 
            weights.wB * (g_bio[key] || 0) + 
            weights.wP * ((g_psych[key] || 0) + (g_distortion?.[key] || 0)) +
            wA * (g_archetype_main[key] || 0);
        
        totalData.push({ name: GOAL_AXIS_NAMES[key], value: val });
    }
    totalData.sort((a,b) => b.value - a.value);
    
    const handleDownloadJSON = () => {
        const exportData = {
            timestamp: new Date().toISOString(),
            meta: {
                description: "Detailed Goal Engine Export (V4)",
                engine: "LifeGoalEngine V4.2"
            },
            // Capture raw state snapshots if available in debug (assuming extended debug object)
            // This depends on what was captured in `computeLifeGoalsLogits`.
            inputs: {
                temperature: debug.temperature,
                weights: { ...weights, wA },
                worldview: worldview,
                distortions: distortions,
                // We don't have raw vector_base here easily unless passed down, 
                // but we can infer from g_traits if needed, or just rely on user checking the character profile.
            },
            intermediate_layers: {
                g_traits: g_traits,
                g_bio: g_bio,
                g_psych: g_psych,
                g_distortion: g_distortion,
                g_archetype: g_archetype_main,
                g_worldview: g_worldview
            },
            pre_goal_logits: Object.fromEntries(totalData.map(d => [d.name, d.value])),
            final_goals: (debug as any).concreteGoals?.map((g: any) => ({
                id: g.id,
                name: g.label,
                layer: g.layer,
                domain: g.domain,
                raw_logit: g.logit,
                final_probability: g.score,
                formula: g.formula,
                breakdown: g.breakdown // Detailed breakdown added here
            }))
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `goal-engine-dump-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 text-sm p-4 bg-canon-bg/30 rounded-lg border border-canon-border/30">
            <div className="flex justify-between items-start">
                 <SectionHeader title="Life Goal Engine V3 (Normalized Log-Linear Pool)" subtitle={`Temp: ${debug.temperature.toFixed(2)}`} />
                 <button 
                    onClick={handleDownloadJSON}
                    className="flex items-center gap-2 px-3 py-1.5 bg-canon-bg border border-canon-border rounded text-xs font-bold hover:text-canon-accent hover:border-canon-accent transition-colors"
                 >
                    <span>💾</span> Скачать полный отчет (JSON)
                 </button>
            </div>
            
            {/* 1. TOTAL SUM (Moved to top) */}
            <div className="mb-6">
                <div className="h-80">
                     <AxisChart data={totalData} title="TOTAL PRE-GOALS (SUM)" subtitle="Weighted Sum of 10 Axes (Input to V4)" color="#ffffff" />
                </div>
            </div>

            <div className="flex justify-around mb-6 bg-canon-bg p-3 rounded border border-canon-border/50">
                <div className="text-center" title="Базовая личность. Снижается при стрессе. wT = 1.8 * (1 - 0.6 * Stress) * (0.5 + 0.5 * WMcap)">
                    <div className="text-[10px] text-canon-text-light uppercase">wT (Natura)</div>
                    <div className="text-xl font-mono font-bold text-green-400">{weights.wT.toFixed(2)}</div>
                </div>
                <div className="text-center" title="Жизненный опыт и мировоззрение. Стабилен. wB = 1.8 * (1 - 0.2 * Stress)">
                    <div className="text-[10px] text-canon-text-light uppercase">wB (Bio)</div>
                    <div className="text-xl font-mono font-bold text-blue-400">{weights.wB.toFixed(2)}</div>
                </div>
                <div className="text-center" title="Текущее состояние. Растет при стрессе. wP = 0.8 + 2.0 * Stress + 0.5 * (1 - Recovery)">
                    <div className="text-[10px] text-canon-text-light uppercase">wP (Psych)</div>
                    <div className="text-xl font-mono font-bold text-yellow-400">{weights.wP.toFixed(2)}</div>
                </div>
                 <div className="text-center" title="Структурное ядро личности.">
                    <div className="text-[10px] text-canon-text-light uppercase">wA (Archetype)</div>
                    <div className="text-xl font-mono font-bold text-purple-400">{wA.toFixed(2)}</div>
                </div>
            </div>
            
            {/* 2. LAYERS BREAKDOWN */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <AxisChart data={traitsData} title="NATURA (Z-Score)" subtitle="Traits (A-G)" color="#33ff99" weight={weights.wT}/>
                <AxisChart data={bioOnlyData} title="BIO (Z-Score)" subtitle="Experience" color="#00aaff" weight={weights.wB}/>
                <AxisChart data={wvLogitsData} title="WORLDVIEW (Z-Score)" subtitle="Beliefs" color="#2dd4bf" weight={weights.wB}/>
                <AxisChart data={psychData} title="PSYCH (Z-Score)" subtitle="Current State" color="#f59e0b" weight={weights.wP}/>
                <AxisChart data={distLogitsData} title="DISTORTION (Z-Score)" subtitle="Cognitive Biases" color="#f472b6" weight={weights.wP}/>
                <AxisChart data={archData} title="ARCHETYPE" subtitle="Structure (Main)" color="#a855f7" weight={wA}/>
            </div>
            
            {/* 3. DEEP DIVE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-canon-bg p-3 rounded border border-blue-500/30">
                    <SectionHeader title="Распределение по доверию миру" subtitle="Worldview" />
                     {worldview && <div className="grid grid-cols-2 gap-2 mt-4">
                         {Object.entries(worldview).map(([k, v]) => <MetricBar key={k} label={WORLDVIEW_LABELS[k] || k} value={v as number} />)}
                    </div>}
                </div>

                <div className="bg-canon-bg p-3 rounded border border-red-500/30">
                    <SectionHeader title="Распределение по когнитивным искажениям" subtitle="Cognitive Distortions" />
                     {distortions && <div className="grid grid-cols-2 gap-2 mt-4">
                         {Object.entries(distortions as unknown as Record<string, number>).filter(([_,v]) => v > 0.01).map(([k, v]) => (
                             <MetricBar key={k} label={DISTORTION_LABELS[k] || k} value={v} colorOverride="bg-fuchsia-500" />
                         ))}
                    </div>}
                </div>
            </div>
            
        </div>
    );
};
