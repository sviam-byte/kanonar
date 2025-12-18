import React, { useState, useCallback } from 'react';
import { SocialEventEntity, CharacterEntity } from '../types';
import { Slider } from './Slider';

interface SocialEventLoggerProps {
    observer: CharacterEntity;
    target: CharacterEntity;
    onAddSocialEvent: (event: Partial<SocialEventEntity>) => void;
}

const eventDomains = ['ally', 'deal', 'conflict', 'aid', 'harm', 'info', 'ritual', 'cosign', 'defect', 'rescue', 'teach', 'mentor', 'public_speech', 'opsec', 'topo', 'causal'];

export const SocialEventLogger: React.FC<SocialEventLoggerProps> = ({ observer, target, onAddSocialEvent }) => {
    const [domain, setDomain] = useState('ally');
    const [polarity, setPolarity] = useState(1);
    const [intensity, setIntensity] = useState(0.5);
    const [scope, setScope] = useState<'private' | 'ingroup' | 'public'>('private');
    
    const handleAddEvent = useCallback(() => {
        const newEvent: Partial<SocialEventEntity> = {
            actorId: observer.entityId,
            targetId: target.entityId,
            domain,
            polarity,
            intensity,
            scope,
        };
        onAddSocialEvent(newEvent);
    }, [observer, target, domain, polarity, intensity, scope, onAddSocialEvent]);
    
     const Select: React.FC<{label: string, value: string, onChange: (v: string) => void, options: {value: string, label: string}[]}> = ({label, value, onChange, options}) => (
        <div>
            <label className="text-xs text-canon-text-light">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-canon-bg-light border border-canon-border rounded p-1.5 mt-1 text-xs">
                {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>
    );

    return (
        <div className="space-y-3">
             <div className="grid grid-cols-2 gap-4">
                 <Select label="Домен" value={domain} onChange={setDomain} options={eventDomains.map(d => ({value: d, label: d}))} />
                 <Select label="Масштаб" value={scope} onChange={v => setScope(v as any)} options={[{value:'private', label:'Личное'}, {value:'ingroup', label:'Внутригрупповое'}, {value:'public', label:'Публичное'}]} />
             </div>
             <Slider label="Полярность (Вред ↔ Помощь)" value={polarity} setValue={setPolarity} min={-1} max={1} step={0.1} />
             <Slider label="Интенсивность" value={intensity} setValue={setIntensity} />
             <button onClick={handleAddEvent} className="w-full bg-canon-blue text-canon-bg font-bold rounded px-4 py-2 hover:bg-opacity-80 transition-colors text-sm">
                Зарегистрировать событие
            </button>
        </div>
    )
};