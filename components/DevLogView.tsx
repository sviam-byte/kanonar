import React, { useState } from 'react';
import { NarrativeLogLine, DevLogLine } from '../types';

interface DevLogViewProps {
    narrativeLog: NarrativeLogLine[];
    devLog: DevLogLine[];
}

export const DevLogView: React.FC<DevLogViewProps> = ({ narrativeLog, devLog }) => {
    const [selectedTick, setSelectedTick] = useState<number | null>(narrativeLog.length > 0 ? narrativeLog[narrativeLog.length-1].tick : null);

    const tickDetails = selectedTick !== null ? devLog.filter(l => l.tick === selectedTick) : [];
    const reversedNarrative = React.useMemo(() => [...narrativeLog].reverse(), [narrativeLog]);

    const handleCopyLog = () => {
        try {
            navigator.clipboard.writeText(JSON.stringify(devLog, null, 2));
            alert('Полный лог скопирован в буфер обмена!');
        } catch (err) {
            console.error('Failed to copy log: ', err);
            alert('Не удалось скопировать лог.');
        }
    };

    const handleSaveLog = () => {
        try {
            const jsonString = JSON.stringify(devLog, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kanonar-sim-log-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to save log: ', err);
            alert('Не удалось сохранить лог.');
        }
    };
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[80vh]">
            {/* Narrative Log */}
            <div className="bg-canon-bg border border-canon-border rounded-lg font-mono text-xs text-canon-text-light overflow-y-auto">
                <div className="sticky top-0 bg-canon-bg-light p-2 border-b border-canon-border z-10">
                    <h4 className="font-bold text-canon-text">Нарративный лог</h4>
                </div>
                <div className="p-2">
                    {reversedNarrative.map((line, i) => (
                        <div 
                            key={i} 
                            className={`p-1 rounded cursor-pointer hover:bg-canon-border/50 ${selectedTick === line.tick && !line.text.startsWith('---') ? 'bg-canon-border' : ''}`}
                            onClick={() => !line.text.startsWith('---') && setSelectedTick(line.tick)}
                            title={line.tooltip}
                        >
                            <p className={`whitespace-pre-wrap ${line.text.startsWith('---') ? 'font-bold text-canon-accent my-2' : ''}`}>{line.text}</p>
                        </div>
                    ))}
                </div>
            </div>
            {/* Dev Log Details */}
            <div className="bg-canon-bg border border-canon-border rounded-lg overflow-y-auto">
                 <div className="sticky top-0 bg-canon-bg-light p-2 border-b border-canon-border z-10 flex justify-between items-center">
                    <h4 className="font-bold text-canon-text">Dev Log (Тик: {selectedTick ?? 'None'})</h4>
                    <div className="flex gap-2">
                        <button onClick={handleCopyLog} className="text-xs bg-canon-border px-2 py-1 rounded hover:bg-canon-accent hover:text-canon-bg">Копировать</button>
                        <button onClick={handleSaveLog} className="text-xs bg-canon-border px-2 py-1 rounded hover:bg-canon-accent hover:text-canon-bg">Сохранить</button>
                    </div>
                </div>
                <div className="p-2">
                    {selectedTick !== null ? (
                        tickDetails.length > 0 ? (
                            tickDetails.map((detail, i) => (
                                detail.category !== 'tick' &&
                                <div key={i} className="mb-4 border-b border-canon-border/50 pb-2 text-xs">
                                    <p className="font-bold text-canon-accent text-sm mb-1">{detail.category.toUpperCase()}</p>
                                    <pre className="whitespace-pre-wrap break-all">
                                        {JSON.stringify(detail.meta, null, 2)}
                                    </pre>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-canon-text-light p-4">Нет dev-деталей для этого тика.</p>
                        )
                    ) : (
                        <p className="text-xs text-canon-text-light p-4">Нажмите на строку в нарративном логе для просмотра деталей.</p>
                    )}
                </div>
            </div>
        </div>
    );
};