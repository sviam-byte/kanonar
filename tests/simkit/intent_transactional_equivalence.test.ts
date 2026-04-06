import { describe, expect, it } from 'vitest';

import { sameTransactionalIntentKind } from '@/lib/behavior/actionPattern';

describe('intent transactional equivalence', () => {
  it('treats only the same action kind as the same transactional intent', () => {
    expect(sameTransactionalIntentKind('talk', 'talk')).toBe(true);
    expect(sameTransactionalIntentKind('help', 'comfort')).toBe(false);
    expect(sameTransactionalIntentKind('negotiate', 'threaten')).toBe(false);
  });
});
