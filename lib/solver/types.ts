// Инварианты и утилиты. Без внешних зависимостей.
export type Z = Record<string, number>;

export type Goal = {
  id: string;
  value?: number;         // 0..1
  deadline?: number;      // шаг
  min_lock?: number;      // мин-длительность
  tags?: string[];
  softban_lambda?: number;
};

export type Beat = { from:number; to:number; z:Z; shocks?:{lambda:number; J_profile:Z} };
export type CaseCard = {
  id:string; title:string; horizon_steps:number;
  goals_L: Goal[]; goals_S: Goal[];
  beats: Beat[]; resources?:Record<string, number>;
  actions: {id:string; tags:string[]; base_cost:Record<string, number>}[];
};

export type Portfolio = { W_L:number[]; W_S:number[]; lockCounters: Record<string, number> };

export type Agent = {
  id:number;
  theta: Record<string, number>;   // 44 оси [0,1]
  body: Record<string, number>;    // VO2max, sleep_debt_h, ...
  legacy: any;                     // clearance, risk_budget_cvar, ...
  sigils: string[];
  oaths: Record<string, boolean>;  // goal_id -> hardban
  temp: { T_L:number; T_S:number; sigma_proc:number };
  persona: {
    betaL:number; betaS:number; kappa_T:number; T0:number;
    phi_max:number; lambda_CVaR:number; loss_aversion:number;
    goal_stochasticity:number;
  };
  W_L:number[]; W_S:number[];      // портфели
  W_L_lag:number[]; W_S_lag:number[]; // для GIL лага
  intent?: number;                 // индекс цели L
  logs?: LogEntry[];
};

export type World = {
  t:number; channelId:number; resources:Record<string, number>;
  metrics:{ S:number; Pv:number; dose:number; D:number };
  actions: {id:string; tags:string[]; base_cost:Record<string, number>}[];
  story:{ getBeat:(t:number)=>Beat; horizon:number };
};

export type LogEntry = {
  t:number;
  step:"appraisal"|"gil"|"portfolio"|"intent"|"options"|"action"|"dynamics"|"learn";
  brief:string;                 // короткое резюме шага
  explain:string[];             // пояснения по пунктам
  contribs?: {name:string; value:number; weight?:number; part?:number}[];
  snapshot?: any;               // метрики, топ-цели, φ-суммы и т.п.
};

export const EPS = 1e-9;

export const clamp01 = (x:number)=> x<0?0:(x>1?1:x);
export const sigmoid  = (x:number)=> 1/(1+Math.exp(-x));
export const softplus = (x:number)=> Math.log1p(Math.exp(-Math.abs(x))) + Math.max(x,0);
export const sat = (x:number, lo:number, hi:number)=> lo + (hi-lo)*sigmoid(x);
export const normalize = (v:number[])=>{
  let s=0; for (const x of v) s+=x;
  if (s<=0) return v.map(_=>0);
  return v.map(x=>x/s);
};

export const gumbel = (beta:number, rng:()=>number)=> -beta*Math.log(-Math.log(Math.max(EPS, rng())));
export function xorshift32(seed:number){ let x=(seed|0)||1; return ()=>{ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; }; }