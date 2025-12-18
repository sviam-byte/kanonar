

import React, { useState, useCallback } from 'react';
import { CharacterEntity, TraumaEvent, TraumaKind, PersonalEvent } from '../types';
import { Slider } from './Slider';

interface TraumaSimulatorProps {
    character: CharacterEntity;
    onApplyTrauma: (event: any) => void; // Changed to accept raw event object or TraumaEvent
}

const traumaLabels: Record<TraumaKind, string> = {
    betrayal_by_leader: "Предательство лидера",
    betrayal_by_peer: "Предательство равного",
    mass_casualties: "Массовые потери",
    failed_rescue: "Неудачное спасение",
    random_catastrophe: "Случайная катастрофа",
    torture: "Пытки / Насилие",
    moral_compromise: "Моральный компромисс",
    violence: "Насилие (жертва)",
    accident: "Несчастный случай",
    captivity: "Плен / Неволя",
    sleep_disorder: "Расстройство сна",
    power_grab: "Захват власти"
};

export const TraumaSimulator: React.FC<TraumaSimulatorProps> = ({ character, onApplyTrauma }) => {
    const [kind, setKind] = useState<TraumaKind>('betrayal_by_leader');
    const [severity, setSeverity] = useState(0.7);

    const handleApply = useCallback(() => {
        // Construct a full PersonalEvent structure to ensure it hits all engines
        // The parent component (EntityDetailPage) expects an object that it can wrap into a PersonalEvent
        // or use to construct one. 
        
        // We define the domain based on the kind to ensure correct mapping in bio-engine
        let domain = 'trauma';
        const tags = ['trauma'];
        
        if (kind.includes('betrayal')) {
            domain = 'betrayal_experienced';
            tags.push('betrayal');
        } else if (kind === 'torture' || kind === 'violence') {
            domain = 'torture';
            tags.push('violence', 'pain');
        } else if (kind === 'mass_casualties' || kind === 'failed_rescue') {
            domain = 'failure';
            tags.push('loss', 'guilt');
        } else if (kind === 'moral_compromise') {
            domain = 'moral_injury';
            tags.push('shame');
        } else if (kind === 'captivity') {
            domain = 'captivity';
            tags.push('loss_of_agency');
        } else if (kind === 'sleep_disorder') {
            domain = 'stress';
            tags.push('exhaustion');
        } else if (kind === 'power_grab') {
            domain = 'power_grab';
            tags.push('conflict', 'betrayal');
        } else {
            domain = 'crisis';
            tags.push('chaos');
        }
        
        tags.push(kind); // Add specific kind as tag

        const eventPayload = {
            kind,
            severity,
            domain,
            tags
        };
        
        onApplyTrauma(eventPayload);
    }, [kind, severity, onApplyTrauma]);

    return (
        <div>
            <h4 className="font-bold text-sm text-canon-text-light mb-2 capitalize">
                Симулятор травмы
            </h4>
            <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-3 space-y-3">
                <div>
                    <label className="text-xs text-canon-text-light">Тип травмы</label>
                    <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as TraumaKind)}
                        className="w-full bg-canon-bg-light border border-canon-border text-xs rounded p-1 mt-1"
                    >
                        {Object.entries(traumaLabels).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                </div>

                <Slider
                    label="Тяжесть"
                    value={severity}
                    setValue={setSeverity}
                    min={0}
                    max={1}
                    step={0.05}
                />

                <button
                    onClick={handleApply}
                    className="w-full text-sm bg-canon-bg-light border border-canon-border rounded px-3 py-1.5 hover:bg-canon-red hover:text-canon-bg transition-colors"
                >
                    Применить травму
                </button>
            </div>
        </div>
    );
};