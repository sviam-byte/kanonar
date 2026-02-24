import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';
import { num } from '../../lib/features/scale';
import { describeQuark } from '../../lib/context/codex/quarkRegistry';
import { generateAtomSpecStubs } from '../../lib/context/catalog/generateMissingSpecs';
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
      missingSpecIds?: string[];
      missingCodeIds?: string[];
      unknownQuarkCodes?: string[];
    };
  } | null;
}) {
  const [selected, setSelected] = useState<Atom | null>(null);
  const atoms = arr(frame?.atoms);

  // Prefer pipeline-provided index, fallback to local map for compatibility with legacy snapshots.
  const atomIndex = useMemo(() => {
    if (frame?.index) return frame.index;
    const m: Record<string, Atom> = {};
    for (const a of atoms) m[a.id] = a;
    return m;
  }, [frame, atoms]);

  const mind = frame?.panels?.mind;
  const threat = frame?.panels?.threat;

  if (!frame) return null;

  const diag = frame.diagnostics;
  const [showCoverage, setShowCoverage] = useState(false);
  const [coverageTab, setCoverageTab] = useState<'missingSpec' | 'missingCode' | 'unknownQuark'>('missingSpec');

  const coverageList = useMemo(() => {
    if (!diag) return [];
    const next =
      coverageTab === 'missingSpec'
        ? arr(diag.missingSpecIds)
        : coverageTab === 'missingCode'
          ? arr(diag.missingCodeIds)
          : arr(diag.unknownQuarkCodes);
    if (!Array.isArray(next)) {
      console.error('Expected array, got', next);
      return [];
    }
    return next;
  }, [diag, coverageTab]);

  const coverageTitle = useMemo(() => {
    if (coverageTab === 'missingSpec') return 'Missing AtomSpec (id not matched)';
    if (coverageTab === 'missingCode') return 'Missing atom.code (normalize/spec needed)';
    return 'Unknown quark codes (not in quarkRegistry)';
  }, [coverageTab]);

  const onExportCoverage = () => {
    if (!diag) return;
    const payload =
      coverageTab === 'missingSpec'
        ? arr(diag.missingSpecIds)
        : coverageTab === 'missingCode'
          ? arr(diag.missingCodeIds)
          : arr(diag.unknownQuarkCodes);

    // eslint-disable-next-line no-console
    console.log(`[GoalLab Coverage] ${coverageTab} count=${payload.length}`, payload);

    if (coverageTab === 'missingSpec') {
      const stubs = generateAtomSpecStubs(payload, { prefix: 'auto' });
      // eslint-disable-next-line no-console
      console.log('[GoalLab Coverage] AtomSpec stubs (paste into atomSpecs.ts):\n', stubs);
      try {
        navigator.clipboard?.writeText?.(stubs);
        // eslint-disable-next-line no-console
        console.log('[GoalLab Coverage] Copied AtomSpec stubs to clipboard.');
      } catch {
        // ignore clipboard failures
      }
    } else {
      try {
        navigator.clipboard?.writeText?.(JSON.stringify(payload, null, 2));
        // eslint-disable-next-line no-console
        console.log('[GoalLab Coverage] Copied list to clipboard.');
      } catch {
        // ignore
      }
    }
  };

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
              <button
                onClick={() => setShowCoverage(v => !v)}
                className="px-2 py-1 rounded border border-white/10 bg-black/30 hover:bg-white/5 transition-colors font-bold uppercase"
                title="Show codex coverage details"
              >
                {showCoverage ? 'Hide' : 'Coverage'}
              </button>
            </div>
          ) : null}
        </div>
        {showCoverage && diag ? (
          <div className="p-3 rounded border border-canon-border bg-black/25">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-canon-text-light">
                Codex Coverage
              </div>
              <div className="flex gap-2 text-[10px] font-mono">
                <button onClick={() => setCoverageTab('missingSpec')} className={`px-2 py-1 rounded border border-white/10 ${coverageTab==='missingSpec' ? 'bg-white/10' : 'bg-black/30 hover:bg-white/5'}`}>missingSpec</button>
                <button onClick={() => setCoverageTab('missingCode')} className={`px-2 py-1 rounded border border-white/10 ${coverageTab==='missingCode' ? 'bg-white/10' : 'bg-black/30 hover:bg-white/5'}`}>missingCode</button>
                <button onClick={() => setCoverageTab('unknownQuark')} className={`px-2 py-1 rounded border border-white/10 ${coverageTab==='unknownQuark' ? 'bg-white/10' : 'bg-black/30 hover:bg-white/5'}`}>unknownQuark</button>
              </div>
            </div>
            <div className="text-[11px] text-canon-text-light mb-2">{coverageTitle}</div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[10px] text-canon-text-light/70">
                Export: prints to console; for missingSpec also generates AtomSpec stubs and tries to copy to clipboard.
              </div>
              <button
                onClick={onExportCoverage}
                className="px-2 py-1 rounded border border-white/10 bg-black/30 hover:bg-white/5 transition-colors text-[10px] font-mono"
              >
                Export
              </button>
            </div>
            <div className="max-h-[220px] overflow-y-auto rounded border border-white/10 bg-black/30">
              {coverageList.length ? (
                <ul className="divide-y divide-white/5">
                  {arr(coverageList).slice(0, 120).map((x, i) => (
                    <li key={i} className="p-2">
                      {coverageTab === 'unknownQuark' ? (
                        <>
                          <div className="font-mono text-[10px] text-white">{x}</div>
                          <div className="text-[10px] text-canon-text-light/80">{describeQuark(x).meaning}</div>
                        </>
                      ) : (
                        <div className="font-mono text-[10px] text-white break-all">{x}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-3 text-xs text-canon-text-light italic">Nothing here.</div>
              )}
            </div>
            <div className="mt-2 text-[10px] text-canon-text-light/70">
              Показаны первые 120 элементов (чтобы UI не умирал). Полный список можно вывести в console при необходимости.
            </div>
          </div>
        ) : null}
        <AtomExplorer
          atoms={atoms}
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
                        <span className="text-red-400 font-bold">{num(mind.threat, 0).toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Pressure:</span>
                        <span className="text-amber-400 font-bold">{num(mind.pressure, 0).toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Support:</span>
                        <span className="text-green-400 font-bold">{num(mind.support, 0).toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-canon-text-light">Crowd:</span>
                        <span className="text-blue-400 font-bold">{num(mind.crowd, 0).toFixed(3)}</span>
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
            index={atomIndex}
            onJump={(id) => setSelected(atomIndex[id] ?? null)}
          />
        </div>
      </div>
    </div>
  );
}
