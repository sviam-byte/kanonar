
import React from 'react';
import { latentSchema } from '../data/latent-schema';

interface LatentOverviewProps {
  latents: Record<string, number>;
}

export const LatentOverview: React.FC<LatentOverviewProps> = ({ latents }) => {
  return (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-3">
      <h3 className="text-xl font-bold text-canon-accent mb-2">Латентные переменные</h3>
      <p className="text-sm text-canon-text-light mb-4">
        Эти показатели вычисляются из Векторного Базиса (Vector Base) и используются для расчёта Vσ, S*, ToM,
        устойчивости и хвостовых рисков. Они не редактируются напрямую, а зависят от фундаментальных параметров личности.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(latentSchema).map(([key, schema]) => (
          <div key={key} className="p-3 border border-canon-border/60 rounded-md bg-canon-bg">
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-mono text-sm text-canon-accent">{key}</span>
              <span className="font-semibold text-canon-text">
                {Math.round((latents[key] ?? 0.5) * 100)}%
              </span>
            </div>
            <div className="text-sm font-semibold text-canon-text mb-1">
              {schema.name}
            </div>
            <div className="text-xs text-canon-text-light">
              {schema.description}
            </div>
            <div className="mt-2 w-full bg-canon-bg-light h-1.5 rounded-full overflow-hidden border border-canon-border/30">
                <div 
                    className="h-full bg-canon-blue transition-all duration-500" 
                    style={{ width: `${(latents[key] ?? 0.5) * 100}%` }}
                />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
