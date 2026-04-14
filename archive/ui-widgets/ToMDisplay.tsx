
// components/ToMDisplay.tsx
import React, { useState } from 'react';
import { CharacterEntity, SocialEventEntity, Relationship } from '../types';
import { getEntityById } from '../data';
import { SocialEventLogger } from './SocialEventLogger';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ToMDisplayProps {
  observer: CharacterEntity;
  allCharacters: CharacterEntity[];
  onAddSocialEvent: (event: Partial<SocialEventEntity>) => void;
  onGenerateToMReport: (targetId: string) => void;
}

const PolicyChart: React.FC<{ prior: Record<string, number> }> = ({ prior }) => {
    const data = Object.entries(prior)
        .map(([actionId, score]) => ({ name: actionId, score }))
        .sort((a, b) => (b.score as number) - (a.score as number))
        .slice(0, 8); // Top 8

    if (data.length === 0) return <div className="text-xs text-canon-text-light italic p-2">Нет данных о политике.</div>;

    return (
        <div className="h-40 w-full">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                    <XAxis type="number" domain={[0, 1]} hide />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#d1d1d1', fontSize: 10 }} width={100} interval={0} />
                    <Tooltip 
                        cursor={{fill: 'rgba(255,255,255,0.05)'}}
                        contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 12 }}
                        formatter={(value: number) => [value.toFixed(2), 'Вес']}
                    />
                    <Bar dataKey="score" barSize={15}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={'#00aaff'} fillOpacity={0.6} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const ToMDisplay: React.FC<ToMDisplayProps> = ({ observer, allCharacters, onAddSocialEvent, onGenerateToMReport }) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  
  const otherCharacters = allCharacters.filter(c => c.entityId !== observer.entityId);

  if (!selectedTargetId && otherCharacters.length > 0) {
      setSelectedTargetId(otherCharacters[0].entityId);
  }

  const selectedTarget = getEntityById(selectedTargetId) as CharacterEntity | undefined;
  
  // Safely access tom data (might be undefined in legacy/init)
  const tomEntry = (observer as any).tom?.[observer.entityId]?.[selectedTargetId] || (observer as any).tom?.[selectedTargetId];
  const policyPrior = tomEntry?.policyPrior?.actionMask;

  return (
    <div className="space-y-6">
        <div>
            <label htmlFor="target-select" className="text-sm font-semibold text-canon-text-light block mb-1">Выберите цель для анализа / взаимодействия</label>
            <select
                id="target-select"
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="w-full bg-canon-bg-light border border-canon-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-canon-accent"
            >
                <option value="" disabled>Выберите персонажа...</option>
                {otherCharacters.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
            </select>
        </div>

      {selectedTarget && (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-canon-bg p-4 rounded-md border border-canon-border/50">
                    <h4 className="font-bold text-canon-text mb-2">Анализ "Теории Разума"</h4>
                    <p className="text-xs text-canon-text-light mb-3">Сгенерировать подробный отчет о том, как {observer.title} воспринимает {selectedTarget.title}, включая вероятность донорства целей, без немедленных последствий.</p>
                    <button 
                        onClick={() => onGenerateToMReport(selectedTargetId)}
                        className="w-full bg-canon-bg-light border border-canon-border rounded px-4 py-2 hover:bg-canon-accent hover:text-canon-bg transition-colors font-semibold text-xs"
                    >
                        Сгенерировать отчет ToM
                    </button>
                </div>
                
                <div className="bg-canon-bg p-4 rounded-md border border-canon-border/50">
                     <h4 className="font-bold text-canon-text mb-2">Ожидаемая Политика (Prior)</h4>
                     <p className="text-xs text-canon-text-light mb-2">Какие действия {observer.title} считает наиболее вероятными для {selectedTarget.title} (на основе целей).</p>
                     {policyPrior ? (
                         <PolicyChart prior={policyPrior} />
                     ) : (
                         <div className="text-xs text-canon-text-light italic">Нет данных о политике. Запустите симуляцию.</div>
                     )}
                </div>
            </div>

             <div className="bg-canon-bg p-4 rounded-md border border-canon-border/50">
                <h4 className="font-bold text-canon-text mb-2">Регистрация социального события</h4>
                <p className="text-xs text-canon-text-light mb-3">Зарегистрировать событие, которое немедленно повлияет на состояние и отношения персонажей.</p>
                <SocialEventLogger 
                    observer={observer}
                    target={selectedTarget}
                    onAddSocialEvent={onAddSocialEvent}
                />
            </div>
        </>
      )}

      <div>
        <h4 className="text-lg font-bold text-canon-text mb-3 border-b border-canon-border pb-1">Текущие Отношения</h4>
        <p className="text-xs text-canon-text-light mb-2">Это динамически рассчитанные отношения текущего персонажа (Наблюдателя) к другим. Они меняются в реальном времени при добавлении социальных событий.</p>
        <div className="space-y-4">
          {observer.relationships && Object.keys(observer.relationships).length > 0 ? (
            Object.entries(observer.relationships).map(([agentId, relationship]) => {
              const agent = getEntityById(agentId);
              const rel = relationship as Relationship;
              return (
                <div key={agentId} className="bg-canon-bg/50 p-3 rounded-md border border-canon-border/30">
                  <div className="font-bold text-canon-accent mb-2 text-sm">
                    {agent ? agent.title : `Неизвестный агент (${agentId})`}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                     <div><span className="text-canon-text-light">Trust: </span><span className="font-mono">{rel.trust.toFixed(2)}</span></div>
                     <div><span className="text-canon-text-light">Align: </span><span className="font-mono">{rel.align.toFixed(2)}</span></div>
                     <div><span className="text-canon-text-light">Respect: </span><span className="font-mono">{rel.respect.toFixed(2)}</span></div>
                     <div><span className="text-canon-text-light">Bond: </span><span className="font-mono">{rel.bond.toFixed(2)}</span></div>
                     <div className="text-yellow-400"><span className="text-canon-text-light">Conflict: </span><span className="font-mono">{rel.conflict.toFixed(2)}</span></div>
                     <div className="text-red-400"><span className="text-canon-text-light">Fear: </span><span className="font-mono">{rel.fear.toFixed(2)}</span></div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-canon-text-light italic">Нет данных об отношениях. Добавьте социальное событие, чтобы сгенерировать их.</p>
          )}
        </div>
      </div>
    </div>
  );
};
