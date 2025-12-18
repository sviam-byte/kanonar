import { buildStage0Atoms } from './stage0/buildStage0';
import { applyStage1Ctx } from './stage1/buildStage1';
import { applyStage3Threat } from './stage3/buildStage3';

export function buildFrameMvp(scene: any, tuning?: any) {
  const bag = buildStage0Atoms(scene);
  applyStage1Ctx(bag, scene.agent.id);
  
  applyStage3Threat(
    bag,
    scene.agent.id,
    (scene.otherAgents ?? []).map((x: any) => x.id),
    tuning,
  );

  const resolved = bag.resolve();
  const aid = scene.agent.id;

  return {
    atoms: Array.from(resolved.values()),
    index: Object.fromEntries(Array.from(resolved.entries())),
    tick: scene.tick ?? 0,
    agentId: aid,
    panels: {
      ctx: {
        privacy: resolved.get(`ctx:privacy:${aid}`)?.m ?? 0,
        publicness: resolved.get(`ctx:publicness:${aid}`)?.m ?? 0,
        surveillance: resolved.get(`ctx:surveillance:${aid}`)?.m ?? 0,
        crowd: resolved.get(`ctx:crowd:${aid}`)?.m ?? 0,
        uncertainty: resolved.get(`ctx:uncertainty:${aid}`)?.m ?? 0,
        danger: resolved.get(`ctx:danger:${aid}`)?.m ?? 0,
      },
      mind: {
        threat: resolved.get(`mind:threat:${aid}`)?.m ?? 0,
        pressure: resolved.get(`mind:pressure:${aid}`)?.m ?? 0,
        support: resolved.get(`mind:support:${aid}`)?.m ?? 0,
        crowd: resolved.get(`mind:crowd:${aid}`)?.m ?? 0,
      },
      threat: {
        env: resolved.get(`threat:env:${aid}`)?.m ?? 0,
        soc: resolved.get(`threat:soc:${aid}`)?.m ?? 0,
        auth: resolved.get(`threat:auth:${aid}`)?.m ?? 0,
        unc: resolved.get(`threat:unc:${aid}`)?.m ?? 0,
        body: resolved.get(`threat:body:${aid}`)?.m ?? 0,
        sc: resolved.get(`threat:sc:${aid}`)?.m ?? 0,
        final: resolved.get(`threat:final:${aid}`)?.m ?? 0,
      },
    },
  };
}
