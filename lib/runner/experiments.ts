import { GOAL_DEFS } from "../goals/space";
import { MatrixRunResult, CharacterEntity, SceneMetrics, ScenarioState, AgentState, WorldState, RunLog, ActionChosenEvent, Branch } from '../../types';
import { allEntities } from '../../data';
import { allStories } from '../../data/stories';
import { allScenarioDefs } from '../../data/scenarios/index';
import { STRATEGIES } from '../choice/strategies';
import { mapCharacterToBehaviorParams } from '../core/character_mapper';
import { makeAgentRNG } from '../core/noise';
import { mapCharacterToCapabilities } from '../capabilities';
import { assignRoles } from '../roles/assignment';
import { FACTIONS } from '../../data/factions';
import { initTomForCharacters } from '../tom/init';
import { constructGil } from '../gil/apply';
import { runSimulationTick } from '../engine/loop';
import { calculateAllCharacterMetrics } from '../metrics';
import { computeStability } from '../stability';
import { buildDefaultMassNetwork } from '../mass/build';
import { defaultBody } from '../character-snippet';

const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

export async function runMatrix({stories: storyIds, agents: agentIds, seeds, strategyIds}: {stories:string[], agents:string[], seeds:number[], strategyIds:string[]}): Promise<MatrixRunResult[]> {
  const results: MatrixRunResult[] = [];
  const agentEntities = agentIds.map(id => allEntities.find(e => e.entityId === id) as CharacterEntity).filter(Boolean);

  for (const sid of storyIds){
    const storyCard = allStories[sid];
    if (!storyCard || !storyCard.scenarioId) continue;
    const scenarioDef = allScenarioDefs[storyCard.scenarioId];
    if (!scenarioDef) continue;

    for (const stid of strategyIds){
      const strategy = STRATEGIES.find(s=>s.id===stid);
      for (const seed of seeds){
        const initialMetrics = Object.entries(scenarioDef.metrics).reduce((acc, [key, value]) => {
            (acc as Record<string, number>)[key] = (value as any).initial;
            return acc;
        }, {} as Partial<SceneMetrics>);

        const scenarioState: ScenarioState = { 
            scenarioDef, 
            metrics: { tick: 0, ...initialMetrics } as SceneMetrics, 
            currentPhaseId: scenarioDef.phases ? scenarioDef.phases[0].id : undefined,
            tick: 0
        };
        
        const agentStates: AgentState[] = agentEntities.map(char => {
            const agentClone = deepClone(char);
            const behavioralParams = mapCharacterToBehaviorParams(agentClone);
            const agentRNGs = { decide: makeAgentRNG(char.entityId, seed), physio: makeAgentRNG(char.entityId, seed + 1), perceive: makeAgentRNG(char.entityId, seed + 2) };
            const agentGoalIds = Object.keys(GOAL_DEFS);
            
            const agentState: AgentState = {
                ...agentClone, S: 50, hp: agentClone.body?.acute?.hp ?? 100,
                temperature: behavioralParams.T0, gumbelScale: behavioralParams.gumbel_beta, processNoiseSigma: behavioralParams.sigma0, 
                rngChannels: agentRNGs, behavioralParams,
                w_eff: [], relationships: {}, perceivedStates: new Map(), pendingProposals: [],
                W_S: [], W_L: [], W_S_hat: [], W_L_hat: [], W_S_lag: [], W_L_lag: [], phiS_vec: [], phiL_vec: [], masksS: [], masksL: [], alphaL: [], alphaS: [],
                goalIds: agentGoalIds, wSelfBase: agentGoalIds.map(() => 0.1), drivingGoalState: {}, actionHistory: [], flags: {},
                capabilities: mapCharacterToCapabilities(agentClone), factionId: agentClone.context?.faction,
                body: { ...defaultBody, ...(agentClone.body || {}) }, state: agentClone.state, route_belief: 0, route_source: 'none', influence: 0
            } as any as AgentState;
            if(strategy?.patch) strategy.patch(agentState);
            return agentState;
        });
        
        const tempWorld: WorldState = { tick: 0, agents: agentStates, context: 'social', threats: [], tom: {} as any, groupGoalId: "help_wounded", leadership: { currentLeaderId: null, leaderScore: 0, lastChangeTick: 0, changeCount: 0, legitimacy: 0.7, contestLevel: 0.1 }, scene: scenarioState, scenario: scenarioDef, initialRelations: {}, factions: FACTIONS, locations: [] };
        const assignedRoles = assignRoles(agentStates, scenarioDef, tempWorld);
        agentStates.forEach(ag => { ag.effectiveRole = assignedRoles[ag.entityId] });

        const world: WorldState = {
            tick: 1,
            agents: agentStates,
            context: 'social',
            threats: [],
            tom: initTomForCharacters(agentStates, tempWorld),
            groupGoalId: 'maintain_cohesion',
            leadership: { ...tempWorld.leadership },
            factions: FACTIONS,
            gilParams: constructGil(agentStates),
            scenario: scenarioDef,
            scene: scenarioState,
            initialRelations: {},
            observations: {},
            systemEntities: [],
            massNetwork: buildDefaultMassNetwork(Branch.Current),
            locations: [],
        };
        agentStates.forEach(a => { if(!world.observations) world.observations = {}; world.observations[a.entityId] = []; });

        const logsByAgent: Record<string, RunLog[]> = {};
        agentIds.forEach(id => logsByAgent[id] = []);
        const MAX_TICKS = storyCard.horizon_steps || 60;

        while (!world.simulationEnded && world.tick <= MAX_TICKS) {
            const events = await runSimulationTick(world);
            for (const agent of world.agents) {
                const actionEvent = events.filter((e): e is ActionChosenEvent => e.kind === 'ActionChosen').find(e => e.actorId === agent.entityId);
                const fullMetrics = calculateAllCharacterMetrics(agent, agent.versionTags[0] as Branch, []);
                const newS = computeStability({ stress: (agent.body.acute.stress ?? 0) / 100, discipline: fullMetrics.latents.SD ?? 0.5, resources: fullMetrics.v42metrics?.Recovery_t ?? 0.5 }) * 100;
                agent.S = newS; 
                logsByAgent[agent.entityId].push({ t: world.tick - 1, action: actionEvent?.actionId ?? 'none', Q: actionEvent?.scoreBreakdown.total ?? 0, cost: actionEvent?.scoreBreakdown.cost ?? 0, T: agent.temperature, S: newS, Pv: 0, dose: 0, D: 0, A: 0, control: 0, shocks: 0, phiSum: 0 });
            }
        }
        results.push({ sid, strategy: stid, seed, logs: logsByAgent, outcome: world.scene?.outcome });
      }
    }
  }
  return results;
}