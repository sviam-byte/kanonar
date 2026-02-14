import { useEffect, useState } from 'react';

/**
 * Debounce a value for UI responsiveness.
 * If delayMs <= 0, returns the value immediately (no debounce).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const h = window.setTimeout(() => setDebounced(value), Math.max(0, Math.floor(delayMs)));
    return () => window.clearTimeout(h);
  }, [value, delayMs]);

  return debounced;
}
