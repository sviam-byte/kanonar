import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DilemmaLabPanel } from '../components/conflict/DilemmaLabPanel';
import { MafiaLabPanel } from '../components/conflict/MafiaLabPanel';

type ConflictTab = 'dilemma' | 'mafia';

const TABS: { id: ConflictTab; label: string }[] = [
  { id: 'dilemma', label: 'Dilemma' },
  { id: 'mafia', label: 'Mafia' },
];

function normalizeTab(value: string | null): ConflictTab {
  return value === 'mafia' ? 'mafia' : 'dilemma';
}

export const ConflictLabPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeTab(searchParams.get('tab'));

  const content = useMemo(() => {
    return activeTab === 'mafia' ? <MafiaLabPanel /> : <DilemmaLabPanel />;
  }, [activeTab]);

  const setTab = (tab: ConflictTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  return (
    <div className="min-h-screen bg-canon-bg">
      <div className="border-b border-canon-border bg-canon-panel/70 px-6 pt-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4">
          <div className="pb-4">
            <h1 className="text-xl font-bold text-canon-text">Conflict Lab</h1>
            <p className="mt-1 text-xs text-canon-muted">
              Dilemma engine и Mafia scenario pack в одной лаборатории конфликтных решений.
            </p>
          </div>
          <div className="flex overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-b-2 border-canon-accent text-canon-accent'
                    : 'text-canon-text-light hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {content}
    </div>
  );
};

export default ConflictLabPage;
