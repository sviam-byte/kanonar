// /lib/registry/goals.ts
export type Goal = { id:string; name:string; kind:"L"|"S"|"both" };
export const GOALS_L: Goal[] = [
  { id:"reach_surface",        name:"выход на поверхность",        kind:"L" },
  { id:"maintain_legitimacy",  name:"сохранить легитимность",      kind:"L" },
  { id:"aid_wounded",          name:"помочь раненым",              kind:"L" },
  { id:"comply_now",           name:"немедленное подчинение",      kind:"S" }
];

export function goalByIndex(idx:number){ return GOALS_L[idx] ?? null; }
export function goalNameByIndex(idx:number){ return GOALS_L[idx]?.name ?? "—"; }
export function goalIdByIndex(idx:number){ return GOALS_L[idx]?.id ?? "unknown"; }
export function goalIndexById(id:string){ return GOALS_L.findIndex(g=>g.id===id); }
export const N_GOALS = GOALS_L.length;