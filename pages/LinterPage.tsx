import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getEntities, entityMap, getEntityById } from '../data';
import { runCanonLinter } from '../lib/linter';
import { Tabs } from '../components/Tabs';
import { UnifiedReferenceDisplay } from '../components/UnifiedReferenceDisplay';
import { AnyEntity } from '../types';
import { EventsAndGoalsReference } from '../components/EventsAndGoalsReference';

const severityStyles: Record<string, string> = {
    error: 'bg-canon-red/20 border-canon-red text-canon-red',
    warn: 'bg-yellow-500/20 border-yellow-500 text-yellow-400',
    info: 'bg-canon-blue/20 border-canon-blue text-canon-blue',
};

const severityText: Record<string, string> = {
    all: 'All',
    error: 'Errors',
    warn: 'Warnings',
    info: 'Info',
};


const LinterResults: React.FC = () => {
    const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');

    const allIssues = useMemo(() => {
        const entities = getEntities();
        return runCanonLinter(entities, entityMap);
    }, []);

    const filteredIssues = useMemo(() => {
        if (filter === 'all') return allIssues;
        return allIssues.filter(issue => issue.severity === filter);
    }, [allIssues, filter]);
    
    const counts = useMemo(() => ({
        all: allIssues.length,
        error: allIssues.filter(i => i.severity === 'error').length,
        warn: allIssues.filter(i => i.severity === 'warn').length,
        info: allIssues.filter(i => i.severity === 'info').length,
    }), [allIssues]);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex space-x-2">
                    {(['all', 'error', 'warn', 'info'] as const).map(sev => (
                         <button 
                            key={sev}
                            onClick={() => setFilter(sev)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                filter === sev ? 'bg-canon-accent text-canon-bg' : 'bg-canon-bg-light hover:bg-canon-border'
                            }`}
                         >
                            <span className="capitalize">{severityText[sev]}</span>
                            <span className="ml-2 text-xs bg-canon-bg text-canon-text-light rounded-full px-2 py-0.5">{counts[sev]}</span>
                         </button>
                    ))}
                </div>
                <div className="text-sm text-canon-text-light">
                    Найдено проблем: {allIssues.length}
                </div>
            </div>

            <div className="bg-canon-bg-light border border-canon-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-canon-bg text-canon-text-light">
                        <tr>
                            <th className="p-3 text-left w-1/12">Уровень</th>
                            <th className="p-3 text-left w-2/12">Сущность</th>
                            <th className="p-3 text-left w-2/12">Тип ошибки</th>
                            <th className="p-3 text-left w-7/12">Сообщение</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredIssues.map((issue) => {
                            const entity = getEntityById(issue.entityId);
                            return (
                                <tr key={issue.id} className="border-t border-canon-border/50 hover:bg-canon-border/20">
                                    <td className="p-3">
                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${severityStyles[issue.severity]}`}>
                                            {issue.severity.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="p-3 font-semibold">
                                        {entity ? (
                                            <Link to={`/${entity.type}/${entity.entityId}`} className="text-canon-accent hover:underline">
                                                {issue.entityTitle}
                                            </Link>
                                        ) : (
                                            issue.entityTitle
                                        )}
                                    </td>
                                    <td className="p-3 font-mono">{issue.type}</td>
                                    <td className="p-3 text-canon-text-light">{issue.message}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                 {filteredIssues.length === 0 && (
                    <div className="p-8 text-center text-canon-text-light">
                        Проблемы не найдены для текущего фильтра.
                    </div>
                )}
            </div>
        </div>
    );
};

const hasChangelog = (e: AnyEntity): e is (AnyEntity & { changelog: { version: string; date: string; author: string; summary: string; }[] }) => 
    'changelog' in e && Array.isArray((e as any).changelog) && (e as any).changelog.length > 0;

const ChangelogDisplay: React.FC = () => {
    const allEntities = useMemo(() => getEntities(), []);

    return (
        <div className="space-y-8">
            {allEntities.filter(hasChangelog).map(entity => (
                <div key={entity.entityId} className="bg-canon-bg-light border border-canon-border rounded-lg overflow-hidden">
                    <h3 className="text-lg font-bold text-canon-accent mb-0 px-6 py-4 bg-canon-bg border-b border-canon-border">
                        <Link to={`/${entity.type}/${entity.entityId}`} className="hover:underline">
                            {entity.title}
                        </Link>
                    </h3>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-canon-bg text-canon-text-light">
                            <tr>
                                <th className="p-3 px-6 text-left">Версия</th>
                                <th className="p-3 text-left">Дата</th>
                                <th className="p-3 text-left">Автор</th>
                                <th className="p-3 px-6 text-left">Описание</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entity.changelog.map(entry => (
                                <tr key={entry.version} className="border-t border-canon-border/50">
                                    <td className="p-3 px-6 font-mono">{entry.version}</td>
                                    <td className="p-3">{entry.date}</td>
                                    <td className="p-3">{entry.author}</td>
                                    <td className="p-3 px-6">{entry.summary}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};


export const LinterPage: React.FC = () => {
    const tabs = [
        { label: "Проверка целостности", content: <LinterResults /> },
        { label: "События и Цели", content: <EventsAndGoalsReference /> },
        { label: "Энциклопедия Модели", content: <UnifiedReferenceDisplay /> },
        { label: "История изменений", content: <ChangelogDisplay /> }
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-2">Справочник и Инструменты</h2>
                <p className="text-lg text-canon-text-light max-w-4xl mx-auto">
                    Автоматическая проверка целостности данных Kanonar и интерактивный справочник по основным математическим моделям, используемым в симуляциях.
                </p>
            </div>
            <Tabs tabs={tabs} />
        </div>
    );
};
