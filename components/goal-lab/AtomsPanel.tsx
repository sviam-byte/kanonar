
import React from 'react';
import type { ContextAtom } from '../../lib/goal-lab/types';
import { AtomBrowser } from './AtomBrowser';

export const AtomsPanel: React.FC<{ atoms: ContextAtom[] }> = ({ atoms }) => {
  return (
    <AtomBrowser atoms={atoms} className="h-full min-h-0 flex flex-col" />
  );
};
