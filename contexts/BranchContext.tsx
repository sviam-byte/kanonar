
import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Branch } from '../types';

interface BranchContextType {
  branch: Branch;
  setBranch: (branch: Branch) => void;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const branchParam = searchParams.get('branch');
  const branch = (Object.values(Branch).includes(branchParam as Branch) 
    ? branchParam as Branch 
    : Branch.Current);

  const setBranch = (newBranch: Branch) => {
    setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('branch', newBranch);
        return next;
    }, { replace: true });
  };

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
