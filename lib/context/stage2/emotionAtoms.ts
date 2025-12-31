import { Atom } from '../../atoms/types';
import { getM, used } from '../../atoms/read';
import { clamp01 } from '../../math/normalize';
import { listify } from '../../utils/listify';

function clampNegPos1(x: number) {
  return Math.max(-1, Math.min(1, x));
}

export function deriveAppraisalAndEmotionAtoms(agentId: string, resolved: Map<string, Atom>): Atom[] {
  // appraisals (0..1)
  const threat = clamp01(
    Math.max(
      getM(resolved, `mind:threat:${agentId}`, 0),
      getM(resolved, `threat:final:${agentId}`, 0),
    ),
  );
  const uncertainty = clamp01(getM(resolved, `ctx:uncertainty:${agentId}`, 0.5));
  const pressure = clamp01(getM(resolved, `mind:pressure:${agentId}`, 0));
  const support = clamp01(getM(resolved, `mind:support:${agentId}`, 0));

  // emotions (0..1) — простая “сборка из атомов”, чтобы стало видно и отлаживаемо
  const fear = clamp01(0.75 * threat + 0.25 * uncertainty);
  const anger = clamp01(0.60 * threat + 0.40 * pressure - 0.30 * support);
  const sadness = clamp01(0.55 * threat + 0.45 * (1 - support));
  const joy = clamp01(0.70 * support + 0.30 * (1 - threat));

  // core affect
  const valence = clampNegPos1(joy - (fear + anger + sadness) / 3);
  const arousal = clamp01(0.50 * fear + 0.35 * anger + 0.15 * threat);

  const usedIds = used(
    `mind:threat:${agentId}`,
    `threat:final:${agentId}`,
    `ctx:uncertainty:${agentId}`,
    `mind:pressure:${agentId}`,
    `mind:support:${agentId}`,
  );

  const mk = (id: string, m: number, formulaId: string, parts?: any[]): Atom => ({
    id,
    m,
    c: 1,
    o: 'derived',
    meta: {
      trace: {
        usedAtomIds: usedIds,
        parts: listify(parts),
        formulaId,
      },
    },
  });

  return [
    // app:*
    mk(`app:threat:${agentId}`, threat, 'app:threat@v1', [
      { name: 'mind:threat', value: getM(resolved, `mind:threat:${agentId}`, 0), weight: 0.5 },
      { name: 'threat:final', value: getM(resolved, `threat:final:${agentId}`, 0), weight: 0.5 },
    ]),
    mk(`app:uncertainty:${agentId}`, uncertainty, 'app:uncertainty@v1'),
    mk(`app:pressure:${agentId}`, pressure, 'app:pressure@v1'),
    mk(`app:support:${agentId}`, support, 'app:support@v1'),

    // emo:*
    mk(`emo:fear:${agentId}`, fear, 'emo:fear@v1', [
      { name: 'threat', value: threat, weight: 0.75 },
      { name: 'uncertainty', value: uncertainty, weight: 0.25 },
    ]),
    mk(`emo:anger:${agentId}`, anger, 'emo:anger@v1'),
    mk(`emo:sadness:${agentId}`, sadness, 'emo:sadness@v1'),
    mk(`emo:joy:${agentId}`, joy, 'emo:joy@v1'),
    mk(`emo:valence:${agentId}`, valence, 'emo:valence@v1'),
    mk(`emo:arousal:${agentId}`, arousal, 'emo:arousal@v1'),
  ];
}
