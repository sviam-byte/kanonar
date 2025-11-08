import React from 'react';
import { SMSBFlags } from '../types';

interface SMSBDisplayProps {
  flags: SMSBFlags;
}

const FlagItem: React.FC<{ label: string; value: React.ReactNode; tooltip?: string }> = ({ label, value, tooltip }) => (
  <div className="flex justify-between items-center text-xs py-1 border-b border-canon-border/30" title={tooltip}>
    <span className="text-canon-text-light">{label}:</span>
    <span className="font-mono font-bold text-canon-text">{value}</span>
  </div>
);

export const SMSBDisplay: React.FC<SMSBDisplayProps> = ({ flags }) => {
  return (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
      <h3 className="font-bold mb-3 text-canon-text">Свойства СМСБ</h3>
      <div className="space-y-1">
        {flags.attentionBudget !== undefined && <FlagItem label="Бюджет внимания" value={flags.attentionBudget.toLocaleString()} />}
        {flags.privacyCost !== undefined && <FlagItem label="Цена приватности (ε)" value={flags.privacyCost.toFixed(2)} />}
        {flags.modelQuorum !== undefined && <FlagItem label="Кворум моделей" value={String(flags.modelQuorum)} />}
        {flags.rollbackWindow !== undefined && <FlagItem label="Окно отката" value={flags.rollbackWindow} />}
        {flags.hysteresis !== undefined && <FlagItem label="Гистерезис" value={flags.hysteresis ? 'Вкл' : 'Выкл'} />}
        {flags.fairnessDebt !== undefined && <FlagItem label="Долг справедливости" value={flags.fairnessDebt ? 'Есть' : 'Нет'} />}
      </div>
    </div>
  );
};
