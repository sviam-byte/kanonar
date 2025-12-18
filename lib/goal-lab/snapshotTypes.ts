
import { ContextAtom } from '../context/v2/types';

export type GoalLabSnapshotV1 = {
  schemaVersion: 1;
  tick: number;
  selfId: string;

  atoms: ContextAtom[];                 // SINGLE source of truth for panels
  warnings?: any[];
  atomDiff?: any[];

  // optional structured blocks
  contextMind?: any;                    // scoreboard (Threat/Pressure/Support/Crowd)
  possibilities?: any[];                // typed possibilities (from registry)
  decision?: any;                       // ranked actions
  tom?: any;                            // if you keep separate
  threat?: any;                         // if you keep separate
  meta?: Record<string, any>;
  
  coverage?: any;                       // Atom coverage report
};
