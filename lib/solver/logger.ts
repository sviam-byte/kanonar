

import { LogEntry } from "./types";

export class Logger {
  logs: LogEntry[] = [];
  add(e:LogEntry){ this.logs.push(e); }
  step(t:number, step:LogEntry["step"], brief:string, explain:string[], contribs?:LogEntry["contribs"], snapshot?:any){
    this.add({ t, step, brief, explain, contribs, snapshot });
  }
  // удобные шорткаты
  app(t:number, brief:string, explain:string[], snap?:any){ this.step(t,"appraisal",brief,explain,undefined,snap); }
  gil(t:number, brief:string, explain:string[], snap?:any){ this.step(t,"gil",brief,explain,undefined,snap); }
  port(t:number, brief:string, explain:string[], snap?:any){ this.step(t,"portfolio",brief,explain,undefined,snap); }
  intent(t:number, brief:string, explain:string[], contribs?:any, snap?:any){ this.step(t,"intent",brief,explain,contribs,snap); }
  opts(t:number, brief:string, explain:string[], snap?:any){ this.step(t,"options",brief,explain,undefined,snap); }
  act(t:number, brief:string, explain:string[], contribs?:any, snap?:any){ this.step(t,"action",brief,explain,contribs,snap); }
  dyn(t:number, brief:string, explain:string[], snap?:any){ this.step(t,"dynamics",brief,explain,undefined,snap); }
  learn(t:number, brief:string, explain:string[], snap?:any){ this.step(t,"learn",brief,explain,undefined,snap); }
}