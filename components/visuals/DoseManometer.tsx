import React from 'react';

interface DoseManometerProps {
    dose: number;
}

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

export const DoseManometer: React.FC<DoseManometerProps> = ({ dose }) => {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const progress = clamp(dose, 0, 2); // Cap progress at 200% for visualization
    const offset = circumference - (progress / 2) * circumference;

    // Determine color based on dose
    let colorClass = 'text-canon-blue';
    if (dose < 0.8 || dose > 1.2) {
        colorClass = 'text-yellow-500'; // Warning zone
    }
    if (dose < 0.5 || dose > 1.5) {
        colorClass = 'text-canon-red'; // Critical zone
    }

    return (
        <div className="relative w-24 h-24 flex items-center justify-center" title={`Dose: ${dose.toFixed(3)}`}>
            <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle
                    cx="50" cy="50" r={radius}
                    className="text-canon-border"
                    strokeWidth="8"
                    fill="transparent"
                />
                <circle
                    cx="50" cy="50" r={radius}
                    className={`transform -rotate-90 origin-center transition-all duration-300 ${colorClass}`}
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    fill="transparent"
                />
            </svg>
            <div className="absolute text-center">
                <div className={`font-mono text-2xl font-bold ${colorClass}`}>
                    {dose.toFixed(2)}
                </div>
                <div className="text-xs text-canon-text-light -mt-1">Dose</div>
            </div>
        </div>
    );
};
