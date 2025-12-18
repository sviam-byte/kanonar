import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEntities } from '../data';
import { Branch, AnyEntity, Parameter, CharacterEntity, EntityType } from '../types';
import { characterSchema } from '../data/character-schema';


// Helper to get nested property
const getNestedValue = (obj: any, path: string): number | undefined => {
    const value = path.split('.').reduce((o, k) => (o || {})[k], obj);
    return typeof value === 'number' ? value : undefined;
};


export const ComparePage: React.FC = () => {
    const { entityId } = useParams<{ entityId: string }>();

    const [branchA, setBranchA] = useState<Branch>(Branch.Current);
    const [branchB, setBranchB] = useState<Branch>(Branch.PreRector);

    const { entityA, entityB, allBranchesForEntity } = useMemo(() => {
        const allVersions = getEntities().filter(e => e.entityId === entityId);
        if (allVersions.length === 0) return { entityA: undefined, entityB: undefined, allBranchesForEntity: [] };

        const entityA = allVersions.find(e => 'versionTags' in e && Array.isArray(e.versionTags) && e.versionTags.includes(branchA));
        const entityB = allVersions.find(e => 'versionTags' in e && Array.isArray(e.versionTags) && e.versionTags.includes(branchB));
        
        const allBranchesForEntity = [...new Set(allVersions.flatMap(e => 'versionTags' in e && Array.isArray(e.versionTags) ? e.versionTags : []))] as Branch[];

        return { entityA, entityB, allBranchesForEntity };
    }, [entityId, branchA, branchB]);
    
    const isCharacter = entityA?.type === EntityType.Character || entityA?.type === EntityType.Essence;

    const { divergence, allParams } = useMemo(() => {
        if (!entityA || !entityB || branchA === branchB) return { divergence: 0, allParams: [] };

        if (isCharacter) {
            let sumOfSquares = 0;
            const paramKeys: string[] = [];
            
            Object.entries(characterSchema).forEach(([category, params]) => {
                Object.entries(params).forEach(([key, schema]) => {
                    const block = category.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                    const fullKey = `${block}.${key}`;
                    paramKeys.push(fullKey);
                    
                    const valA = getNestedValue(entityA, fullKey);
                    const valB = getNestedValue(entityB, fullKey);

                    if (valA !== undefined && valB !== undefined) {
                        const normA = (valA - schema.min) / (schema.max - schema.min) || 0;
                        const normB = (valB - schema.min) / (schema.max - schema.min) || 0;
                        sumOfSquares += (normA - normB) ** 2;
                    } else if (valA !== valB) { // one is defined, one is not
                        sumOfSquares += 1; // max divergence
                    }
                });
            });
            const div = paramKeys.length > 0 ? Math.sqrt(sumOfSquares / paramKeys.length) * 100 : 0;
            return { divergence: div, allParams: paramKeys };

        } else { // Object logic
            let sumOfSquares = 0;
            const checkedParams = new Set<string>();
            const paramKeys = new Set<string>();
            if('parameters' in entityA && Array.isArray(entityA.parameters)) entityA.parameters.forEach(p => paramKeys.add(p.key));
            if('parameters' in entityB && Array.isArray(entityB.parameters)) entityB.parameters.forEach(p => paramKeys.add(p.key));

            for (const key of paramKeys) {
                const paramA = ('parameters' in entityA && Array.isArray(entityA.parameters)) ? entityA.parameters.find(p => p.key === key) : undefined;
                const paramB = ('parameters' in entityB && Array.isArray(entityB.parameters)) ? entityB.parameters.find(p => p.key === key) : undefined;
                if (paramA && paramB) {
                    const valA = (paramA.canonValue - paramA.min) / (paramA.max - paramA.min) || 0;
                    const valB = (paramB.canonValue - paramB.min) / (paramB.max - paramB.min) || 0;
                    sumOfSquares += (valA - valB) ** 2;
                    checkedParams.add(key);
                }
            }
            const div = checkedParams.size > 0 ? Math.sqrt(sumOfSquares / checkedParams.size) * 100 : 0;
            return { divergence: div, allParams: Array.from(paramKeys) };
        }
    }, [entityA, entityB, branchA, branchB, isCharacter]);


    if (!entityA && !entityB) {
        return <div className="p-8 text-canon-red text-center">Сущность с ID '{entityId}' не найдена.</div>;
    }

    const title = entityA?.title || entityB?.title;
    
    const BranchSelector: React.FC<{ value: Branch, onChange: (b: Branch) => void }> = ({ value, onChange }) => (
        <select value={value} onChange={e => onChange(e.target.value as Branch)} className="w-full bg-canon-bg border border-canon-border rounded px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-canon-accent">
            {allBranchesForEntity.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
    );

    const renderCharacterComparison = () => (
         <tbody>
            {allParams.map(fullKey => {
                 const [category, key] = fullKey.split('.');
                const schemaBlock = Object.keys(characterSchema).find(k => k.replace(/_([a-z])/g, (g) => g[1].toUpperCase()) === category);
                if (!schemaBlock) return null;

                const schema = (characterSchema as any)[schemaBlock]?.[key];
                if (!schema) return null;

                const valA = getNestedValue(entityA as CharacterEntity, fullKey);
                const valB = getNestedValue(entityB as CharacterEntity, fullKey);
                const diff = (valA ?? 0) - (valB ?? 0);
                
                if (valA === undefined && valB === undefined) return null;

                return (
                    <tr key={fullKey} className="border-b border-canon-border/50">
                        <td className="p-3 font-semibold">{schema.name}</td>
                        <td className="p-3 text-center font-mono">{valA !== undefined ? valA : 'N/A'}</td>
                        <td className="p-3 text-center font-mono">
                            <span>{valB !== undefined ? valB : 'N/A'}</span>
                            {valA !== undefined && valB !== undefined && diff !== 0 && (
                                <span className={`ml-2 font-bold ${diff > 0 ? 'text-canon-green' : 'text-canon-red'}`}>
                                    ({diff > 0 ? '+' : ''}{diff.toFixed(schema.step < 1 ? 2 : 0)})
                                </span>
                            )}
                        </td>
                    </tr>
                )
            })}
        </tbody>
    );

    const renderObjectComparison = () => (
         <tbody>
            {allParams.map(key => {
                const paramA = ('parameters' in entityA && Array.isArray(entityA.parameters)) ? entityA.parameters.find(p => p.key === key) : undefined;
                const paramB = ('parameters' in entityB && Array.isArray(entityB.parameters)) ? entityB.parameters.find(p => p.key === key) : undefined;
                const paramMeta = paramA || paramB;
                const diff = (paramA?.canonValue ?? 0) - (paramB?.canonValue ?? 0);

                return (
                    <tr key={key} className="border-b border-canon-border/50">
                        <td className="p-3 font-semibold">{paramMeta?.name}</td>
                        <td className="p-3 text-center font-mono">{paramA ? paramA.canonValue : 'N/A'}</td>
                        <td className="p-3 text-center font-mono">
                            <span>{paramB ? paramB.canonValue : 'N/A'}</span>
                            {paramA && paramB && diff !== 0 && (
                                    <span className={`ml-2 font-bold ${diff > 0 ? 'text-canon-green' : 'text-canon-red'}`}>
                                    ({diff > 0 ? '+' : ''}{diff})
                                </span>
                            )}
                        </td>
                    </tr>
                )
            })}
        </tbody>
    );


    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-4xl font-bold mb-2">Сравнение веток: <span className="text-canon-accent">{title}</span></h2>
                <p className="text-lg text-canon-text-light">
                    Сравните канонические состояния сущности в разных временных линиях.
                </p>
                 <div className="mt-4 font-mono text-xl">
                    Расхождение: <span className="font-bold text-canon-blue">{divergence.toFixed(2)}%</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
                <div><BranchSelector value={branchA} onChange={setBranchA} /></div>
                <div><BranchSelector value={branchB} onChange={setBranchB} /></div>
            </div>

            <div className="bg-canon-bg-light border border-canon-border rounded-lg">
                <table className="w-full text-left">
                    <thead className="border-b border-canon-border">
                        <tr className="text-canon-text-light">
                            <th className="p-4 w-1/3">Параметр</th>
                            <th className="p-4 w-1/3 text-center">{branchA}</th>
                            <th className="p-4 w-1/3 text-center">{branchB}</th>
                        </tr>
                    </thead>
                    {isCharacter ? renderCharacterComparison() : renderObjectComparison()}
                </table>
                 {(branchA === branchB) && <p className="p-8 text-center text-canon-text-light">Выберите разные ветки для сравнения.</p>}
            </div>
             <div className="text-center mt-8">
                <Link to={`/${(entityA || entityB)?.type}/${entityId}`} className="text-canon-accent hover:underline">
                    &larr; Вернуться к сущности
                </Link>
            </div>
        </div>
    );
};