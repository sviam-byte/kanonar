
import {
  NormGateInput,
  NormGateResult,
  NormRule,
  NormDecision,
  NormLevel,
} from '../../types';

function matchesNorm(
  rule: NormRule,
  input: NormGateInput
): boolean {
  const {
    actorId,
    actionId,
    actionTags,
    locationId,
    locationTags,
    roleIds,
  } = input;

  if (rule.appliesToAgentIds && rule.appliesToAgentIds.length > 0) {
    if (!rule.appliesToAgentIds.includes(actorId)) return false;
  }

  if (rule.appliesToRoleIds && rule.appliesToRoleIds.length > 0) {
    if (!roleIds.some((r) => rule.appliesToRoleIds!.includes(r))) return false;
  }

  if (rule.actionId && actionId && rule.actionId !== actionId) return false;

  if (rule.actionTag) {
    if (!actionTags.includes(rule.actionTag)) return false;
  }

  if (rule.locationId && locationId && rule.locationId !== locationId) {
    return false;
  }

  if (rule.locationTag) {
    if (!locationTags.includes(rule.locationTag)) return false;
  }

  return true;
}

function levelToDecision(level: NormLevel): NormDecision {
  switch (level) {
    case 'hard_forbid':
    case 'soft_forbid':
      return 'forbid';
    case 'hard_require':
      return 'require_authorization';
    case 'soft_allow':
    default:
      return 'allow';
  }
}

export function evaluateNormGate(
  input: NormGateInput
): NormGateResult {
  const matched = input.norms.filter((r) => matchesNorm(r, input));

  if (matched.length === 0) {
    // Если норм нет — по умолчанию allow без санкций
    return {
      decision: 'allow',
      hard: false,
      reasonIds: [],
      sanctionScore: 0,
      rewardScore: 0,
    };
  }

  let hasHardForbid = false;
  let hasHardRequire = false;
  let sanctionScore = 0;
  let rewardScore = 0;
  const reasonIds: string[] = [];

  for (const rule of matched) {
    const s = Math.max(0, rule.sanctionWeight ?? 0);
    const r = Math.max(0, rule.rewardWeight ?? 0);

    switch (rule.level) {
      case 'hard_forbid':
        hasHardForbid = true;
        sanctionScore += s || 1;
        reasonIds.push(rule.id);
        break;
      case 'soft_forbid':
        sanctionScore += s || 0.5;
        reasonIds.push(rule.id);
        break;
      case 'hard_require':
        hasHardRequire = true;
        rewardScore += r || 1;
        reasonIds.push(rule.id);
        break;
      case 'soft_allow':
        rewardScore += r || 0.25;
        // soft_allow можно не всегда считать причиной блокировки
        break;
      default:
        break;
    }
  }

  let decision: NormDecision = 'allow';
  let hard = false;

  if (hasHardForbid) {
    decision = 'forbid';
    hard = true;
  } else if (hasHardRequire) {
    decision = 'require_authorization';
    hard = true;
  } else {
    // Мягкие нормы: если суммарный штраф явно больше бонуса — treat as forbid (soft)
    if (sanctionScore > rewardScore * 1.2) {
      decision = 'forbid';
      hard = false;
    } else {
      decision = 'allow';
      hard = false;
    }
  }

  return {
    decision,
    hard,
    reasonIds,
    sanctionScore,
    rewardScore,
  };
}
