
import React from 'react';
import { EntitySecurity } from '../types';
import { useAccess } from '../contexts/AccessContext';

interface Props {
    security?: EntitySecurity;
    children: React.ReactNode;
    fallback?: React.ReactNode; // What to show if blocked (only for Level checks)
}

export const EntitySecurityGate: React.FC<Props> = ({ security, children, fallback }) => {
    const { clearanceLevel, activeModule } = useAccess();

    if (!security) return <>{children}</>;

    // 1. Key Check (Strict Visibility)
    // If requiredKey is present, the entity is HIDDEN (returns null) unless the key is active.
    // It does NOT show the fallback/redacted block. It simply doesn't exist for the user.
    if (security.requiredKey) {
        if (!activeModule) return null;
        
        const key = security.requiredKey;
        const hasKey = activeModule.id === key || activeModule.codes.includes(key);
        
        if (!hasKey) return null;
    }

    // 2. Level Check (Redaction)
    // If requiredLevel is present, the entity is REDACTED (fallback shown) if clearance is low.
    // This allows the user to see *that* something exists, but not *what* it is.
    if (security.requiredLevel !== undefined) {
        if (clearanceLevel < security.requiredLevel) {
            return <>{fallback}</>;
        }
    }

    // All checks passed
    return <>{children}</>;
};

export const RedactedBlock: React.FC<{ level: number, label?: string }> = ({ level, label }) => (
    <div className="w-full h-full flex items-center justify-center bg-black/50 border border-canon-border/30 p-4 rounded relative overflow-hidden group cursor-not-allowed select-none">
        {/* Static Noise Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M5 0h1L0 6V5zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")' }}></div>
        
        <div className="text-center z-10">
            <div className="text-2xl font-black text-canon-text/20 mb-1 select-none blur-[1px] animate-pulse">
                CLASSIFIED
            </div>
            <div className="text-[10px] font-mono text-red-500 font-bold uppercase tracking-widest border border-red-500/50 px-2 py-1 rounded bg-red-900/10 inline-block">
                LEVEL {level} REQUIRED
            </div>
            {label && (
                 <div className="mt-2 text-[10px] text-canon-text-light font-mono opacity-30">
                    ID: {label.substring(0, 4)}...████
                </div>
            )}
        </div>
    </div>
);
