// /lib/engine/lag.ts
// This is a stub to resolve module import errors.

export function snapshotLags(agent: any) {
    // This would snapshot W_L into W_L_lag, etc., for use in the next tick's GIL calculation.
    if (agent.W_L) {
        agent.W_L_lag = agent.W_L.slice();
    }
     if (agent.W_S) {
        agent.W_S_lag = agent.W_S.slice();
    }
    if (agent.intent_idx !== undefined) {
        agent.intent_idx_lag = agent.intent_idx;
    }
}
