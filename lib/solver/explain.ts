

// Генераторы пояснений по вкладам
export function explainContribs(sorted:[string, number, number?][], totalLabel="логит"){
  const sum = sorted.reduce((a,[_n,v])=>a+v,0);
  const lines = sorted.map(([name, v, w])=>{
    const part = sum===0?0:(v/sum);
    const wtxt = (w!==undefined)? `, вес=${w.toFixed(2)}` : "";
    return `${name}: ${v>=0?"+":""}${v.toFixed(3)} (${(part*100).toFixed(1)}%${wtxt})`;
  });
  lines.push(`Σ ${totalLabel}: ${sum>=0?"+":""}${sum.toFixed(3)}`);
  return { lines, sum };
}
export function topK(vec:number[], k=3){
  const idx = vec.map((v,i)=>[i,v] as [number,number]).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([i])=>i);
  return idx;
}