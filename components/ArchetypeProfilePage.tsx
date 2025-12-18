
import React, { useState } from 'react';
import {
  ArchetypeDefinition,
  ArchetypeLatentMetrics,
} from '../lib/archetypes/view-model';

interface ArchetypeProfilePageProps {
  archetype: ArchetypeDefinition;
}

export const ArchetypeProfilePage: React.FC<ArchetypeProfilePageProps> = ({
  archetype,
}) => {
  const { vectorFingerprint, latentMetrics, assignment, stressProfile, dyadDefaults } =
    archetype;
    
  const [jsonOpen, setJsonOpen] = useState(false);
  const safeTrustBias = dyadDefaults?.tom_bias_axes?.trust_bias ?? 0;
  const safeParanoiaBias = dyadDefaults?.tom_bias_axes?.paranoia_bias ?? 0;

  return (
    <div className="w-full space-y-6">
      {/* ШАПКА */}
      <header className="space-y-2 border-b border-canon-border pb-4">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-2xl font-bold text-canon-text">{archetype.label}</h1>
                <p className="text-sm text-canon-text-light italic">"{archetype.tagline}"</p>
            </div>
            <div className="flex gap-2">
                 <span className="px-2 py-1 rounded text-xs font-mono bg-canon-bg border border-canon-border text-canon-accent">
                    λ: {archetype.lambda}
                </span>
                <span className="px-2 py-1 rounded text-xs font-mono bg-canon-bg border border-canon-border text-canon-accent">
                    μ: {archetype.mu}
                </span>
            </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-canon-text-light/70 uppercase tracking-wider">
          {archetype.role && <span>Роль: {archetype.role}</span>}
          <span> • </span>
          <span>v{archetype.version}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ЛЕВАЯ КОЛОНКА: СУТЬ */}
          <div className="space-y-6">
              
              {/* ЯДРО */}
              <section className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-3">
                <h2 className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Ядро архетипа</h2>
                <div className="text-sm text-canon-text-light/90 leading-relaxed whitespace-pre-line" dangerouslySetInnerHTML={{ __html: archetype.summary }} />
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                    {archetype.core_goals?.length > 0 && (
                    <div>
                        <h3 className="text-[10px] font-bold text-canon-text-light uppercase mb-1">Цели</h3>
                        <ul className="list-disc list-inside text-xs text-canon-text space-y-0.5">
                        {(archetype.core_goals || []).map((goal, i) => (
                            <li key={i}>{goal}</li>
                        ))}
                        </ul>
                    </div>
                    )}
                    {archetype.typical_roles?.length > 0 && (
                    <div>
                        <h3 className="text-[10px] font-bold text-canon-text-light uppercase mb-1">Роли</h3>
                        <div className="flex flex-wrap gap-1">
                        {(archetype.typical_roles || []).map(role => (
                            <span
                            key={role}
                            className="px-2 py-0.5 rounded bg-canon-bg border border-canon-border text-[10px] text-canon-text-light"
                            >
                            {role}
                            </span>
                        ))}
                        </div>
                    </div>
                    )}
                </div>
              </section>

              {/* ВЕКТОРНЫЙ ОТПЕЧАТОК */}
              <section className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-4">
                <h2 className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Векторный отпечаток</h2>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-canon-blue uppercase">Ценности</h3>
                    <AxisBar label="Забота ↔ Власть" left="Забота" right="Власть" value={vectorFingerprint.values_axis_group.care_vs_power} />
                    <AxisBar label="Порядок ↔ Хаос" left="Порядок" right="Хаос" value={vectorFingerprint.values_axis_group.law_vs_chaos} />
                    <AxisBar label="Жертвенность ↔ Эго" left="Жертва" right="Эго" value={vectorFingerprint.values_axis_group.sacrifice_vs_self} />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-canon-border/30">
                    <h3 className="text-[10px] font-bold text-fuchsia-400 uppercase">Социум</h3>
                    <AxisBar label="Доминирование" left="Ведомый" right="Доминант" value={vectorFingerprint.social_axis_group.dominance} />
                    <AxisBar label="Аффилиация" left="Одиночка" right="Группа" value={vectorFingerprint.social_axis_group.affiliation} />
                    <AxisBar label="Манипуляция" left="Прямота" right="Интрига" value={vectorFingerprint.social_axis_group.manipulation} />
                  </div>
                </div>
              </section>
              
              {/* ПРАВИЛА ПРИСВОЕНИЯ */}
              <section className="bg-canon-bg border border-canon-border rounded-lg p-4 text-xs space-y-2 opacity-80 hover:opacity-100 transition-opacity">
                <h2 className="text-[10px] font-bold text-canon-text-light uppercase tracking-wider">Критерии (Debug)</h2>
                <div className="space-y-1 font-mono text-canon-text-light">
                  {Object.entries(assignment.required_ranges || {}).map(([key, val]) => {
                    const range = val as [number, number];
                    return (
                        <div key={key} className="flex justify-between border-b border-canon-border/20 pb-1">
                        <span>{key}</span>
                        <span className="text-canon-accent">{range[0].toFixed(1)} – {range[1].toFixed(1)}</span>
                        </div>
                    );
                  })}
                </div>
                {assignment.incompatible_flags && assignment.incompatible_flags.length > 0 && (
                    <div className="mt-2 text-red-400">
                        <span className="font-bold">NOT: </span> {assignment.incompatible_flags.join(', ')}
                    </div>
                )}
              </section>

          </div>

          {/* ПРАВАЯ КОЛОНКА: ДИНАМИКА */}
          <div className="space-y-6">
              
              {/* ЛАТЕНТНЫЕ МЕТРИКИ */}
              <section className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                <h2 className="text-xs font-bold text-canon-text uppercase tracking-wider mb-3">Латентные параметры</h2>
                <LatentGrid metrics={latentMetrics} />
              </section>

              {/* СТРЕСС И ДЕФОРМАЦИЯ */}
              <section className="bg-red-900/10 border border-red-500/30 rounded-lg p-4 space-y-4">
                <h2 className="text-xs font-bold text-red-400 uppercase tracking-wider">Стресс-профиль</h2>
                
                <div className="grid grid-cols-2 gap-4 text-[11px]">
                  <AxisBar label="Ответственность" left="Ок" right="Срыв" value={stressProfile.stress_triggers.overload_responsibility} color="bg-red-500" />
                  <AxisBar label="Изоляция" left="Ок" right="Срыв" value={stressProfile.stress_triggers.social_isolation} color="bg-red-500" />
                  <AxisBar label="Моральный конфликт" left="Ок" right="Срыв" value={stressProfile.stress_triggers.moral_conflict} color="bg-red-500" />
                  <AxisBar label="Скука" left="Ок" right="Срыв" value={stressProfile.stress_triggers.boredom} color="bg-red-500" />
                </div>

                <div className="pt-3 border-t border-red-500/20 grid grid-cols-2 gap-4">
                     <AxisBar label="Тень (Стресс)" left="Устойчив" right="Тень" value={stressProfile.shadow_shift_under_stress} color="bg-purple-500" />
                     <AxisBar label="Тень (Вина)" left="Устойчив" right="Тень" value={stressProfile.shadow_shift_under_guilt} color="bg-purple-500" />
                </div>

                <div className="mt-2 text-[11px] text-canon-text-light space-y-1 italic bg-black/20 p-2 rounded">
                  <p><span className="text-canon-text font-semibold">Норма:</span> {stressProfile.phase_behavior.calm_phase_note}</p>
                  <p><span className="text-yellow-500 font-semibold">Напряжение:</span> {stressProfile.phase_behavior.escalation_phase_note}</p>
                  <p><span className="text-red-500 font-semibold">Срыв:</span> {stressProfile.phase_behavior.breakdown_phase_note}</p>
                </div>
              </section>

              {/* DYAD / ToM */}
              <section className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                <h2 className="text-xs font-bold text-canon-text uppercase tracking-wider mb-3">Базовые отношения (ToM)</h2>
                
                <div className="grid grid-cols-2 gap-4 mb-3 text-[10px]">
                    <div className="bg-canon-bg p-2 rounded">
                        <div className="text-canon-text-light mb-1">Trust Bias</div>
                        <div className={`font-mono font-bold ${safeTrustBias > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {safeTrustBias > 0 ? '+' : ''}{safeTrustBias.toFixed(2)}
                        </div>
                    </div>
                    <div className="bg-canon-bg p-2 rounded">
                        <div className="text-canon-text-light mb-1">Paranoia</div>
                        <div className={`font-mono font-bold ${safeParanoiaBias > 0 ? 'text-red-400' : 'text-green-400'}`}>
                             {safeParanoiaBias > 0 ? '+' : ''}{safeParanoiaBias.toFixed(2)}
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                        <thead>
                        <tr className="text-canon-text-light border-b border-canon-border/50">
                            <th className="text-left py-1 font-normal">К кому</th>
                            <th className="text-center py-1 font-normal">Доверие</th>
                            <th className="text-center py-1 font-normal">Страх</th>
                            <th className="text-center py-1 font-normal">Уважение</th>
                        </tr>
                        </thead>
                        <tbody>
                        {Object.keys(dyadDefaults.default_trust_to || {}).map(idB => (
                            <tr key={idB} className="border-b border-canon-border/30 last:border-0">
                            <td className="py-1 font-mono">{idB}</td>
                            <td className="py-1 text-center text-canon-text">{(dyadDefaults.default_trust_to[idB] ?? 0).toFixed(2)}</td>
                            <td className="py-1 text-center text-canon-text-light">{dyadDefaults.default_fear_to?.[idB]?.toFixed(2) ?? '-'}</td>
                            <td className="py-1 text-center text-canon-text-light">{dyadDefaults.default_respect_to?.[idB]?.toFixed(2) ?? '-'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
              </section>

          </div>
      </div>

      {/* DEBUG JSON */}
      <div className="border-t border-canon-border pt-4">
        <button 
            onClick={() => setJsonOpen(!jsonOpen)}
            className="text-[10px] text-canon-text-light hover:text-canon-accent uppercase font-bold tracking-wider"
        >
            {jsonOpen ? '▼ Скрыть Raw JSON' : '▶ Показать Raw JSON'}
        </button>
        {jsonOpen && (
            <pre className="mt-2 p-4 bg-black/30 rounded border border-canon-border text-[10px] font-mono text-canon-text-light/70 whitespace-pre-wrap break-all">
            {JSON.stringify(archetype, null, 2)}
            </pre>
        )}
      </div>
    </div>
  );
};

// --- Subcomponents ---

const AxisBar: React.FC<{ label: string; left: string; right: string; value: number; color?: string }> = ({ label, left, right, value, color }) => {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const barColor = color || 'bg-canon-accent';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-canon-text">
        <span>{label}</span>
        <span className="font-mono opacity-70">{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-canon-bg border border-canon-border/30 overflow-hidden relative">
        <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-canon-text-light opacity-50">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
};

const LatentGrid: React.FC<{ metrics: ArchetypeLatentMetrics }> = ({ metrics }) => {
    const items = [
        { l: 'Лидерство', v: metrics.leadership },
        { l: 'Риск', v: metrics.risk_tolerance },
        { l: 'Стабильность', v: metrics.stability },
        { l: 'Жестокость', v: metrics.cruelty },
        { l: 'Эмпатия', v: metrics.empathy },
        { l: 'Лояльность', v: metrics.loyalty },
        { l: 'Автономия', v: metrics.autonomy_drive },
        { l: 'Скрытность', v: metrics.secrecy },
        { l: 'Кооперация', v: metrics.cooperativeness },
    ];

    return (
        <div className="grid grid-cols-3 gap-2">
            {items.map(item => (
                <div key={item.l} className="bg-canon-bg p-1.5 rounded border border-canon-border/30 text-center">
                    <div className="text-[9px] text-canon-text-light uppercase truncate">{item.l}</div>
                    <div className="h-1 w-full bg-canon-bg-light rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-canon-blue" style={{width: `${item.v * 100}%`}}></div>
                    </div>
                    <div className="text-[9px] font-mono mt-0.5">{(item.v * 100).toFixed(0)}</div>
                </div>
            ))}
        </div>
    )
}
