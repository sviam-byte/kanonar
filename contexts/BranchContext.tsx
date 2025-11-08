
import React, { createContext, useState, useContext, ReactNode } from 'react';
import { Branch } from '../types';

interface BranchContextType {
  branch: Branch;
  setBranch: (branch: Branch) => void;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [branch, setBranch] = useState<Branch>(Branch.Current);

  return (
    <BranchContext.Provider value={{ branch, setBranch }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = (): BranchContextType => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};
