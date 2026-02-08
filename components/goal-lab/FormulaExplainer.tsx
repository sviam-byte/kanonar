import React, { useMemo, useState } from 'react';

export type FormulaExplainerProps = {
  formula: string;
  weight?: number;
  agentValue?: number;
  weightLabel?: string;
  valueLabel?: string;
};

function fmt(n: number | undefined, digits = 2): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

export const FormulaExplainer: React.FC<FormulaExplainerProps> = ({
  formula,
  weight,
  agentValue,
  weightLabel = 'Вес',
  valueLabel = 'Значение',
}) => {
  const [open, setOpen] = useState(false);
  const computed = useMemo(() => {
    if (typeof weight !== 'number' || typeof agentValue !== 'number') return undefined;
    return weight * agentValue;
  }, [weight, agentValue]);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="font-mono text-[10px] text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
        onClick={() => setOpen(v => !v)}
        title="Показать расшифровку формулы"
      >
        {formula} <span className="text-[11px]">?</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-50 w-80 rounded-lg border border-cyan-500/30 bg-[#0b1220] shadow-xl p-4">
            <div className="text-xs text-canon-text space-y-3">
              <div className="font-bold text-cyan-200">Как работает формула</div>

              <div className="rounded bg-black/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-canon-text-light/70">{weightLabel}:</span>
                  <span className="font-mono text-green-300">{fmt(weight, 2)}</span>
                </div>
                <div className="flex items-center justify-center text-canon-text-light/60">×</div>
                <div className="flex items-center justify-between">
                  <span className="text-canon-text-light/70">{valueLabel}:</span>
                  <span className="font-mono text-blue-300">{fmt(agentValue, 2)}</span>
                </div>
                <div className="border-t border-white/10 my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-canon-text font-semibold">Итого:</span>
                  <span className="font-mono font-bold text-amber-200">{fmt(computed, 2)}</span>
                </div>
              </div>

              <div className="text-[10px] text-canon-text-light/60 italic">
                Чем больше итоговое число, тем сильнее влияние фактора на цель.
              </div>
            </div>
          </div>
        </>
      )}
    </span>
  );
};
