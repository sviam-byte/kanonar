import React, { useMemo, useState } from 'react';
import { AtomExplorer } from './AtomExplorer';
import { TraceDrawer } from './TraceDrawer';

type AtomOrigin = 'world' | 'obs' | 'override' | 'derived';
type Atom = {
  id: string;
  m: number;
  c: number;
  o: AtomOrigin;
  meta?: any;
};

export function FrameDebugPanel({
  frame,
}: {
  frame: {
    atoms: Atom[];
    index?: Record<string, Atom>;
    panels?: {
      mind?: { threat: number; pressure: number; support: number; crowd: number };
      threat?: { env: number; soc: number; auth: number; unc: number; body: number; sc: number; final: number };
      ctx?: any;
    };
    diagnostics?: {
      totalAtoms: number;
      missingSpec: number;
      missingCode: number;
      unknownQuark: number;
    };
  } | null;
}) {
  const [selected, setSelected] = useState<Atom | null>(null);
  const index = useMemo(() => {
    if (frame?.index) return frame.index;
    const obj: Record<string, Atom> = {};
    (frame?.atoms ?? []).forEach(a => (obj[a.id] = a));
    return obj;
  }, [frame]);

  const mind = frame?.panels?.mind;
  const threat = frame?.panels?.threat;

  if (!frame) return null;

  const diag = frame.diagnostics;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 bg-canon-bg-light border border-canon-border rounded-xl">
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 px-1">
          <h3 className="text-xl font-bold text-canon-accent uppercase tracking-wider">Context Atoms</h3>
          {diag ? (
            <div className="flex gap-2 text-[10px] font-mono">
              <span className="px-2 py-1 rounded border border-white/10 bg-black/30">
                total: <b className="text-white">{diag.totalAtoms}</b>
              </span>
              <span className="px-2 py-1 rounded border border-white/10 bg-black/30">
                missingSpec: <b className={diag.missingSpec ? "text-red-400" : "text-green-400"}>{diag.missingSpec}</b>
              </span>
              <span className="px-2 py-1 rounded border border-white/10 bg-black/30">
                missingCode: <b className={diag.missingCode ? "text-red-400" : "text-green-400"}>{diag.missingCode}</b>
              </span>
              <span className="px-2 py-1 rounded border border-white/10 bg-black/30">
                unknownQuark: <b className={diag.unknownQuark ? "text-amber-400" : "text-green-400"}>{diag.unknownQuark}</b>
              </span>
            </div>
          ) : null}
        </div>
        <AtomExplorer
          atoms={frame.atoms}
          onSelect={(a) => setSelected(a)}
        />
      </div>

      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* Indicators Panel */}
        <div className="bg-canon-bg border border-canon-border/50 rounded-xl p-4">
          <h3 className="text-xs font-bold text-canon-text-light uppercase tracking-widest mb-4 border-b border-canon-border/30 pb-2">Scoreboard</h3>
          <div className="grid grid-cols-2 gap-4">
            {mind ? (
                <div className="space-y-3 font-mono text-xs">
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Threat:</span>
                        <span className="text-red-400 font-bold">{mind.threat.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Pressure:</span>
                        <span className="text-amber-400 font-bold">{mind.pressure.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Support:</span>
                        <span className="text-green-400 font-bold">{mind.support.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Crowd:</span>
                        <span className="text-blue-400 font-bold">{mind.crowd.toFixed(3)}</span>
                    </div>
                </div>
            ) : <div className="text-xs text-canon-text-light italic">No mind data.</div>}
            
            {threat ? (
                <div className="space-y-1 font-mono text-[10px] border-l border-canon-border/20 pl-4">
                     <div className="flex justify-between text-canon-text-light"><span>ENV:</span> <span>{threat.env.toFixed(2)}</span></div>
                     <div className="flex justify-between text-canon-text-light"><span>SOC:</span> <span>{threat.soc.toFixed(2)}</span></div>
                     <div className="flex justify-between text-canon-text-light"><span>AUT:</span> <span>{threat.auth.toFixed(2)}</span></div>
                     <div className="flex justify-between text-canon-text-light"><span>UNC:</span> <span>{threat.unc.toFixed(2)}</span></div>
                     <div className="flex justify-between text-canon-text-light"><span>BOD:</span> <span>{threat.body.toFixed(2)}</span></div>
                     <div className="flex justify-between text-white font-bold mt-1 border-t border-white/10 pt-1"><span>FINAL:</span> <span>{threat.final.toFixed(2)}</span></div>
                </div>
            ) : null}
          </div>
          <div className="mt-4 pt-2 border-t border-canon-border/20 text-[9px] text-canon-text-light italic">
              Tip: Click any <code>mind:*</code> or <code>threat:*</code> atom in the list to see its derivation trace.
          </div>
        </div>

        {/* Trace Panel */}
        <div className="bg-canon-bg border border-canon-border/50 rounded-xl p-4 flex-grow min-h-[300px]">
          <h3 className="text-xs font-bold text-canon-text-light uppercase tracking-widest mb-4 border-b border-canon-border/30 pb-2">Derivation Trace</h3>
          <TraceDrawer
            atom={selected}
            index={index}
            onJump={(id) => setSelected(index[id] ?? null)}
          />
        </div>
      </div>
    </div>
  );
}
