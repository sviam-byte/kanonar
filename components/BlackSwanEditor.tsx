import React, { useState } from 'react';
import { BlackSwanEvent } from '../types';
import { Slider } from './Slider';

interface BlackSwanEditorProps {
    onAddEvent: (event: BlackSwanEvent) => void;
}

export const BlackSwanEditor: React.FC<BlackSwanEditorProps> = ({ onAddEvent }) => {
    const [day, setDay] = useState<number>(30);
    const [label, setLabel] = useState<string>('Утечка данных');
    const [stress, setStress] = useState<number>(0.6);
    const [dark, setDark] = useState<number>(0.4);
    
    const handleAdd = () => {
        if (!label.trim()) {
            alert('Пожалуйста, введите название события.');
            return;
        }
        
        const newEvent: BlackSwanEvent = {
            id: `bs-${Date.now()}`,
            day: Number(day),
            label,
            channels: {
                stress: Number(stress),
                dark: Number(dark),
                vislag_days: 0, // Simplified for UI
                budget_overrun: 0,
                topo_break: 0,
            }
        };
        onAddEvent(newEvent);
    };

    return (
        <div className="bg-canon-bg border border-canon-border rounded-lg p-4 space-y-3">
            <h4 className="font-bold text-sm text-canon-text">Добавить "Чёрного лебедя"</h4>
            <div>
                 <label className="text-xs text-canon-text-light">Название</label>
                 <input 
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    className="w-full bg-canon-bg-light border border-canon-border text-xs rounded p-1 mt-1"
                 />
            </div>
            <div>
                 <label className="text-xs text-canon-text-light">День события</label>
                 <input 
                    type="number"
                    value={day}
                    onChange={e => setDay(Number(e.target.value))}
                    min={1}
                    className="w-full bg-canon-bg-light border border-canon-border text-xs rounded p-1 mt-1"
                 />
            </div>
            <Slider label="Шок стресса" value={stress} setValue={setStress} />
            <Slider label="Шок 'тьмы'" value={dark} setValue={setDark} />
            <button
                onClick={handleAdd}
                className="w-full text-sm bg-canon-bg-light border border-canon-border rounded px-3 py-1.5 hover:bg-canon-red hover:text-canon-bg transition-colors"
            >
                Добавить событие
            </button>
        </div>
    );
};