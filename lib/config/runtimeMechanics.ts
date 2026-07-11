import { FC } from './formulaConfig';

export const RUNTIME_PROFILE_FACT_KEY = 'sim:runtimeProfile';

export type RuntimeProfileId = 'legacy' | 'phase1';

export type RuntimeMechanics = {
  profileId: RuntimeProfileId | 'config';
  source: 'formulaConfig' | 'runtimeProfile';
  communicationSpeechThreatV1: boolean;
  objectsContextAxesV1: boolean;
  locationPropsV1: boolean;
  memoryThreatTraceV1: boolean;
  actionPriorInfluence: boolean;
  actionPamV2: boolean;
  opponentBeliefS5V1: boolean;
  activeMechanisms: string[];
};

const MECHANISM_LABELS: Array<[keyof Omit<RuntimeMechanics, 'profileId' | 'source' | 'activeMechanisms'>, string]> = [
  ['communicationSpeechThreatV1', 'communication.speechThreatV1'],
  ['objectsContextAxesV1', 'objects.contextAxesV1'],
  ['locationPropsV1', 'location.propsV1'],
  ['memoryThreatTraceV1', 'memory.threatTraceV1'],
  ['actionPriorInfluence', 'actionScoring.priorInfluence'],
  ['actionPamV2', 'actionScoring.pamV2'],
  ['opponentBeliefS5V1', 'tom.opponentBeliefS5V1'],
];

function profileIdFrom(value: unknown): RuntimeProfileId | null {
  const raw = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? (value as Record<string, unknown>).profileId ?? (value as Record<string, unknown>).runtimeProfile
      : null;
  return raw === 'legacy' || raw === 'phase1' ? raw : null;
}

// tom:belief:* dual-emit stays OFF on every named profile (phase1 is the live
// UI default); a run opts in only through this explicit object-form override.
function opponentBeliefOverrideFrom(value: unknown): boolean | undefined {
  if (value && typeof value === 'object') {
    const raw = (value as Record<string, unknown>).opponentBeliefS5V1;
    if (typeof raw === 'boolean') return raw;
  }
  return undefined;
}

function withActiveMechanisms(
  value: Omit<RuntimeMechanics, 'activeMechanisms'>,
): RuntimeMechanics {
  return {
    ...value,
    activeMechanisms: MECHANISM_LABELS
      .filter(([key]) => value[key] === true)
      .map(([, label]) => label),
  };
}

/**
 * Resolve the mechanics used by one run.
 *
 * No explicit profile preserves the historical FormulaConfig behavior so
 * programmatic runs and the pinned golden test remain unchanged. User-facing
 * sessions can opt into `phase1` without mutating the global config object.
 */
export function resolveRuntimeMechanics(value?: unknown): RuntimeMechanics {
  const profileId = profileIdFrom(value);
  const opponentBeliefOverride = opponentBeliefOverrideFrom(value);

  if (profileId === 'legacy') {
    return withActiveMechanisms({
      profileId,
      source: 'runtimeProfile',
      communicationSpeechThreatV1: false,
      objectsContextAxesV1: false,
      locationPropsV1: false,
      memoryThreatTraceV1: false,
      actionPriorInfluence: false,
      actionPamV2: false,
      opponentBeliefS5V1: opponentBeliefOverride ?? false,
    });
  }

  if (profileId === 'phase1') {
    return withActiveMechanisms({
      profileId,
      source: 'runtimeProfile',
      communicationSpeechThreatV1: true,
      objectsContextAxesV1: true,
      locationPropsV1: true,
      memoryThreatTraceV1: true,
      actionPriorInfluence: true,
      actionPamV2: true,
      opponentBeliefS5V1: opponentBeliefOverride ?? false,
    });
  }

  return withActiveMechanisms({
    profileId: 'config',
    source: 'formulaConfig',
    communicationSpeechThreatV1: FC.communication.speechThreatV1.enabled,
    objectsContextAxesV1: FC.objects.contextAxesV1.enabled,
    locationPropsV1: FC.location.propsV1.enabled,
    memoryThreatTraceV1: FC.memory.threatTraceV1.enabled,
    actionPriorInfluence: FC.actionScoring.priorInfluence.enabled,
    actionPamV2: FC.actionScoring.pamV2.enabled,
    opponentBeliefS5V1: opponentBeliefOverride ?? FC.opponentBeliefV1.s5DualEmit.enabled,
  });
}

export function getRuntimeProfileFromFacts(facts: Record<string, unknown> | null | undefined): unknown {
  return facts?.[RUNTIME_PROFILE_FACT_KEY];
}
