import { describe, it, expect } from 'vitest';
import { actionEffectForKind } from '../../lib/decision/actionProjection';

const POSSIBILITY_KEYS = [
  'hide', 'escape', 'wait', 'rest', 'observe_area', 'self_talk', 'attack',
  'talk', 'ask_info', 'verify', 'comfort', 'help', 'share_resource',
  'negotiate', 'propose_trade', 'apologize', 'praise', 'accuse', 'threaten',
  'confront', 'avoid', 'command', 'call_backup', 'signal', 'guard', 'escort',
  'treat', 'investigate', 'observe_target',
];

describe('BASE_EFFECTS coverage', () => {
  it('every possibility key returns non-empty effects', () => {
    const missing: string[] = [];
    for (const key of POSSIBILITY_KEYS) {
      const fx = actionEffectForKind(key);
      if (Object.keys(fx).length === 0) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('social actions affect socialTrust positively', () => {
    for (const key of ['talk', 'comfort', 'praise', 'help', 'treat', 'share_resource']) {
      const fx = actionEffectForKind(key);
      expect(fx.socialTrust, `${key} should have positive socialTrust`).toBeGreaterThan(0);
    }
  });

  it('aggressive actions reduce socialTrust', () => {
    for (const key of ['attack', 'threaten', 'confront', 'accuse', 'deceive']) {
      const fx = actionEffectForKind(key);
      expect(fx.socialTrust, `${key} should have negative socialTrust`).toBeLessThan(0);
    }
  });

  it('guard/escort reduce threat', () => {
    for (const key of ['guard', 'escort']) {
      const fx = actionEffectForKind(key);
      expect(fx.threat, `${key} should reduce threat`).toBeLessThan(0);
    }
  });

  it('PATTERN_MAP catches synonyms', () => {
    // These keys do not have exact BASE_EFFECTS entries but should match via patterns.
    const synonymTests: [string, string][] = [
      ['reassure', 'comfort'],
      ['heal', 'treat'],
      ['flee', 'escape'],
      ['scout', 'observe'],
      ['bluff', 'deceive'],
    ];
    for (const [synonym, expectedBase] of synonymTests) {
      const fx = actionEffectForKind(synonym);
      const baseFx = actionEffectForKind(expectedBase);
      expect(Object.keys(fx).length, `${synonym} should resolve via pattern`).toBeGreaterThan(0);
      expect(Object.keys(baseFx).length, `${expectedBase} should have base effects`).toBeGreaterThan(0);
    }
  });
});
