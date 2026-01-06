
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CharacterEntity } from '../types';
import { DyadConfigForA } from '../lib/tom/dyad-metrics';
import { useAccess } from './AccessContext';

interface SandboxState {
  characters: CharacterEntity[];
  dyadConfigs: Record<string, DyadConfigForA>; // Key: Observer Entity ID
}

interface SandboxContextValue extends SandboxState {
  addCharacter: (ch: CharacterEntity) => void;
  removeCharacter: (id: string) => void;
  setDyadConfigFor: (observerId: string, cfg: DyadConfigForA) => void;
  reset: () => void;
  
  // Admin features
  isAdmin: boolean;
  loginAdmin: (password: string) => boolean;
  logoutAdmin: () => void;
}

const SandboxContext = createContext<SandboxContextValue | null>(null);

const STORAGE_KEY = 'kanonar-sandbox-v1';
const ADMIN_KEY = 'kanonar-admin-mode';

export const SandboxProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SandboxState>({ characters: [], dyadConfigs: {} });
  const [isAdmin, setIsAdmin] = useState(false);
  const { activeModule } = useAccess();

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure structure validity
        setState({
            characters: Array.isArray(parsed.characters) ? parsed.characters : [],
            dyadConfigs: parsed.dyadConfigs || {}
        });
      }
      
      const adminSession = sessionStorage.getItem(ADMIN_KEY);
      if (adminSession === 'true') {
          setIsAdmin(true);
      }
    } catch (e) {
      console.error("Failed to load sandbox session:", e);
    }
  }, []);

  // Seed sandbox from the active access module (only when sandbox is empty).
  useEffect(() => {
    if (!activeModule) return;
    if (state.characters.length > 0) return;

    try {
      const seeded = activeModule.getCharacters();
      if (Array.isArray(seeded) && seeded.length > 0) {
        setState(prev => ({
          ...prev,
          characters: seeded,
        }));
      }
    } catch (e) {
      console.error('Failed to seed sandbox from access module:', e);
    }
    // Important: depend on state.characters.length to avoid overwriting manual additions.
  }, [activeModule, state.characters.length]);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addCharacter = (ch: CharacterEntity) => {
    setState(prev => {
      // Replace if exists, otherwise append
      const filtered = prev.characters.filter(x => x.entityId !== ch.entityId);
      return { ...prev, characters: [...filtered, ch] };
    });
  };

  const removeCharacter = (id: string) => {
    setState(prev => ({
      ...prev,
      characters: prev.characters.filter(x => x.entityId !== id),
    }));
  };

  const setDyadConfigFor = (observerId: string, cfg: DyadConfigForA) => {
    setState(prev => ({
      ...prev,
      dyadConfigs: { ...prev.dyadConfigs, [observerId]: cfg },
    }));
  };

  const reset = () => setState({ characters: [], dyadConfigs: {} });

  const loginAdmin = (password: string): boolean => {
      if (password === '180576') {
          setIsAdmin(true);
          sessionStorage.setItem(ADMIN_KEY, 'true');
          return true;
      }
      return false;
  };

  const logoutAdmin = () => {
      setIsAdmin(false);
      sessionStorage.removeItem(ADMIN_KEY);
  };

  const value: SandboxContextValue = {
    ...state,
    addCharacter,
    removeCharacter,
    setDyadConfigFor,
    reset,
    isAdmin,
    loginAdmin,
    logoutAdmin
  };

  return <SandboxContext.Provider value={value}>{children}</SandboxContext.Provider>;
};

export const useSandbox = (): SandboxContextValue => {
  const ctx = useContext(SandboxContext);
  if (!ctx) throw new Error('useSandbox must be used within SandboxProvider');
  return ctx;
};
