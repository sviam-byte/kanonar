
import React, { useState } from 'react';

interface TabsProps {
  tabs: { label: string; content: React.ReactNode }[];
}

export const Tabs: React.FC<TabsProps> = ({ tabs }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      <div className="border-b border-canon-border mb-4">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            onClick={() => setActiveIndex(index)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeIndex === index
                ? 'border-b-2 border-canon-accent text-canon-accent'
                : 'text-canon-text-light hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{tabs[activeIndex]?.content}</div>
    </div>
  );
};
