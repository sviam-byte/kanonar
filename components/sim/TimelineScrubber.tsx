
import React from "react";

interface Props {
  currentTick: number;
  maxTick: number;
  onChange: (tick: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
}

export const TimelineScrubber: React.FC<Props> = ({
  currentTick,
  maxTick,
  onChange,
  playing,
  onTogglePlay,
}) => {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-canon-border bg-canon-bg-light p-3 shadow-lg backdrop-blur-sm">
      <button
        type="button"
        className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-canon-accent ${
            playing 
            ? 'border-canon-accent bg-canon-accent text-canon-bg shadow-[0_0_10px_rgba(0,204,255,0.5)]' 
            : 'border-canon-border bg-canon-bg text-canon-text hover:border-canon-accent hover:text-canon-accent'
        }`}
        onClick={onTogglePlay}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
        ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      
      <button
        type="button"
        className="rounded-md border border-canon-border bg-canon-bg px-3 py-1.5 text-xs text-canon-text hover:bg-canon-border transition-colors hover:text-white"
        onClick={() => onChange(0)}
        title="Reset to start"
      >
        ⏮
      </button>

      <div className="flex-1 relative h-6 flex items-center group">
        <input
            type="range"
            min={0}
            max={maxTick}
            value={currentTick}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute w-full h-2 bg-canon-border rounded-lg appearance-none cursor-pointer accent-canon-accent z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        />
        {/* Custom Track */}
        <div className="absolute inset-x-0 h-1.5 bg-canon-bg rounded-full border border-canon-border/50 overflow-hidden">
             <div 
                className="h-full bg-canon-accent/50 transition-all duration-100" 
                style={{ width: `${(currentTick / Math.max(1, maxTick)) * 100}%` }}
            />
        </div>
        {/* Custom Thumb Indicator (Visible always) */}
        <div 
             className="absolute h-4 w-4 bg-canon-accent rounded-full shadow-md border-2 border-canon-bg pointer-events-none transition-all duration-100"
             style={{ left: `${(currentTick / Math.max(1, maxTick)) * 100}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      
      <div className="w-24 text-right text-sm font-mono text-canon-text-light">
        <span className="text-[10px] uppercase mr-2 tracking-wider opacity-70">Tick</span>
        <span className="text-canon-text font-bold">{currentTick}</span>
        <span className="text-canon-text-light/50 mx-1">/</span>
        <span>{maxTick}</span>
      </div>
    </div>
  );
};
