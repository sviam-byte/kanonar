
// Генераторы пояснений по вкладам
import { Agent, World, CaseCard, Beat, Z, sigmoid, softplus, sat, normalize, gumbel, xorshift32, EPS, Goal, LogEntry } from "./types";
import { Logger } from "./logger";
import { explainContribs, topK } from "./explain";
import { cosSim } from "../math/core";
import cardData from '../../data/cards/case/evac-bridge';

// ====== Порты (можно заменить своими реализациями) ======

// Температуры через аппрайзл + Yerkes–Dodson
function computeAppraisal(agent:Agent, z:Z){
  const A = Math.max(0, 0.5*z["threat"] + 0.5*z["uncertainty"] + 0.2*z["social_pressure"] - 0.2*(z["control"]??0));
  const Aopt = 0.6; // дефолт
  const factor = 1 + agent.persona.kappa_T * Math.max(0, A - Aopt)/(Aopt+1e-6);
  const T0 = agent.persona.T0;
  const T_L = Math.max(0.15, Math.min(1.3, T0*factor*0.9));
  const T_S = Math.max(0.15, Math.min(1.3, T0*factor));
  const sigma_proc = 0.05 + 0.20*Math.max(0, (agent.body["sleep_debt_h"]||0)/24) + 0.15*Math.max(0,(agent.body["HPA_axis"]||1)-1);
  return { A, T_L, T_S, sigma_proc };
}

// Маски клятв и softban
function oathMask(agent:Agent, goalId:string, softban_lambda?:number){
  const hard = agent.oaths?.[goalId] ? 0 : 1;
  const soft = softban_lambda ? Math.exp(-Math.max(0, softban_lambda)) : 1;
  return hard*soft;
}

// Инициализация портфелей по Dirichlet-подобной α (персонализация упрощена)
function initSolverPortfolios(agent:Agent, card:CaseCard){
  const alphaL = card.goals_L.map(g=>{
    const base = (g.value??0.5) - 0.2*(agent.legacy?.resources?.risk_budget_cvar??0.5);
    return softplus(base) * oathMask(agent, g.id, g.softban_lambda) + 1e-6;
  });
  const alphaS = card.goals_S.map(g=>{
    const base = (g.value??0.5) + 0.2*(agent.theta?.["A_Safety_Care"]??0.5) - 0.2*(agent.theta?.["C_Impulsivity"]??0.5);
    return softplus(base) * oathMask(agent, g.id, g.softban_lambda) + 1e-6;
  });
  agent.W_L = normalize(alphaL);
  agent.W_S = normalize(alphaS);
  agent.W_L_lag = agent.W_L.slice();
  agent.W_S_lag = agent.W_S.slice();
}

// GIL: compute φ_{ij} и смешать — здесь stub для одиночного агента
function applyGIL(agent:Agent){
  // В этой заготовке нет других агентов → φ=0, только клятвы уже учтены в α.
  const phiSum = 0.0;
  return { phiSum };
}

// Выбор намерения L с Gumbel-tiebreak и логом вкладов
function chooseIntent(agent:Agent, card:CaseCard, rng:()=>number, currentTime: number){
  const contribs: LogEntry['contribs'] = [];
  const scores:number[] = [];
  for (let g=0; g<agent.W_L.length; g++){
    const goal = card.goals_L[g];
    const lockBias = ((agent.legacy?.state?.loyalty??50)/100) * (goal.min_lock? 0.05 : 0);
    const deadline = goal.deadline ?? Infinity;
    const dd = Math.max(1, deadline - currentTime);
    const deadlineBoost = (agent.W_L[g]) / dd; // чем ближе дедлайн, тем выше
    const base = agent.W_L[g] + lockBias + deadlineBoost;
    const score = base/Math.max(EPS, agent.temp.T_L) + gumbel(agent.persona.betaL, rng);
    contribs.push({name: `W_L[${goal.id}]`, value: agent.W_L[g]});
    contribs.push({name: `deadlineBoost`, value: deadlineBoost});
    contribs.push({name: `lockBias`, value: lockBias});
    scores.push(score);
  }
  let best = 0; for (let i=1;i<scores.length;i++) if (scores[i]>scores[best]) best=i;
  return { idx: best, contribs };
}

// Генерация опций под намерение — фильтруем доступные действия
function generateOptions(agent:Agent, card:CaseCard, intentIdx:number){
  const g = card.goals_L[intentIdx]?.id || "";
  const opts = card.actions.filter(a=>{
    if (g==="maintain_legitimacy" && a.tags.includes("risk")) return false;
    if (g==="preserve_team" && a.id==="escalate") return false;
    return true;
  });
  return opts;
}

// Оценка действия: полезность по портфелю S минус cost (с телесностью/legacy)
function qValue(agent:Agent, card:CaseCard, action:{id:string; tags:string[]; base_cost:Record<string, number>}, z:Z, intentIdx: number){
  const goal = card.goals_L[intentIdx];
  
  function tagUtility(agent:Agent, tag:string){
    // быстрая эвристика от W_S и θ; можно заменить на твоё u_g^tactic
    const has = (t:string) => goal?.tags?.includes(t) ?? false;
    const rb = Math.max(0, Math.min(1, agent.legacy?.risk_budget_cvar??0.5));
    const topoA = Math.max(0, Math.min(1, (agent.legacy?.competencies?.topo_affinity??50)/100));
    const legalZ = z?.legal ?? 0;

    const map:Record<string, number> = {
      "care":     has("care")? +0.8 : +0.4,
      "social":   has("social")? +0.6 : +0.2,
      "hierarchy":has("hierarchy")? +0.7 : +0.3,
      "progress": has("progress")? +0.5 : +0.2,
      "topo":     (has("topo")? +0.5 : +0.2) + 0.2*topoA,
      "risk":     (has("risk")? +0.5 : +0.2) - 0.6*rb,
      "recovery": has("recovery")? +0.5 : +0.2,
      "stability":has("stability")? +0.5 : +0.2,
      "deceive":  has("hierarchy")? -0.6 - 0.4*legalZ : -0.1
    };
    return map[tag] ?? 0.0;
  }
  
  const U = (action.tags||[]).reduce((s,t)=> s + tagUtility(agent,t), 0);

  // Cost
  const C0 = action.base_cost;
  let C = 0;
  if (C0.energy) C += C0.energy * (1 + 0.5*(agent.body["fatigue"]??0));
  if (C0.time)   C += C0.time * (1 + 0.2*(agent.legacy["time_t"]??0));
  if (C0.obedience && z["social_pressure"]>0.5) C += C0.obedience * (1-((agent.legacy?.state?.loyalty??50)/100));
  if (C0.injury) C += C0.injury * (1 + 0.5*(agent.body["injuries_severity"]??0));
  if (C0.legal)  C += C0.legal * (z["legal"]??0);

  return { Q:U-C, U, C, contribs:[] };
}

// Выбор действия
function chooseAction(agent:Agent, world:World, options:{id:string; tags:string[]; base_cost:Record<string, number>}[], rng:()=>number, card: CaseCard){
  const contribs: LogEntry['contribs'] = [];
  const scores:number[] = [];
  let bestQ = -Infinity, bestC = Infinity;
  for (const a of options){
    const { Q, U, C, contribs:valueContribs } = qValue(agent, card, a, world.story.getBeat(world.t).z, agent.intent??0);
    const score = Q/Math.max(EPS, agent.temp.T_S) + gumbel(agent.persona.betaS, rng);
    scores.push(score);
    if (score > bestQ) { bestQ=score; bestC=C; } // Note: this is not quite right, but good enough for logging
    if (valueContribs) {
        contribs.push(...valueContribs);
    }
  }
  let best = 0; for (let i=1;i<scores.length;i++) if (scores[i]>scores[best]) best=i;
  const action = options[best];
  return { action, Q:bestQ, cost:bestC, contribs };
}


// ====== Основной цикл ======

export function runCase(card:CaseCard, agent:Agent, seed:number){
  const story = { getBeat:(t:number):Beat => card.beats.find(b=>t>=b.from && t<b.to)!, horizon:card.horizon_steps, card };
  const world:World = { t:0, channelId:1, resources:{}, metrics:{S:50,Pv:50,dose:1,D:15}, actions:card.actions, story };
  const rng = xorshift32(seed);
  const logger = new Logger();

  initSolverPortfolios(agent, card);
  logger.port(0, `Инициализированы портфели L:${topK(agent.W_L)}, S:${topK(agent.W_S)}`, []);

  for (let t=0; t<story.horizon; t++){
    world.t = t;
    const z = story.getBeat(t).z;

    const appraisal = computeAppraisal(agent, z);
    agent.temp = appraisal;
    logger.app(t, `A=${appraisal.A.toFixed(2)} → T_L=${appraisal.T_L.toFixed(2)}, T_S=${appraisal.T_S.toFixed(2)}, σ_proc=${appraisal.sigma_proc.toFixed(3)}`, []);

    const { phiSum } = applyGIL(agent);
    if (phiSum>0) logger.gil(t, `Применено влияние GIL (Σφ=${phiSum.toFixed(2)})`, [], {phiSum});

    const { idx:intent, contribs:intentContribs } = chooseIntent(agent, card, rng, t);
    agent.intent = intent;
    logger.intent(t, `Выбрано намерение L:${card.goals_L[intent]?.id}`, [], intentContribs, { intent, W_L: agent.W_L });

    const options = generateOptions(agent, card, intent);
    logger.opts(t, `Сгенерировано ${options.length} опций`, options.map(o=>o.id));
    
    const {action, Q, cost, contribs:actionContribs} = chooseAction(agent, world, options, rng, card);
    logger.act(t, `Выбрано действие: ${action.id}`, [], actionContribs, { Q, cost });

    // Динамика — здесь заглушка
    logger.dyn(t, `Шаг динамики (stub)`, []);
  }
  const result = { logs: logger.logs };
  return result;
}