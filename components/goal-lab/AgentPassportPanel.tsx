import React, { useMemo, useState } from 'react';

type AnyAtom = any;

const num = (x: any, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
const fmt = (x: any) => {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
};

function byId(atoms: AnyAtom[]) {
  const m = new Map<string, AnyAtom>();
  for (const a of Array.isArray(atoms) ? atoms : []) {
    const id = String(a?.id || '');
    if (id) m.set(id, a);
  }
  return m;
}

function pickAxis(atomsIdx: Map<string, AnyAtom>, selfId: string, axis: string) {
  return (
    atomsIdx.get(`ctx:final:${axis}:${selfId}`) ||
    atomsIdx.get(`ctx:${axis}:${selfId}`) ||
    atomsIdx.get(`ctx:${axis}`) ||
    null
  );
}

function pickSum(atomsIdx: Map<string, AnyAtom>, selfId: string, k: string) {
  return atomsIdx.get(`sum:${k}:${selfId}`) || null;
}

function pickEmo(atomsIdx: Map<string, AnyAtom>, selfId: string, k: string) {
  return atomsIdx.get(`emo:${k}:${selfId}`) || null;
}

function pickDrv(atomsIdx: Map<string, AnyAtom>, selfId: string, k: string) {
  return atomsIdx.get(`drv:${k}:${selfId}`) || atomsIdx.get(`drv:${k}`) || null;
}

function pickGoalDom(atomsIdx: Map<string, AnyAtom>, selfId: string, k: string) {
  return atomsIdx.get(`goal:domain:${k}:${selfId}`) || atomsIdx.get(`goal:domain:${k}`) || null;
}

function TraceView({ atom }: { atom: AnyAtom | null }) {
  if (!atom) return null;
  const t = atom?.trace || {};
  const used = Array.isArray(t?.usedAtomIds) ? t.usedAtomIds : [];
  const parts = t?.parts || null;
  const notes = Array.isArray(t?.notes) ? t.notes : [];
  return (
    <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
      <div className="text-[10px] uppercase tracking-wider opacity-70">trace</div>
      {used.length ? (
        <div className="mt-1">
          <div className="text-[10px] opacity-60">usedAtomIds</div>
          <div className="text-[11px] font-mono whitespace-pre-wrap break-words opacity-90">
            {used.slice(0, 32).join('\n')}
            {used.length > 32 ? `\n… +${used.length - 32} more` : ''}
          </div>
        </div>
      ) : null}
      {parts ? (
        <div className="mt-2">
          <div className="text-[10px] opacity-60">parts</div>
          <div className="text-[11px] font-mono whitespace-pre-wrap break-words opacity-90">
            {JSON.stringify(parts, null, 2)}
          </div>
        </div>
      ) : null}
      {notes.length ? (
        <div className="mt-2">
          <div className="text-[10px] opacity-60">notes</div>
          <div className="text-[11px] whitespace-pre-wrap break-words opacity-90">
            {notes.slice(0, 8).join('\n')}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricRow({
  label,
  atom,
  onInspect,
}: {
  label: string;
  atom: AnyAtom | null;
  onInspect?: (a: AnyAtom) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="text-[12px] opacity-80 truncate">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-[12px] font-mono">{atom ? fmt(atom.magnitude ?? atom.m) : '—'}</div>
        {atom ? (
          <button
            className="px-2 py-1 text-[10px] rounded border border-white/10 bg-white/5 hover:bg-white/10"
            onClick={() => onInspect?.(atom)}
            title={String(atom.id)}
          >
            why
          </button>
        ) : null}
      </div>
    </div>
  );
}

type DyadGroup = {
  targetId: string;
  baseId: string; // tom:dyad:final:self:target
  metrics: Record<string, AnyAtom>;
};

function DyadGroupCard({ g }: { g: DyadGroup }) {
  const m = g.metrics;
  const trust = m.trust ? num(m.trust.magnitude ?? m.trust.m ?? 0) : NaN;
  const threat = m.threat ? num(m.threat.magnitude ?? m.threat.m ?? 0) : NaN;
  const hostility = m.hostility ? num(m.hostility.magnitude ?? m.hostility.m ?? 0) : NaN;
  const respect = m.respect ? num(m.respect.magnitude ?? m.respect.m ?? 0) : NaN;
  const uncertainty = m.uncertainty ? num(m.uncertainty.magnitude ?? m.uncertainty.m ?? 0) : NaN;

  return (
    <div className="rounded border border-white/10 bg-black/15 p-2">
      <div className="text-[11px] font-mono opacity-90 truncate" title={g.baseId}>
        {g.baseId}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <span className="opacity-60">trust</span>
          <span className="font-mono">{fmt(trust)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="opacity-60">threat</span>
          <span className="font-mono">{fmt(threat)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="opacity-60">hostility</span>
          <span className="font-mono">{fmt(hostility)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="opacity-60">respect</span>
          <span className="font-mono">{fmt(respect)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="opacity-60">uncertainty</span>
          <span className="font-mono">{fmt(uncertainty)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Read-only "passport" view of a single agent's contextual signals.
 * Keeps trace details in a collapsible "why" panel for debugging.
 */
export function AgentPassportPanel({
  atoms,
  selfId,
  title,
}: {
  atoms: AnyAtom[];
  selfId: string;
  title?: string;
}) {
  const idx = useMemo(() => byId(atoms), [atoms]);
  const [inspectAtom, setInspectAtom] = useState<AnyAtom | null>(null);

  const axes = useMemo(() => {
    const keys: Array<[string, string]> = [
      ['Danger', 'danger'],
      ['Control', 'control'],
      ['Uncertainty', 'uncertainty'],
      ['Norm pressure', 'normPressure'],
      ['Publicness', 'publicness'],
      ['Surveillance', 'surveillance'],
      ['Intimacy', 'intimacy'],
      ['Scarcity', 'scarcity'],
      ['Time pressure', 'timePressure'],
    ];
    return keys.map(([label, k]) => ({ label, atom: pickAxis(idx, selfId, k) }));
  }, [idx, selfId]);

  const summary = useMemo(() => {
    const keys: Array<[string, string]> = [
      ['Threat level', 'threatLevel'],
      ['Coping', 'coping'],
      ['Tension', 'tension'],
      ['Clarity', 'clarity'],
      ['Social exposure', 'socialExposure'],
      ['Norm risk', 'normRisk'],
      ['Intimacy index', 'intimacyIndex'],
    ];
    return keys.map(([label, k]) => ({ label, atom: pickSum(idx, selfId, k) }));
  }, [idx, selfId]);

  const emotions = useMemo(() => {
    const keys: Array<[string, string]> = [
      ['Fear', 'fear'],
      ['Anger', 'anger'],
      ['Shame', 'shame'],
      ['Relief', 'relief'],
      ['Resolve', 'resolve'],
      ['Care', 'care'],
    ];
    return keys.map(([label, k]) => ({ label, atom: pickEmo(idx, selfId, k) }));
  }, [idx, selfId]);

  const drivers = useMemo(() => {
    const keys: Array<[string, string]> = [
      ['Safety need', 'safetyNeed'],
      ['Control need', 'controlNeed'],
      ['Affiliation need', 'affiliationNeed'],
      ['Status need', 'statusNeed'],
      ['Rest need', 'restNeed'],
      ['Curiosity need', 'curiosityNeed'],
    ];
    return keys.map(([label, k]) => ({ label, atom: pickDrv(idx, selfId, k) }));
  }, [idx, selfId]);

  const goalDomains = useMemo(() => {
    const keys: Array<[string, string]> = [
      ['Safety', 'safety'],
      ['Affiliation', 'affiliation'],
      ['Status', 'status'],
      ['Exploration', 'exploration'],
      ['Order', 'order'],
    ];
    return keys.map(([label, k]) => ({ label, atom: pickGoalDom(idx, selfId, k) }));
  }, [idx, selfId]);

  const dyads = useMemo<DyadGroup[]>(() => {
    const prefix = `tom:dyad:final:${selfId}:`;
    const groups = new Map<string, DyadGroup>();
    for (const a of Array.isArray(atoms) ? atoms : []) {
      const id = String(a?.id || '');
      if (!id.startsWith(prefix)) continue;
      // Expected shape: tom:dyad:final:self:target:metric.
      const parts = id.split(':');
      // [tom, dyad, final, self, target, metric]
      if (parts.length < 6) continue;
      const targetId = parts[4];
      const metric = parts.slice(5).join(':'); // tolerate extra colons in metric names.
      const baseId = parts.slice(0, 5).join(':');
      if (!groups.has(baseId)) groups.set(baseId, { targetId, baseId, metrics: {} });
      groups.get(baseId)!.metrics[metric] = a;
    }
    // Sort by threat desc if it exists.
    return Array.from(groups.values())
      .sort((x, y) => {
        const xt = num(x.metrics.threat?.magnitude ?? x.metrics.threat?.m ?? 0, 0);
        const yt = num(y.metrics.threat?.magnitude ?? y.metrics.threat?.m ?? 0, 0);
        return yt - xt;
      })
      .slice(0, 40);
  }, [atoms, selfId]);

  return (
    <div className="rounded-xl border border-canon-border bg-canon-bg-light/30 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[12px] font-semibold opacity-90">
          {title || 'Agent passport'} <span className="font-mono opacity-70">{selfId}</span>
        </div>
        {inspectAtom ? (
          <button
            className="px-2 py-1 text-[11px] rounded border border-white/10 bg-white/5 hover:bg-white/10"
            onClick={() => setInspectAtom(null)}
          >
            close why
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-black/10 p-2">
          <div className="text-[11px] font-semibold opacity-80 mb-2">Situation (ctx axes)</div>
          <div className="divide-y divide-white/5">
            {axes.map(r => (
              <MetricRow key={r.label} label={r.label} atom={r.atom} onInspect={setInspectAtom} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-2">
          <div className="text-[11px] font-semibold opacity-80 mb-2">Summary (prototype metrics)</div>
          <div className="divide-y divide-white/5">
            {summary.map(r => (
              <MetricRow key={r.label} label={r.label} atom={r.atom} onInspect={setInspectAtom} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-2">
          <div className="text-[11px] font-semibold opacity-80 mb-2">Affect (emo)</div>
          <div className="divide-y divide-white/5">
            {emotions.map(r => (
              <MetricRow key={r.label} label={r.label} atom={r.atom} onInspect={setInspectAtom} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-2">
          <div className="text-[11px] font-semibold opacity-80 mb-2">Motivation (drivers + goal domains)</div>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">drivers</div>
          <div className="divide-y divide-white/5">
            {drivers.map(r => (
              <MetricRow key={r.label} label={r.label} atom={r.atom} onInspect={setInspectAtom} />
            ))}
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-wider opacity-60 mb-1">goal domains</div>
          <div className="divide-y divide-white/5">
            {goalDomains.map(r => (
              <MetricRow key={r.label} label={r.label} atom={r.atom} onInspect={setInspectAtom} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-2">
        <div className="text-[11px] font-semibold opacity-80 mb-2">ToM dyads (final)</div>
        {dyads.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {dyads.map(g => (
              <DyadGroupCard key={g.baseId} g={g} />
            ))}
          </div>
        ) : (
          <div className="text-[12px] opacity-60">no tom:dyad:final:* atoms for this self</div>
        )}
      </div>

      {inspectAtom ? <TraceView atom={inspectAtom} /> : null}
    </div>
  );
}
