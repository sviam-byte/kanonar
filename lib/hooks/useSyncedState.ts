
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A hook that mimics useState but persists the value in the URL Search Params.
 * 
 * @param key The query parameter key (e.g., 'tab', 'agentId')
 * @param defaultValue The default value if the param is missing
 * @param serialize Optional function to convert state to string
 * @param deserialize Optional function to convert string to state
 */
export function useSyncedState<T>(
  key: string,
  defaultValue: T,
  serialize: (val: T) => string = String,
  deserialize: (val: string) => T = (val) => val as unknown as T
): [T, (val: T | ((prev: T) => T)) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramValue = searchParams.get(key);

  // Initialize state from URL or default
  const [localState, setLocalState] = useState<T>(() => {
    if (paramValue !== null) {
      try {
        return deserialize(paramValue);
      } catch (e) {
        console.error(`Failed to deserialize URL param '${key}':`, e);
      }
    }
    return defaultValue;
  });

  // Update URL when local state changes, but debounce slightly to avoid history thrashing
  const setValue = useCallback((valueOrFn: T | ((prev: T) => T)) => {
    setLocalState((prev) => {
      const newValue = valueOrFn instanceof Function ? valueOrFn(prev) : valueOrFn;
      
      setSearchParams((prevParams) => {
        const newParams = new URLSearchParams(prevParams);
        const serialized = serialize(newValue);
        
        // Only update if changed
        if (newParams.get(key) !== serialized) {
            if (serialized === serialize(defaultValue) && serialized === '') {
                // Clean up empty defaults
                newParams.delete(key);
            } else {
                newParams.set(key, serialized);
            }
        }
        return newParams;
      }, { replace: true }); // Use replace to prevent massive history stack

      return newValue;
    });
  }, [key, serialize, defaultValue, setSearchParams]);

  // Sync from URL changes (e.g. back button)
  useEffect(() => {
    const currentVal = searchParams.get(key);
    if (currentVal !== null) {
        const parsed = deserialize(currentVal);
        // Deep comparison check could be added here if needed
        if (JSON.stringify(parsed) !== JSON.stringify(localState)) {
             setLocalState(parsed);
        }
    }
  }, [searchParams, key, deserialize]);

  return [localState, setValue];
}

// Helper for Sets
export function useSyncedSet(key: string, defaultSet: Set<string> = new Set()) {
    return useSyncedState<Set<string>>(
        key,
        defaultSet,
        (set) => Array.from(set).join(','),
        (str) => new Set(str ? str.split(',') : [])
    );
}

// Helper for Numbers
export function useSyncedNumber(key: string, defaultNum: number) {
    return useSyncedState<number>(
        key,
        defaultNum,
        String,
        Number
    );
}

// Helper for JSON objects (use carefully for length)
export function useSyncedJson<T>(key: string, defaultVal: T) {
    return useSyncedState<T>(
        key,
        defaultVal,
        (val) => JSON.stringify(val),
        (str) => JSON.parse(str)
    );
}
