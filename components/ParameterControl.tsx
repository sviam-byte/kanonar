
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface ParameterControlProps {
  name: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  canonValue: number;
  defaultValue: number;
  onValueChange: (value: number) => void;
  isReadOnly?: boolean;
  fullKey: string;
  isLocked: boolean;
  onToggleLock: (key: string) => void;
}

const PortalTooltip: React.FC<{ content: React.ReactNode; targetRect: DOMRect | null }> = ({ content, targetRect }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useLayoutEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const { width, height } = tooltip.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;

    const GAP = 8;
    // Default: Top center
    let top = targetRect.top - height - GAP;
    let left = targetRect.left + targetRect.width / 2 - width / 2;

    // Flip to bottom if not enough space on top
    if (top < 10) {
      top = targetRect.bottom + GAP;
    }

    // Clamp horizontal position
    if (left < 10) {
      left = 10;
    } else if (left + width > innerWidth - 10) {
      left = innerWidth - width - 10;
    }

    setStyle({
      position: 'fixed',
      top,
      left,
      zIndex: 9999,
      opacity: 1,
      transition: 'opacity 0.15s ease-in-out',
      pointerEvents: 'none',
    });
  }, [targetRect]);

  if (!targetRect) return null;

  return createPortal(
    <div 
      ref={tooltipRef} 
      style={style} 
      className="w-64 bg-canon-bg-light p-3 rounded text-xs text-left border border-canon-accent/30 shadow-[0_4px_20px_rgba(0,0,0,0.8)] text-canon-text whitespace-normal break-words relative"
    >
      {content}
    </div>,
    document.body
  );
};

export const ParameterControl: React.FC<ParameterControlProps> = ({ 
  name, description, value, min, max, step, canonValue, defaultValue, onValueChange, isReadOnly = false,
  fullKey, isLocked, onToggleLock
}) => {
  const [inputValue, setInputValue] = useState(String(value));
  const [isHovered, setIsHovered] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Only update from external if not focused
    if (document.activeElement?.id !== `input-${fullKey}`) {
        setInputValue(String(value));
    }
  }, [value, fullKey]);

  const handleMouseEnter = () => {
    if (iconRef.current) {
      setTooltipRect(iconRef.current.getBoundingClientRect());
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTooltipRect(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };
  
  const handleInputBlur = () => {
    let numValue = parseFloat(inputValue);
    if (isNaN(numValue)) {
      numValue = defaultValue;
    }
    numValue = Math.max(min, Math.min(max, numValue));
    onValueChange(numValue);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(Number(e.target.value));
  }
  
  const LockIcon: React.FC<{locked: boolean}> = ({locked}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={locked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {locked ? (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
        </>
      )}
    </svg>
  );

  return (
    <div className={`mb-3 group transition-colors duration-200 relative ${isReadOnly ? 'opacity-60' : ''} ${isLocked ? 'bg-canon-blue/10 p-2 -m-2 rounded-md' : ''}`}>
      <div className="flex items-center mb-1">
        <label className="text-xs text-canon-text-light truncate max-w-[85%]" title={name}>
          {name}
        </label>
        <div 
          className="relative ml-1.5"
          ref={iconRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <span className="cursor-help text-canon-text-light text-[10px] border border-canon-text-light rounded-full w-4 h-4 flex items-center justify-center font-mono hover:text-canon-accent hover:border-canon-accent transition-colors">?</span>
        </div>
      </div>

      {isHovered && (
        <PortalTooltip 
          targetRect={tooltipRect}
          content={
            <>
              <p className="font-bold text-canon-accent mb-1 text-sm">{name}</p>
              <p className="text-canon-text-light mb-2 leading-relaxed">{description}</p>
              <div className="border-t border-canon-border/30 pt-2 mt-2 space-y-1 font-mono text-canon-text-light/70 text-[10px]">
                  <p><span className="text-canon-text-light">Key:</span> {fullKey}</p>
                  <p><span className="text-canon-text-light">Range:</span> [{min}, {max}]</p>
                  <p><span className="text-canon-text-light">Canon:</span> {canonValue}</p>
              </div>
            </>
          }
        />
      )}

      <div className="grid grid-cols-12 gap-2 items-center">
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleSliderChange}
            disabled={isReadOnly}
            className="col-span-6 h-1 bg-canon-border rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed accent-canon-accent"
        />
        <input 
          id={`input-${fullKey}`}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          readOnly={isReadOnly}
          className="col-span-2 w-full bg-canon-bg border border-canon-border text-center rounded text-xs py-0.5 disabled:cursor-not-allowed focus:border-canon-accent focus:outline-none"
        />
        <div className="col-span-4 flex space-x-1 justify-end">
            <button 
              onClick={() => onValueChange(canonValue)}
              title={`Reset to Canon (${canonValue})`}
              disabled={isReadOnly}
              className="w-5 h-5 text-[10px] bg-canon-border rounded text-canon-text-light hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              C
            </button>
             <button 
              onClick={() => onValueChange(defaultValue)}
              title={`Reset to Default (${defaultValue})`}
              disabled={isReadOnly}
              className="w-5 h-5 text-[10px] bg-canon-border rounded text-canon-text-light hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              D
            </button>
             <button 
              onClick={() => onToggleLock(fullKey)}
              title={isLocked ? 'Разблокировать параметр' : 'Заблокировать параметр'}
              disabled={isReadOnly}
              className={`w-5 h-5 flex items-center justify-center text-[10px] bg-canon-border rounded text-canon-text-light hover:bg-canon-accent hover:text-canon-bg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isLocked ? 'text-canon-accent' : ''}`}
            >
              <LockIcon locked={isLocked} />
            </button>
        </div>
      </div>
    </div>
  );
};
