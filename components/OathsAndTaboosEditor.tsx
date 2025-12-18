
import React, { useState, useCallback, useMemo } from 'react';
import { CharacterEntity, IdentityCaps } from '../types';
import { sacredSetPresets, oathTemplates, hardCapPresets } from '../data/oaths-data';
import { useSandbox } from '../contexts/SandboxContext';
import { getEntitiesByType } from '../data';
import { EntityType } from '../types';

interface OathsAndTaboosEditorProps {
    character: CharacterEntity;
    onIdentityChange: (newIdentity: IdentityCaps) => void;
}

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="border-t border-canon-border pt-4 mt-4 first:mt-0 first:border-t-0">
        <h4 className="font-bold text-sm text-canon-text-light mb-3">{title}</h4>
        {children}
    </div>
);

const Badge: React.FC<{ onRemove?: () => void, children: React.ReactNode, className?: string, title?: string }> = ({ onRemove, children, className, title }) => (
    <div className={`inline-flex items-center bg-canon-bg border border-canon-border rounded px-2 py-0.5 text-xs font-mono ${className}`} title={title}>
        <span>{children}</span>
        {onRemove && (
            <button onClick={onRemove} className="ml-2 text-canon-red hover:text-white font-bold">&times;</button>
        )}
    </div>
);

const AddItemForm: React.FC<{
    options: { key: string, description: string }[] | { act: string, obj: string }[];
    onAdd: (value: any) => void;
    label: string;
    requireTarget?: boolean;
    availableTargets?: CharacterEntity[];
}> = ({ options, onAdd, label, requireTarget, availableTargets }) => {
    const [selectedValue, setSelectedValue] = useState('');
    const [targetId, setTargetId] = useState('');

    const handleAdd = () => {
        if (selectedValue) {
            // Find the full object from the selected value (key)
            const selectedOption = options.find(opt => 'key' in opt ? opt.key === selectedValue : `${opt.act}:${opt.obj}` === selectedValue);
            if (selectedOption) {
                const itemToAdd = { ...selectedOption };
                if (requireTarget && targetId) {
                    (itemToAdd as any).targetId = targetId;
                }
                onAdd(itemToAdd);
                setSelectedValue('');
                setTargetId('');
            }
        }
    };

    const selectedOption = options.find(opt => 'key' in opt ? opt.key === selectedValue : false);
    const needsTarget = requireTarget || (selectedOption && 'key' in selectedOption && (selectedOption as any).targetId !== undefined);

    return (
        <div className="mt-2 flex flex-col gap-2">
            <div className="flex gap-2">
                <select
                    value={selectedValue}
                    onChange={e => setSelectedValue(e.target.value)}
                    className="w-full bg-canon-bg-light border border-canon-border rounded px-2 py-1 text-xs"
                >
                    <option value="" disabled>{label}</option>
                    {options.map(opt => {
                        const value = 'key' in opt ? opt.key : `${opt.act}:${opt.obj}`;
                        const text = 'description' in opt ? opt.description : `${opt.act}:${opt.obj}`;
                        return <option key={value} value={value}>{text}</option>;
                    })}
                </select>
                <button onClick={handleAdd} disabled={!selectedValue || (needsTarget && !targetId)} className="bg-canon-accent text-canon-bg font-bold rounded px-3 py-1 text-xs hover:bg-opacity-80 disabled:bg-canon-border disabled:cursor-not-allowed">
                    +
                </button>
            </div>
            {needsTarget && availableTargets && (
                <select 
                    value={targetId} 
                    onChange={e => setTargetId(e.target.value)}
                    className="w-full bg-canon-bg-light border border-canon-border rounded px-2 py-1 text-xs"
                >
                    <option value="" disabled>Выберите цель (Кому?)</option>
                    {availableTargets.map(c => (
                        <option key={c.entityId} value={c.entityId}>{c.title}</option>
                    ))}
                </select>
            )}
        </div>
    );
};


export const OathsAndTaboosEditor: React.FC<OathsAndTaboosEditorProps> = ({ character, onIdentityChange }) => {
    const { identity } = character;
    const { sacred_set = [], oaths = [], hard_caps = [] } = identity;
    const { characters: sandboxCharacters } = useSandbox();

    const allCharacters = useMemo(() => {
        const baseChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
        return [...baseChars, ...sandboxCharacters];
    }, [sandboxCharacters]);

    const handleRemove = useCallback((listName: keyof IdentityCaps, index: number) => {
        const newList = [...(identity[listName] as any[])];
        newList.splice(index, 1);
        onIdentityChange({ ...identity, [listName]: newList });
    }, [identity, onIdentityChange]);

    const handleAdd = useCallback((listName: keyof IdentityCaps, item: any) => {
        // Prevent duplicates
        const currentList = (identity[listName] as any[]) || [];
        const itemKey = item.key || `${item.act}:${item.obj}`;
        // Simple duplicate check, might need better logic for targeted oaths
        const isDuplicate = currentList.some(existing => {
            const existingKey = existing.key || `${existing.act}:${existing.obj}`;
            return existingKey === itemKey && existing.targetId === item.targetId;
        });

        if (!isDuplicate) {
            onIdentityChange({ ...identity, [listName]: [...currentList, item] });
        } else {
            alert('Это правило уже добавлено.');
        }
    }, [identity, onIdentityChange]);
    
    const getTargetName = (id?: string) => {
        if (!id) return '';
        const t = allCharacters.find(c => c.entityId === id);
        return t ? ` -> ${t.title}` : ` -> ${id}`;
    }


    return (
        <div className="pt-2 max-h-[70vh] overflow-y-auto pr-2 text-sm">
            <Section title="Замкнутые классы табу (Sacred Set)">
                <div className="space-y-2">
                    {sacred_set.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {sacred_set.map((rule: any, index: number) => (
                                <Badge key={index} onRemove={() => handleRemove('sacred_set', index)}>
                                    <span className="text-canon-red">{rule.act}</span>:<span className="text-canon-blue">{rule.obj}</span>
                                    {rule.limit && <span className="text-yellow-400"> (limit: {rule.limit})</span>}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                         <p className="text-xs text-canon-text-light italic">Не задано.</p>
                    )}
                    <AddItemForm options={sacredSetPresets} onAdd={(item) => handleAdd('sacred_set', item)} label="Добавить табу..."/>
                </div>
            </Section>

            <Section title="Клятвы (Oaths)">
                 <div className="space-y-2">
                    {oaths.length > 0 ? (
                         <div className="flex flex-wrap gap-2">
                            {oaths.map((oath: any, index: number) => (
                                <Badge key={index} onRemove={() => handleRemove('oaths', index)} className="text-canon-accent" title={oath.description}>
                                    {oath.key || JSON.stringify(oath)}
                                    {oath.targetId && <span className="text-white opacity-70 ml-1">{getTargetName(oath.targetId)}</span>}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-canon-text-light italic">Не задано.</p>
                    )}
                    <AddItemForm 
                        options={oathTemplates} 
                        onAdd={(item) => handleAdd('oaths', item)} 
                        label="Добавить клятву..." 
                        availableTargets={allCharacters}
                    />
                </div>
            </Section>

            <Section title="Жёсткие капы (Hard Caps)">
                <div className="space-y-2">
                    {hard_caps.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {hard_caps.map((cap: any, index: number) => (
                                <Badge key={index} onRemove={() => handleRemove('hard_caps', index)} className="text-canon-text-light" title={cap.description}>
                                    {cap.key || JSON.stringify(cap)}
                                </Badge>
                            ))}
                        </div>
                     ) : (
                        <p className="text-xs text-canon-text-light italic">Не задано.</p>
                    )}
                    <AddItemForm options={hardCapPresets} onAdd={(item) => handleAdd('hard_caps', item)} label="Добавить кап..."/>
                </div>
            </Section>
        </div>
    );
};
