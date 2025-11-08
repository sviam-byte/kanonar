import React from 'react';
import { AnyEntity } from '../types';

interface ActionButtonsProps {
    entity: AnyEntity;
    setAllParams: (params: Record<string, number>) => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ entity, setAllParams }) => {

    const handleResetToCanon = () => {
        const canonParams = Object.fromEntries(
            entity.parameters.map(p => [p.key, p.canonValue])
        );
        setAllParams(canonParams);
    };

    const handleResetToDefaults = () => {
        const defaultParams = Object.fromEntries(
            entity.parameters.map(p => [p.key, p.defaultValue])
        );
        setAllParams(defaultParams);
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('URL скопирован в буфер обмена!');
    };
    
    const handleClearUrl = () => {
        const newUrl = window.location.pathname;
        window.history.pushState({}, '', newUrl);
        // This won't trigger a re-render by itself in this setup, so we reload.
        window.location.reload();
    }

    const Button: React.FC<{onClick?: () => void, children: React.ReactNode}> = ({ onClick, children }) => (
        <button onClick={onClick} className="w-full text-sm bg-canon-bg-light border border-canon-border rounded px-3 py-1.5 hover:bg-canon-accent hover:text-canon-bg transition-colors">
            {children}
        </button>
    );

    return (
        <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleResetToCanon}>Канон</Button>
            <Button onClick={handleResetToDefaults}>Сброс</Button>
            <Button onClick={handleClearUrl}>Очистить URL</Button>
            <Button onClick={handleShare}>Поделиться</Button>
            <Button>Экспорт</Button>
            <Button>Импорт</Button>
        </div>
    );
};