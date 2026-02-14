import { useCallback, useEffect, useRef, useState } from 'react';

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
    const h = globalThis.setTimeout(() => setDebounced(value), Math.max(0, Math.floor(delayMs)));
    return () => globalThis.clearTimeout(h);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Debounce a value but expose `flush()` to commit the latest value immediately.
 * This is useful when a control updates rapidly (drag), but should settle instantly
 * when the interaction ends (pointer/touch release).
 */
export function useDebouncedValueWithFlush<T>(value: T, delayMs: number): [T, () => void] {
  const [debounced, setDebounced] = useState<T>(value);
  const latestRef = useRef<T>(value);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  latestRef.current = value;

  const flush = useCallback(() => {
    if (timerRef.current != null) {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDebounced(latestRef.current);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      flush();
      return;
    }
    if (timerRef.current != null) {
      globalThis.clearTimeout(timerRef.current);
    }
    timerRef.current = globalThis.setTimeout(() => {
      timerRef.current = null;
      setDebounced(latestRef.current);
    }, Math.max(0, Math.floor(delayMs)));
    return () => {
      if (timerRef.current != null) {
        globalThis.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delayMs, flush]);

  return [debounced, flush];
}
