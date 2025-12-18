
import React from 'react';

interface SliderProps {
    label: string;
    value: number;
    setValue: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
}

export const Slider: React.FC<SliderProps> = (props) => (
    <div>
       <label className="text-xs text-canon-text-light">{props.label}: {(props.value ?? 0).toFixed(props.step && props.step < 1 ? 2 : 0)}</label>
       <input 
           type="range"
           min={props.min ?? 0} max={props.max ?? 1} step={props.step ?? 0.05}
           value={props.value ?? 0}
           onChange={e => props.setValue(Number(e.target.value))}
           className="w-full h-2 bg-canon-border rounded-lg appearance-none cursor-pointer"
       />
    </div>
);
