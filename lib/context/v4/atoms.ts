import { ContextAtom, WorldState } from '../../../types';
import { AgentContextFrame } from '../frame/types';
import { atomizeFrame } from './atomizeFrame';

/**
 * Backward-compatible wrapper.
 * v4 has a canonical atomizer (atomizeFrame). This function is kept because parts of the UI/engine
 * still call buildAtomsFromFrame().
 *
 * IMPORTANT: Do not add new logic here. Add it to atomizeFrame() only.
 */
export function buildAtomsFromFrame(frame: AgentContextFrame, t: number, world?: WorldState): ContextAtom[] {
  // atomizeFrame uses v2 ContextAtom; structurally compatible with global ContextAtom in this codebase.
  return atomizeFrame(frame as any, t, world as any) as any;
}
