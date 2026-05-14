import { describe, expect, it } from 'vitest';
import { allMechanics } from '../../lib/dilemma/mechanics';
import type { MechanicId, ProtocolCardView } from '../../lib/dilemma/types';

describe('DilemmaLab mechanic protocol views', () => {
  it('exposes roles, phases, observation, payoff, state, and risks for every mechanic', () => {
    for (const mechanic of allMechanics()) {
      const protocol = mechanic.protocol;

      expect(protocol.kernel).toBe(mechanic.id);
      expect(protocol.roles.length, `${mechanic.id} roles`).toBeGreaterThanOrEqual(2);
      expect(protocol.phases.length, `${mechanic.id} phases`).toBeGreaterThanOrEqual(2);
      expect(protocol.observation.trim(), `${mechanic.id} observation`).not.toBe('');
      expect(protocol.coreRule.trim(), `${mechanic.id} coreRule`).not.toBe('');
      expect(protocol.primaryParameter.trim(), `${mechanic.id} primaryParameter`).not.toBe('');
      expect(protocol.stateVariables.length, `${mechanic.id} stateVariables`).toBeGreaterThanOrEqual(3);
      expect(protocol.attractorRisks.length, `${mechanic.id} attractorRisks`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps asymmetric and hidden-information mechanics visible at the domain-data layer', () => {
    const protocols = Object.fromEntries(
      allMechanics().map((m) => [m.id, m.protocol]),
    ) as Record<MechanicId, ProtocolCardView>;

    expect(protocols.ultimatum_split.timing).toBe('sequential');
    expect(protocols.ultimatum_split.symmetry).toBe('asymmetric');
    expect(protocols.signaling_trust.information).toBe('hidden_type');
    expect(protocols.authority_conflict.roles.map((role) => role.label).join(' ')).toContain('authority');
    expect(protocols.volunteer_sacrifice.coreRule).toContain('group failure');
  });
});
