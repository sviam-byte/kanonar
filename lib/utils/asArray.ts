export function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}
