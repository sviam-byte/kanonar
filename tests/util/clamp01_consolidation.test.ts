import { describe, expect, it } from 'vitest';

import { clamp01, clamp11, safe01 } from '@/lib/util/math';

/**
 * Canonical clamp contract for the codebase after consolidation.
 */
describe('clamp01 canonical', () => {
  it('clamps to [0,1]', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it('returns 0 for NaN/Infinity', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clamp01(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('safe01', () => {
  it('coerces unknown input to number and clamps', () => {
    expect(safe01('0.5')).toBe(0.5);
    expect(safe01(null)).toBe(0);
    expect(safe01(undefined)).toBe(0);
  });

  it('uses custom fallback for non-finite values', () => {
    expect(safe01(undefined, 0.5)).toBe(0.5);
    expect(safe01(Number.NaN, 0.5)).toBe(0.5);
  });
});

describe('clamp11', () => {
  it('clamps to [-1,1] and guards NaN', () => {
    expect(clamp11(0.5)).toBe(0.5);
    expect(clamp11(-0.5)).toBe(-0.5);
    expect(clamp11(-2)).toBe(-1);
    expect(clamp11(Number.NaN)).toBe(0);
  });
});
