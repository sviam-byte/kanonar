
// components/CharacterParameters.tsx

import React from 'react';
import { CharacterEntity, AnyEntity } from '../types';
import { characterSchema } from '../data/character-schema';
import { ParameterControl } from './ParameterControl';
import { getNestedValue, getPathAndSchemaKey } from '../lib/param-utils';
import { Tabs } from './Tabs';
import { LatentOverview } from './LatentOverview';

interface CharacterParametersProps {
    entity: CharacterEntity | AnyEntity;
    paramValues: CharacterEntity | AnyEntity;
    latents?: Record<string, number>;
    onParamChange: (key: string, value: number) => void;
    isReadOnly?: boolean;
    lockedParams: Set<string>;
    onToggleLock: (key: string) => void;
    header?: React.ReactNode;
}

const parameterGroups: Record<string, string[]> = {
    'Векторный Базис (A-G)': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    'Тело': ['body_constitution', 'body_capacity', 'body_reserves', 'body_acute', 'body_regulation'],
    'Состояние (Legacy)': ['legacy_state'],
    'Компетенции (Legacy)': ['legacy_competencies'],
    'Память (Legacy)': ['legacy_memory'],
    'Ресурсы и Доступ': ['resources', 'identity', 'authority', 'evidence', 'observation', 'compute'],
};

const categoryTitles: Record<string, string> = {
  A: 'A) Ценности и нормы',
  B: 'B) Когнитивно-решенческие',
  C: 'C) Социально-стратегические',
  D: 'D) Телесно-нейро',
  E: 'E) Содержание (Знания/Навыки)',
  F: 'F) Динамика (Обучение)',
  G: 'G) Мета-уровень',
  
  body_constitution: 'Конституция',
  body_capacity: 'Способности',
  body_reserves: 'Резервы и Гомеостаз',
  body_acute: 'Острое состояние',
  body_regulation: 'Регуляция',

  identity: 'Identity',
  authority: 'Authority',
  resources: 'Resources',
  evidence: 'Evidence',
  observation: 'Observation',
  context: 'Context',
  compute: 'Compute',
  
  legacy_state: 'Состояние (Legacy)',
  legacy_memory: 'Память (Legacy)',
  legacy_competencies: 'Компетенции (Legacy)',

};


export const CharacterParameters: React.FC<CharacterParametersProps> = ({ entity, paramValues, latents, onParamChange, isReadOnly = false, lockedParams, onToggleLock, header }) => {
    
    const renderGroup = (categories: string[], importanceFilter?: 'core' | 'secondary') => (
        <div className="pt-2">
            {categories.map((category) => {
                const { schemaKey, pathPrefix } = getPathAndSchemaKey(category);
                const params = characterSchema[schemaKey] || {};
                
                let paramEntries = Object.entries(params);
                if (importanceFilter) {
                    paramEntries = paramEntries.filter(([_, schema]) => schema.importance === importanceFilter);
                }

                if (paramEntries.length === 0) return null;

                return (
                     <div key={category} className="mb-4">
                        {categories.length > 1 && (
                             <h4 className="font-bold text-sm text-canon-text-light mb-2 capitalize">
                                {categoryTitles[schemaKey] || category.replace(/_/g, ' ')}
                            </h4>
                        )}
                        {paramEntries.map(([key, schema]) => {
                            const fullKey = schema.path || (pathPrefix ? `${pathPrefix}.${key}` : key);
                            // FIX: Add type casts because getNestedValue now returns 'any'.
                            const defaultValue = getNestedValue(entity, fullKey) as number | undefined;
                            const currentValue = getNestedValue(paramValues, fullKey) as number | undefined;

                            if (defaultValue === undefined) return null;

                            return (
                                <ParameterControl
                                    key={fullKey}
                                    fullKey={fullKey}
                                    name={schema.name}
                                    description={schema.description}
                                    min={schema.min}
                                    max={schema.max}
                                    step={schema.step}
                                    value={currentValue ?? defaultValue}
                                    onValueChange={value => onParamChange(fullKey, value)}
                                    canonValue={defaultValue}
                                    defaultValue={defaultValue}
                                    isReadOnly={isReadOnly}
                                    isLocked={lockedParams.has(fullKey)}
                                    onToggleLock={onToggleLock}
                                />
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
    
    const vectorBaseContent = (
      <Tabs tabs={[
        { label: 'Ядро (Core)', content: renderGroup(parameterGroups['Векторный Базис (A-G)'], 'core') },
        { label: 'Вторичные оси', content: renderGroup(parameterGroups['Векторный Базис (A-G)'], 'secondary') },
      ]} />
    );

    const paramTabs = [
        {
            label: 'Векторный базис',
            content: vectorBaseContent,
        },
        ...(latents ? [{
            label: 'Латенты',
            content: <LatentOverview latents={latents} />
        }] : []),
        {
            label: 'Тело',
            content: renderGroup(parameterGroups['Тело'])
        },
        {
            label: 'Legacy & Система',
            content: (
                <div className="pt-2">
                    {renderGroup(parameterGroups['Состояние (Legacy)'])}
                    {renderGroup(parameterGroups['Компетенции (Legacy)'])}
                    {renderGroup(parameterGroups['Память (Legacy)'])}
                    {renderGroup(parameterGroups['Ресурсы и Доступ'])}
                </div>
            )
        }
    ];

    return (
        <div className="max-h-[70vh] overflow-y-auto pr-2">
            {header}
            <Tabs tabs={paramTabs} />
        </div>
    );
};
