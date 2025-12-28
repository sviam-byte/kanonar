// lib/mind/integrateAffect.ts
// Persist affect in a single canonical place (agent.affect), while keeping legacy agent.state.affect in sync.

import type { AgentState } from '../../types';
import type { AffectState } from '../emotions/types';
import { normalizeAffectState } from '../affect/normalize';
import { defaultAffect } from '../affect/engine';

export function integrateAgentAffect(agent: AgentState, affect: Partial<AffectState> | null | undefined) {
  const base = (affect && typeof affect === 'object') ? affect : defaultAffect();
  const norm = normalizeAffectState(base as any);

  (agent as any).affect = norm;
  (agent as any).state = {
    ...((agent as any).state || {}),
    affect: norm,
    tick: (agent as any).state?.tick ?? norm.tick,
  };
}
