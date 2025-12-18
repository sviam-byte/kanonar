
import React from 'react';
import { AffectState } from '../../types';

export const SpecificEmotionBar: React.FC<{ label: string, value: number, colorClass: string }> = ({ label, value, colorClass }) => (
    <div className="flex items-center gap-2 text-xs">
        <span className="w-10 font-bold text-canon-text-light">{label}</span>
        <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
            <div className={`h-full ${colorClass}`} style={{ width: `${value * 100}%` }}></div>
        </div>
        <span className="font-mono w-8 text-right text-canon-text">{value.toFixed(2)}</span>
    </div>
);

export const AffectGrid: React.FC<{ affect: AffectState }> = ({ affect }) => {
    const x = affect.valence; // -1 to 1
    const y = affect.arousal; // 0 to 1
    
    const xPct = (x + 1) * 50; 
    const yPct = (1 - y) * 100; // Invert Y because CSS top is 0

    return (
        <div className="relative w-full h-32 bg-black border border-canon-border/30 rounded overflow-hidden">
            {/* Quadrant Lines */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-canon-border/30"></div>
            <div className="absolute left-0 right-0 top-1/2 h-px bg-canon-border/30"></div>
            
            {/* Labels */}
            <div className="absolute top-1 right-1 text-[8px] text-green-400/50">Excited</div>
            <div className="absolute top-1 left-1 text-[8px] text-red-400/50">Stressed</div>
            <div className="absolute bottom-1 right-1 text-[8px] text-blue-400/50">Relaxed</div>
            <div className="absolute bottom-1 left-1 text-[8px] text-gray-500/50">Depressed</div>

            {/* Dot */}
            <div 
                className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] border border-black transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                style={{ left: `${xPct}%`, top: `${yPct}%` }}
            />
            
            {/* Values */}
            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-[9px] font-mono text-white/70 bg-black/50 px-1 rounded">
                V:{x.toFixed(2)} A:{y.toFixed(2)}
            </div>
        </div>
    );
};
