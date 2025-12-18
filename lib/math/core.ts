export const softplus = (x:number)=> Math.log1p(Math.exp(-Math.abs(x))) + Math.max(x,0);
export const sigmoid  = (x:number)=> 1/(1+Math.exp(-x));
export const sat = (x:number, lo:number, hi:number)=> lo + (hi-lo)*sigmoid(x);

export function hash32(s:string){
  // простая детерминированная хеш-функция 32-bit
  let h=2166136261|0;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h>>>0;
}
export function xorshift32(seed:number){
  let x = seed>>>0 || 1;
  return function(){ x ^= x<<13; x ^= x>>>17; x ^= x<<5; return (x>>>0)/4294967296; };
}

export function normalize(v:number[]){
  let s = 0; for(const x of v) s+=x;
  if (s <= 0) return v.map(_ => 1/v.length);
  return v.map(x => x/s);
}

export function cosSim(a:number[], b:number[]){
  let sa=0,sb=0,sp=0;
  const len = Math.min(a.length, b.length);
  for (let i=0; i < len; i++){
    sa += a[i] * a[i];
    sb += b[i] * b[i];
    sp += a[i] * b[i];
  }
  if (sa === 0 || sb === 0) return 0;
  return sp / Math.sqrt(sa * sb);
}