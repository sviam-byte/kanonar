import { useState, useRef, useCallback, useEffect } from 'react';

interface SimulationRunnerParams<TState, TPayload> {
  payload: TPayload;
  initialStateFn: (payload: TPayload) => TState;
  stepFn: (currentState: TState, payload: TPayload, day: number) => TState;
  simulationSpeed: number;
  totalDays: number;
  historyAdapter?: (state: TState) => any;
}

export function useSimulationRunner<TState, TPayload>({
  payload,
  initialStateFn,
  stepFn,
  simulationSpeed,
  totalDays,
  historyAdapter = (s) => s,
}: SimulationRunnerParams<TState, TPayload>) {
  const [day, setDay] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  
  const getInitialState = useCallback(() => initialStateFn(payload), [initialStateFn, payload]);

  const [state, setState] = useState<TState>(getInitialState);
  const [history, setHistory] = useState<any[]>([
    { day: 0, ...historyAdapter(getInitialState()) },
  ]);

  const animationFrameRef = useRef<number | null>(null);
  
  const reset = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsRunning(false);
    setDay(0);
    const initialState = getInitialState();
    setState(initialState);
    setHistory([{ day: 0, ...historyAdapter(initialState) }]);
  }, [getInitialState, historyAdapter]);

  const stepForward = useCallback(() => {
    setDay(prevDay => {
      if (prevDay >= totalDays) {
        setIsRunning(false);
        return prevDay;
      }
      const nextDay = prevDay + 1;
      setState(currentState => {
        const nextState = stepFn(currentState, payload, nextDay);
        setHistory(h => [...h, { day: nextDay, ...historyAdapter(nextState) }]);
        return nextState;
      });
      return nextDay;
    });
  }, [payload, stepFn, totalDays, historyAdapter]);
  
  const toggleRun = () => {
    if (day >= totalDays && !isRunning) {
        return; // Don't start if already finished
    }
    setIsRunning(prev => !prev);
  };

  useEffect(() => {
    if (!isRunning) {
        if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
    }

    let lastUpdateTime = performance.now();
    const animate = (timestamp: number) => {
        if (timestamp - lastUpdateTime > simulationSpeed) {
            lastUpdateTime = timestamp;
            stepForward();
        }

        if (day < totalDays) {
             animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            setIsRunning(false);
        }
    };
    
    if (day < totalDays) {
        animationFrameRef.current = requestAnimationFrame(animate);
    } else {
        setIsRunning(false);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRunning, stepForward, simulationSpeed, day, totalDays]);
  
  // Effect to reset if payload changes (e.g., in a runner with configurable params)
  useEffect(() => {
      reset();
  }, [payload, reset]);


  return {
    day,
    state,
    history,
    isRunning,
    controls: {
      toggleRun,
      reset,
      stepForward,
    },
  };
}
