import React, { useMemo, useState } from 'react';

export type FormulaExplainerParts = {
  weight: number;
  value: number;
  weightLabel?: string;
  valueLabel?: string;
};

export type FormulaExplainerProps = {
  formula?: string;
  parts?: FormulaExplainerParts;
};

function fmt(n: number, digits = 2): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

export const FormulaExplainer: React.FC<FormulaExplainerProps> = ({ formula, parts }) => {
  const [open, setOpen] = useState(false);
  const computed = useMemo(() => {
    if (!parts) return undefined;
    return parts.weight * parts.value;
  }, [parts]);

  const text = formula || (parts ? `${fmt(parts.weight)} × ${fmt(parts.value)}` : undefined);
  if (!text) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="font-mono text-[9px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        title="Кликни, чтобы расшифровать формулу"
      >
        {text} <span className="text-[10px]">?</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="close"
          />
          <span className="absolute left-0 top-full mt-1 z-50 w-80 bg-gray-900 border border-cyan-500/40 rounded-lg shadow-xl p-4">
            <div className="text-xs text-white space-y-3">
              <div className="font-bold text-cyan-300">Как работает формула</div>

              {parts ? (
                <div className="bg-black/40 rounded p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">{parts.weightLabel || 'Вес (из характера/приоритета)'}</span>
                    <span className="font-mono text-green-400">{fmt(parts.weight)}</span>
                  </div>

                  <div className="flex items-center justify-center text-white/50">×</div>

                  <div className="flex items-center justify-between">
                    <span className="text-white/70">{parts.valueLabel || 'Текущее значение фактора'}</span>
                    <span className="font-mono text-blue-400">{fmt(parts.value)}</span>
                  </div>

                  <div className="border-t border-white/20 my-2" />

                  <div className="flex items-center justify-between">
                    <span className="text-white font-semibold">Итого вклад</span>
                    <span className="font-mono text-amber-400 font-bold">{computed != null ? fmt(computed) : '—'}</span>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-white/70">
                  Нет данных для расшифровки (parts не переданы).
                </div>
              )}

              <div className="text-[10px] text-white/50 italic">
                Чем больше вклад, тем сильнее фактор сдвигает приоритет цели.
              </div>
            </div>
          </span>
        </>
      ) : null}
    </span>
  );
};
