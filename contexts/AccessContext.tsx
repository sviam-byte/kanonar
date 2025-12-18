
import React, { createContext, useContext, ReactNode, useMemo, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AccessModule, ACCESS_MODULES } from '../data/access-modules';

interface AccessContextType {
  activeModule: AccessModule | null; // null means default mode (everything visible)
  setActiveModule: (module: AccessModule | null) => void;
  clearanceLevel: number; // 0-5
  setClearanceLevel: (level: number) => void;
  isRestricted: boolean;
}

const AccessContext = createContext<AccessContextType | undefined>(undefined);
const MODULE_KEY = 'kanonar_active_module';
const CLEARANCE_KEY = 'kanonar_clearance_level';

export const AccessProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 1. Resolve ID from URL or Storage
  const urlModuleId = searchParams.get('module');
  
  // Initialize module state. Prefer URL if present, otherwise fallback to storage.
  const [currentModuleId, setCurrentModuleId] = useState<string | null>(() => {
      return urlModuleId || sessionStorage.getItem(MODULE_KEY) || null;
  });

  // Initialize clearance state
  const [clearanceLevel, setClearanceLevel] = useState<number>(() => {
      const stored = sessionStorage.getItem(CLEARANCE_KEY);
      return stored ? parseInt(stored, 10) : 0;
  });

  // Persist clearance
  useEffect(() => {
      sessionStorage.setItem(CLEARANCE_KEY, clearanceLevel.toString());
  }, [clearanceLevel]);

  // 2. Sync: URL -> State
  useEffect(() => {
      if (urlModuleId && urlModuleId !== currentModuleId) {
          setCurrentModuleId(urlModuleId);
          sessionStorage.setItem(MODULE_KEY, urlModuleId);
      }
  }, [urlModuleId, currentModuleId]);

  // 3. Sync: State -> URL
  useEffect(() => {
      if (currentModuleId) {
          if (searchParams.get('module') !== currentModuleId) {
               setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  next.set('module', currentModuleId);
                  return next;
              }, { replace: true });
          }
      } else {
          // If state says null, ensure URL is clean
          if (searchParams.has('module')) {
               setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  next.delete('module');
                  return next;
              }, { replace: true });
          }
      }
  }, [currentModuleId, searchParams, setSearchParams]);

  const activeModule = useMemo(() => {
      if (!currentModuleId) return null;
      return ACCESS_MODULES.find(m => m.id === currentModuleId) || null;
  }, [currentModuleId]);

  const setActiveModule = (module: AccessModule | null) => {
      const newId = module && module.id !== 'default' ? module.id : null;
      setCurrentModuleId(newId);
      if (newId) {
          sessionStorage.setItem(MODULE_KEY, newId);
      } else {
          sessionStorage.removeItem(MODULE_KEY);
      }
  };

  return (
    <AccessContext.Provider value={{ 
        activeModule, 
        setActiveModule,
        clearanceLevel,
        setClearanceLevel,
        isRestricted: activeModule !== null 
    }}>
      {children}
    </AccessContext.Provider>
  );
};

export const useAccess = (): AccessContextType => {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error('useAccess must be used within an AccessProvider');
  }
  return context;
};