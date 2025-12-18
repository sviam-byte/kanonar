import React, { useRef } from 'react';
import { AnyEntity, EntityType, CharacterEntity } from '../types';

interface ActionButtonsProps {
    entity: AnyEntity;
    paramValues: AnyEntity;
    defaultValues: AnyEntity;
    setAllParams: (params: AnyEntity) => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ entity, paramValues, defaultValues, setAllParams }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleResetToCanon = () => {
        // Canon is the default values from the entity file.
        setAllParams(defaultValues);
    };

    const handleResetToDefaults = () => {
        setAllParams(defaultValues);
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('URL скопирован в буфер обмена!');
    };
    
    const handleClearUrl = () => {
        const newUrl = window.location.pathname + window.location.hash.split('?')[0];
        window.history.pushState({}, '', newUrl);
        setAllParams(defaultValues); // Reset state in the UI without reloading
    };

    const handleExport = () => {
        // We export the full state object, not just the flat param values
        const jsonString = JSON.stringify(paramValues, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entity.entityId}-state.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                // Basic validation: check if it has an entityId
                if (typeof json === 'object' && json !== null && json.entityId) {
                    setAllParams(json);
                } else {
                    alert('Ошибка: Неверный формат файла. Ожидается полный JSON-объект сущности.');
                }
            } catch (error) {
                alert('Ошибка: Не удалось прочитать JSON-файл.');
                console.error("Import error:", error);
            }
        };
        reader.readAsText(file);
        // Reset file input to allow importing the same file again
        event.target.value = '';
    };

    const Button: React.FC<{onClick?: () => void, children: React.ReactNode, disabled?: boolean, title?: string}> = ({ onClick, children, disabled, title }) => (
        <button onClick={onClick} disabled={disabled} title={title} className="w-full text-sm bg-canon-bg-light border border-canon-border rounded px-3 py-1.5 hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-canon-bg-light disabled:hover:text-canon-text">
            {children}
        </button>
    );

    return (
        <div className="grid grid-cols-2 gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" style={{ display: 'none' }} />
            <Button onClick={handleResetToCanon} title="Reset to canon values">Канон</Button>
            <Button onClick={handleResetToDefaults} title="Reset to default values">Сброс</Button>
            <Button onClick={handleClearUrl}>Очистить URL</Button>
            <Button onClick={handleShare}>Поделиться</Button>
            <Button onClick={handleExport}>Экспорт</Button>
            <Button onClick={handleImportClick}>Импорт</Button>
        </div>
    );
};