
import { WorldState, AgentState, CharacterEntity, Branch, CharacterGoalId } from '../../types';
import { GOAL_DEFS } from '../goals/space';
import { DiagnosticScenario, DiagnosticReport, CharacterDiagnosticTimeseries, StabilityMode, DiagnosticScenarioContext, CharacterDiagnosticSummary } from './types';
import { runSimulationTick } from '../engine/loop';
import { calculateAllCharacterMetrics } from '../metrics';
import { computeStability } from '../stability';
import { calculateCharacterArchetypeInfo } from '../archetypes/shadow';
import { getTomView } from '../tom/view';
import { summarizeCharacterDiagnostic, computeGroupSummary } from './analyzer';
import { mapCharacterToBehaviorParams } from '../core/character_mapper';
import { makeAgentRNG } from '../core/noise';
import { initTomForCharacters } from '../tom/init';
import { constructGil } from '../gil/apply';
import { FACTIONS } from '../../data/factions';
import { defaultBody } from '../character-snippet';
import { buildDefaultMassNetwork } from '../mass/build';

const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj));

class DiagnosticsLogger {
  private timeseries: Record<string, CharacterDiagnosticTimeseries>;

  constructor(private characterIds: string[], private focusPairs: Array<{ observerId: string; targetId: string }>) {
    this.timeseries = {};
    for (const id of characterIds) {
      this.timeseries[id] = {
        tick: [], S: [], mode: [], stress: [], shadowProb: [], EW: [], prMonstro: [], trustTo: {}, conflictTo: {},
      };
    }
  }

  logTick(world: WorldState) {
    for (const id of this.characterIds) {
      const char = world.agents.find(a => a.entityId === id);
      if (!char) continue;

      const fullMetrics = calculateAllCharacterMetrics(char, char.versionTags[0] as Branch, []);
      const stabilityScore = computeStability({
        stress: (char.body.acute.stress ?? 0) / 100,
        discipline: fullMetrics.latents.SD ?? 0.5,
        resources: fullMetrics.v42metrics?.Recovery_t ?? 0.5,
      }) * 100;
      
      const archetypeInfo = calculateCharacterArchetypeInfo(char, fullMetrics.eventAdjustedFlatParams, stabilityScore);

      const ts = this.timeseries[id];
      ts.tick.push(world.tick);
      ts.S.push(stabilityScore);
      
      // Log phase if available, else mode
      const phaseOrMode = char.archetype?.phase || char.mode || 'normal';
      ts.mode.push(phaseOrMode as any); // Type cast for compatibility with existing StabilityMode
      
      ts.stress.push(char.body.acute.stress ?? 0);
      ts.shadowProb.push(archetypeInfo?.shadow.shadow_activation_prob ?? 0);
      ts.EW.push(fullMetrics.latents.EW ?? 0.5);
      ts.prMonstro.push(fullMetrics.quickStates.prMonstro ?? 0);

      for (const { observerId, targetId } of this.focusPairs) {
        if (observerId !== id) continue;
        const tom = getTomView(world, observerId, targetId);
        (ts.trustTo[targetId] ??= []).push(tom.trust ?? 0.5);
        (ts.conflictTo[targetId] ??= []).push(tom.conflict ?? 0.5);
      }
    }
  }

  getTimeseries(): Record<string, CharacterDiagnosticTimeseries> {
    return this.timeseries;
  }
}

export async function runDiagnosticScenario(
  scenario: DiagnosticScenario,
  baseCharacters: CharacterEntity[],
  options?: { seed?: number }
): Promise<DiagnosticReport> {
  const characterIds = baseCharacters.map(c => c.entityId);
  const agentStates: AgentState[] = baseCharacters.map(char => {
      const behavioralParams = mapCharacterToBehaviorParams(char);
      const agentRNGs = { decide: makeAgentRNG(char.entityId, options?.seed ?? 0), physio: makeAgentRNG(char.entityId, (options?.seed ?? 0) + 1), perceive: makeAgentRNG(char.entityId, (options?.seed ?? 0) + 2) };
      
      // Merge full body structure from defaults if missing in legacy char
      // This ensures PhysioSystem has access to all required fields like strength_max (constitution), etc.
      // We perform a deep merge of critical sections.
      const mergedBody = deepClone(defaultBody);
      if (char.body) {
          Object.assign(mergedBody.acute, char.body.acute);
          Object.assign(mergedBody.reserves, char.body.reserves);
          if (char.body.constitution) Object.assign(mergedBody.constitution, char.body.constitution);
          if (char.body.capacity) Object.assign(mergedBody.capacity, char.body.capacity);
          if (char.body.regulation) Object.assign(mergedBody.regulation, char.body.regulation);
          // Also merge new fields if they exist on the input char
          if (char.body.structural) Object.assign(mergedBody.structural, char.body.structural);
          if (char.body.functional) Object.assign(mergedBody.functional, char.body.functional);
          if (char.body.hormonal) Object.assign(mergedBody.hormonal, char.body.hormonal);
          if (char.body.reproductive) Object.assign(mergedBody.reproductive, char.body.reproductive);
          if (char.body.adipose) Object.assign(mergedBody.adipose, char.body.adipose);
      }

      return {
          ...deepClone(char),
          body: mergedBody, 
          hp: char.body?.acute?.hp ?? 100, S: 50, mode: 'normal',
          temperature: behavioralParams.T0, gumbelScale: behavioralParams.gumbel_beta,
          processNoiseSigma: behavioralParams.sigma0, rngChannels: agentRNGs, behavioralParams,
          w_eff: [], relationships: {}, wSelfBase: [], goalIds: Object.keys(GOAL_DEFS),
          perceivedStates: new Map(),
          pendingProposals: [],
          actionHistory: [],
          flags: {},
      } as AgentState;
  });

  const world: WorldState = {
    tick: 0,
    agents: agentStates,
    context: 'diagnostic',
    threats: [],
    tom: {} as any,
    groupGoalId: "help_wounded",
    leadership: { currentLeaderId: null, leaderScore: 0, lastChangeTick: 0, changeCount: 0, legitimacy: 0.7, contestLevel: 0.1 },
    factions: FACTIONS,
    meta: {},
    initialRelations: {},
    massNetwork: buildDefaultMassNetwork(Branch.Current),
    locations: [],
  };
  
  const ctx: DiagnosticScenarioContext = { world, characterIds };
  scenario.setup(ctx);

  world.tom = initTomForCharacters(world.agents, world);
  world.gilParams = constructGil(world.agents);

  const focusPairs = scenario.focusPairs ?? world.agents.flatMap((i) => world.agents.filter(j => j !== i).map(j => ({ observerId: i.entityId, targetId: j.entityId })));
  const logger = new DiagnosticsLogger(characterIds, focusPairs);

  for (let t = 0; t < scenario.ticks; t++) {
    await runSimulationTick(world);

    if (world.meta?.blackSwanTick === world.tick) {
        world.agents.forEach(agent => {
            if (characterIds.includes(agent.entityId)) {
                agent.body.acute.stress = Math.min(100, (agent.body.acute.stress ?? 0) + 50);
                agent.historicalEvents.push({ id: `trauma-${world.tick}`, name: 'Катастрофа', t: Date.now(), domain: 'trauma', intensity: 0.9, valence: -1 } as any);
            }
        });
    }

    world.agents.forEach(agent => {
        const fullMetrics = calculateAllCharacterMetrics(agent, agent.versionTags[0] as Branch, []);
        if (fullMetrics.v42metrics && fullMetrics.v42metrics.ExhaustRisk_t > 0.8) agent.mode = 'burnout';
        else if ((agent.state?.dark_exposure ?? 0) > 70) agent.mode = 'dark';
        else agent.mode = 'normal';
    });

    logger.logTick(world);
    if (scenario.stopCondition && scenario.stopCondition(ctx)) break;
  }

  scenario.finalize?.(ctx);

  const timeseries = logger.getTimeseries();
  const summary: Record<string, CharacterDiagnosticSummary> = {};
  for (const id of characterIds) {
    const baseChar = baseCharacters.find(c => c.entityId === id)!;
    const finalChar = world.agents.find(a => a.entityId === id)!;
    summary[id] = summarizeCharacterDiagnostic(timeseries[id], baseChar, finalChar);
  }

  return {
    scenarioId: scenario.id,
    characters: characterIds,
    timeseries,
    summary,
    groupSummary: computeGroupSummary(world, characterIds),
  };
}
