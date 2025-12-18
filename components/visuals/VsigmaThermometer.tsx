import React from 'react';

interface VsigmaThermometerProps {
    vsigma: number;
}

const BLACKSTART_THRESHOLD = 85;

export const VsigmaThermometer: React.FC<VsigmaThermometerProps> = ({ vsigma }) => {
    const fillHeight = Math.min(100, Math.max(0, vsigma));
    
    let fillColor = '#00aaff'; // canon-accent
    if (vsigma > 50) fillColor = '#f59e0b'; // yellow-500
    if (vsigma > 75) fillColor = '#ff4444'; // canon-red

    return (
        <div className="w-16 h-24 flex flex-col items-center" title={`Vσ: ${vsigma.toFixed(1)}`}>
            <div className="w-6 h-full bg-canon-bg border-2 border-canon-border rounded-full flex flex-col-reverse relative">
                <div 
                    className="w-full rounded-b-full transition-all duration-300" 
                    style={{ height: `${fillHeight}%`, backgroundColor: fillColor }}
                />
                {/* Blackstart threshold line */}
                <div 
                    className="absolute w-full h-0.5 bg-canon-red left-0" 
                    style={{ bottom: `${BLACKSTART_THRESHOLD}%`}}
                >
                   <div className="absolute -right-1 bottom-0 transform translate-x-full -translate-y-1/2 text-canon-red text-[8px] font-mono">Vσ*</div>
                </div>
            </div>
            <div className="w-8 h-4 bg-canon-border rounded-b-md -mt-1" />
        </div>
    );
};
