export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const linMix = (
  parts: { value: number; weight: number; name?: string }[],
) => {
  const v = parts.reduce((s, p) => s + p.value * p.weight, 0);
  return {
    value: clamp01(v),
    parts,
  };
};

export const noisyOr = (values: number[]) => {
  const prod = values.reduce((p, v) => p * (1 - v), 1);
  return clamp01(1 - prod);
};
