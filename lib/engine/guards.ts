// /lib/engine/guards.ts
import { goalIdByIndex, goalIndexById } from "../registry/goals";

export function sanitizeProb(v:number[], n:number){
  const a = (Array.isArray(v) ? v.slice(0,n) : new Array(n).fill(0)).map(x=> Number.isFinite(x)? Math.max(0,x):0);
  const s = a.reduce((p,c)=>p+c,0);
  return (s>0? a.map(x=>x/s) : new Array(n).fill(1/n));
}

export function guardIntent(agent:any, world:any){
  const n = world.N_GOALS;
  // Ensure W_L and W_S are valid probability distributions of the correct length.
  agent.W_L = sanitizeProb(agent.W_L, n);
  agent.W_S = sanitizeProb(agent.W_S, n);
  
  let idx = Number.isInteger(agent.intent_idx)? agent.intent_idx : -1;

  // If intent is invalid, try to find a fallback.
  if (idx<0 || idx>=n || !Number.isFinite(agent.W_S[idx])){
    // 1. Fallback to the goal with the highest short-term weight.
    idx = agent.W_S.indexOf(Math.max(...agent.W_S));
    
    // 2. Fallback to a heuristic based on the last action taken.
    if (idx<0 || !Number.isFinite(idx)){
      const map:any = {
        share_information:"maintain_legitimacy",
        persuade:"reach_surface",
        intimidate:"comply_now",
        deceive:"maintain_legitimacy",
        observe:"reach_surface",
        introduce:"maintain_legitimacy",
        ask_question:"reach_surface"
      };
      const gid = map[agent.lastActionId] || "reach_surface";
      idx = goalIndexById(gid) ?? 0;
    }
  }
  agent.intent_idx = idx;
  agent.intent_id  = goalIdByIndex(idx);
  return idx;
}