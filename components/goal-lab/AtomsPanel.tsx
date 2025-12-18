
import React from 'react';
import { ContextAtom } from '../../lib/context/v2/types';
import { AtomBrowser } from './AtomBrowser';

export const AtomsPanel: React.FC<{ atoms: ContextAtom[] }> = ({ atoms }) => {
  return (
    <AtomBrowser atoms={atoms} className="h-full min-h-0 flex flex-col" />
  );
};
