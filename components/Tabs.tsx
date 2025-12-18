
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

interface TabsProps {
  tabs: { label: string; content: React.ReactNode }[];
  syncKey?: string; // Optional URL param key to sync active tab index
  className?: string;
  contentClassName?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, syncKey, className = "h-full flex flex-col", contentClassName = "flex-1 min-h-0 relative" }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL if syncKey is provided
  useEffect(() => {
    if (syncKey) {
      const val = searchParams.get(syncKey);
      if (val) {
        const idx = parseInt(val, 10);
        if (!isNaN(idx) && idx >= 0 && idx < tabs.length) {
          setActiveIndex(idx);
        }
      }
    }
  }, [syncKey, searchParams, tabs.length]);

  const handleTabClick = (index: number) => {
    setActiveIndex(index);
    if (syncKey) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set(syncKey, String(index));
        return next;
      }, { replace: true });
    }
  };

  return (
    <div className={className}>
      <div className="border-b border-canon-border flex-shrink-0 flex overflow-x-auto custom-scrollbar no-scrollbar">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            onClick={() => handleTabClick(index)}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeIndex === index
                ? 'border-b-2 border-canon-accent text-canon-accent'
                : 'text-canon-text-light hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={contentClassName}>
          {tabs[activeIndex]?.content}
      </div>
    </div>
  );
};
