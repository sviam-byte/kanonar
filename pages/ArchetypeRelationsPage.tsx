
// pages/ArchetypeRelationsPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArchetypeRelationsGraph, NodeData } from '../components/ArchetypeRelationsGraph';
import { ARCHETYPE_NODES } from '../data/archetype-relations';

const ArchetypeInfoPanel: React.FC<{ node: NodeData | null }> = ({ node }) => {
    if (!node) {
        return (
            <div className="p-4 bg-canon-bg border border-canon-border/50 rounded-lg text-sm text-canon-text-light">
                <h3 className="font-bold text-base text-canon-text mb-2">Выберите узел</h3>
                <p>Наведите или нажмите на узел в графе, чтобы увидеть подробную информацию о нем.</p>
            </div>
        );
    }

    const isRole = node.type === 'role';
    const color = isRole ? '#00ccff' : '#33ff99';
    const isArchetype = node.type === 'human' || node.type === 'divine' || node.type === 'other';

    return (
        <div className="p-4 bg-canon-bg border-l-4 rounded-lg" style={{ borderColor: color }}>
            <h3 className="font-bold text-lg mb-2" style={{ color }}>{node.name}</h3>
            <p className="text-sm text-canon-text-light mb-4" dangerouslySetInnerHTML={{ __html: node.description }}></p>
            
            {isArchetype && (
                <Link 
                    to={`/character/ARCHETYPE::${node.id}`} 
                    className="inline-block mb-4 text-xs bg-canon-bg-light border border-canon-border px-3 py-1.5 rounded hover:bg-canon-accent hover:text-black transition-colors"
                >
                    Открыть паспорт архетипа ↗
                </Link>
            )}

            {isRole && node.weights && (
                <div>
                    <h4 className="font-bold text-xs text-canon-text-light uppercase mb-2">Ключевые архетипы</h4>
                    <ul className="space-y-1">
                        {Object.entries(node.weights)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([key, value]) => (
                                <li key={key} className="flex justify-between text-xs">
                                    <span className="text-canon-text">{ARCHETYPE_NODES.find(n => n.id === key)?.name || key}</span>
                                    <span className="font-mono">{(value as number).toFixed(2)}</span>
                                </li>
                            ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

const filterOptions = [
    { id: 'core', label: 'Core Metrics' },
    { id: 'roles', label: 'Social Roles' },
    { id: 'human', label: 'Human (H)' },
    { id: 'divine', label: 'Divine (D)' },
    { id: 'other', label: 'Other (O)' },
];

export const ArchetypeRelationsPage: React.FC = () => {
    const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
    const [filters, setFilters] = useState({
        core: true,
        roles: true,
        human: true,
        divine: false,
        other: false,
    });

    const handleFilterChange = (id: keyof typeof filters) => {
        setFilters(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="p-4 md:p-8">
            <div className="text-center mb-8">
                <h2 className="text-4xl font-bold mb-2">Граф Связей Архетипов</h2>
                <p className="text-lg text-canon-text-light max-w-4xl mx-auto">
                    Интерактивная визуализация связей между архетипами. Перетаскивайте узлы, чтобы увидеть физическую симуляцию в действии. Фильтруйте типы узлов для более детального анализа.
                </p>
            </div>

            <div className="flex justify-center gap-4 mb-4 p-4 bg-canon-bg-light border border-canon-border rounded-lg">
                {filterOptions.map(opt => (
                    <div key={opt.id} className="flex items-center">
                        <input
                            type="checkbox"
                            id={`filter-${opt.id}`}
                            checked={filters[opt.id as keyof typeof filters]}
                            onChange={() => handleFilterChange(opt.id as keyof typeof filters)}
                            className="w-4 h-4 text-canon-accent bg-canon-bg border-canon-border rounded focus:ring-canon-accent"
                        />
                        <label htmlFor={`filter-${opt.id}`} className="ml-2 text-sm text-canon-text">{opt.label}</label>
                    </div>
                ))}
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                <main className="flex-grow min-w-0">
                    <div className="h-[75vh] bg-canon-bg-light border border-canon-border rounded-lg relative">
                       <ArchetypeRelationsGraph onNodeSelect={setSelectedNode} filters={filters} />
                    </div>
                </main>
                <aside className="w-full md:w-80 flex-shrink-0">
                    <ArchetypeInfoPanel node={selectedNode} />
                </aside>
            </div>
        </div>
    );
};
