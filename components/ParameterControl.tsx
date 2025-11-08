import React, { useState, useEffect } from 'react';
import { Parameter } from '../types';

interface ParameterControlProps {
  parameter: Parameter;
  value: number;
  onValueChange: (value: number) => void;
}

export const ParameterControl: React.FC<ParameterControlProps> = ({ parameter, value, onValueChange }) => {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };
  
  const handleInputBlur = () => {
    let numValue = parseFloat(inputValue);
    if (isNaN(numValue)) {
      numValue = parameter.defaultValue;
    }
    numValue = Math.max(parameter.min, Math.min(parameter.max, numValue));
    onValueChange(numValue);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(Number(e.target.value));
  }

  return (
    <div className="mb-3 group">
      <label className="text-xs text-canon-text-light truncate mb-1 block" title={parameter.name}>
        {parameter.name}
      </label>
      <div className="grid grid-cols-12 gap-2 items-center">
        <input
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={value}
          onChange={handleSliderChange}
          className="col-span-7 h-1 bg-canon-border rounded-lg appearance-none cursor-pointer"
        />
        <input 
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleInputBlur()}
          className="col-span-3 w-full bg-canon-bg border border-canon-border text-center rounded text-xs py-0.5"
        />
        <div className="col-span-2 flex space-x-1">
            <button 
              onClick={() => onValueChange(parameter.canonValue)}
              title={`Reset to Canon (${parameter.canonValue})`}
              className="w-5 h-5 text-xs bg-canon-border rounded text-canon-text-light hover:bg-canon-accent hover:text-canon-bg transition-colors"
            >
              C
            </button>
             <button 
              onClick={() => onValueChange(parameter.defaultValue)}
              title={`Reset to Default (${parameter.defaultValue})`}
              className="w-5 h-5 text-xs bg-canon-border rounded text-canon-text-light hover:bg-canon-accent hover:text-canon-bg transition-colors"
            >
              D
            </button>
        </div>
      </div>
    </div>
  );
};