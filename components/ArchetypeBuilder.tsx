

import React, { useState, useMemo, useCallback } from 'react';
import { CharacterEntity } from '../types';
import { createFittedCharacterFromArchetype } from '../lib/archetypes/fitter';
import { DOMAIN_NAMES, FUNCTION_NAMES } from '../data/archetypes';

const LAMBDA_OPTIONS = [
    { value: 'H', label: 'Human' },
    { value: 'D', label: 'Divine' },
    { value: 'O', label: 'Other' }
];
const MU_OPTIONS = [
    { value: 'SR', label: 'SR (Герой/Атака)' },
    { value: 'OR', label: 'OR (Жертва/Сбой)' },
    { value: 'SN', label: 'SN (Правитель/Норма)' },
    { value: 'ON', label: 'ON (Инструмент/Функция)' }
];
const DOMAIN_OPTIONS = DOMAIN_NAMES.map((name, i) => ({ value: String(i), label: name }));

interface ArchetypeBuilderProps {
    onAddArchetype: (archetype: CharacterEntity) => void;
}

const Select: React.FC<{label: string, value: string | number, onChange: (v: string) => void, options: {value: string | number, label: string}[]}> = ({label, value, onChange, options}) => (
    <div>
        <label className="text-xs text-canon-text-light">{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded p-1.5 mt-1 text-sm">
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

export const ArchetypeBuilder: React.FC<ArchetypeBuilderProps> = ({ onAddArchetype }) => {
    const [lambda, setLambda] = useState<'H'|'D'|'O'>('H');
    const [mu, setMu] = useState('SR');
    const [domainIndex, setDomainIndex] = useState('0');
    const [funcIndexInDomain, setFuncIndexInDomain] = useState('0');

    const functionOptions = useMemo(() => {
        const dIndex = parseInt(domainIndex, 10);
        const startIndex = dIndex * 4;
        return Array.from({ length: 4 }, (_, i) => ({
            value: String(i),
            label: FUNCTION_NAMES[startIndex + i]
        }));
    }, [domainIndex]);

    const handleAdd = useCallback(() => {
        const dIndex = parseInt(domainIndex, 10);
        const fIndex = parseInt(funcIndexInDomain, 10);
        const f = dIndex * 4 + fIndex + 1;
        const archetypeChar = createFittedCharacterFromArchetype(lambda, f, mu);
        if (archetypeChar) {
            onAddArchetype(archetypeChar);
        } else {
            alert('Не удалось создать архетип.');
        }
    }, [lambda, mu, domainIndex, funcIndexInDomain, onAddArchetype]);

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                <Select label="Сущность (λ)" value={lambda} onChange={(v) => setLambda(v as "H"|"D"|"O")} options={LAMBDA_OPTIONS} />
                <Select label="Модус (μ)" value={mu} onChange={setMu} options={MU_OPTIONS} />
                <Select label="Домен (j)" value={domainIndex} onChange={(v) => { setDomainIndex(v); setFuncIndexInDomain('0'); }} options={DOMAIN_OPTIONS} />
                <Select label="Функция (k)" value={funcIndexInDomain} onChange={setFuncIndexInDomain} options={functionOptions} />
            </div>
            <button
                onClick={handleAdd}
                className="w-full bg-canon-blue text-canon-bg font-bold rounded p-2 hover:bg-opacity-80 transition-colors"
            >
                Добавить архетип в симуляцию
            </button>
        </div>
    );
};