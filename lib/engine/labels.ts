// /lib/engine/labels.ts
import { goalNameByIndex } from "../registry/goals";
export function renderGoalName(agent:any){
  const idx = Number.isInteger(agent.intent_idx) ? agent.intent_idx : -1;
  return idx>=0 ? goalNameByIndex(idx) : "—";
}