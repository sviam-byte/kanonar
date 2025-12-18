
import { AgentState, WorldState, DialogueTask, SituationSpec, SimulationEvent, CharacterEntity } from '../../types';
import { buildWorldForSituation } from './world-builders';
import { runSimulationTick } from '../engine/loop';

export interface DialogueTick {
  tick: number;
  world: WorldState;
  agents: AgentState[];
  events: SimulationEvent[];
}

export async function runDialogueSandbox(params: {
  situation: SituationSpec;
  task: DialogueTask;
  ticks: number;
  sandboxCharacters?: CharacterEntity[];
}): Promise<DialogueTick[]> {
  const { world } = buildWorldForSituation(params.situation, params.sandboxCharacters);
  const history: DialogueTick[] = [];

  // Find speaker and listener
  const speaker = world.agents.find(a => a.entityId === params.task.speakerId);
  
  if (speaker) {
      // Inject motivation: boost relevant goal or create internal drive
      // We assume DecisionSystem picks up on 'drivingGoalId' if set
      // Map communicationGoal to a character goal if possible, or just rely on the description
      // For simplicity, let's map a few known ones
      if (params.task.communicationGoal === 'increase_trust') speaker.drivingGoalId = 'maintain_cohesion';
      if (params.task.communicationGoal === 'share_information') speaker.drivingGoalId = 'seek_information';
      if (params.task.communicationGoal === 'avoid_blame') speaker.drivingGoalId = 'avoid_blame';
  }

  for (let i = 0; i < params.ticks; i++) {
    // Run full simulation tick
    const events = await runSimulationTick(world);

    history.push({
      tick: world.tick,
      world: JSON.parse(JSON.stringify(world)),
      agents: JSON.parse(JSON.stringify(world.agents)),
      events,
    });
    
    if (world.simulationEnded) break;
  }

  return history;
}
