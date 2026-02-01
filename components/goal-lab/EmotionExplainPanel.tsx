import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

function findAtom(atoms: ContextAtom[], id: string) {
  return atoms.find(a => a?.id === id) || null;
}

function getM(atoms: ContextAtom[], id: string, fb = 0) {
  const a = findAtom(atoms, id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fb;
}

function getOrigin(atoms: ContextAtom[], id: string): string {
  const a = findAtom(atoms, id);
  return (a as any)?.origin || (a as any)?.o || 'unknown';
}

function isOverrideOrigin(origin: string) {
  return String(origin).toLowerCase().includes('override');
}

type Row = {
  id: string;
  label: string;
  value: number;
  origin: string;
  curve?: { raw?: number; x1?: number; preset?: string; bias?: number; gain?: number };
};

export const EmotionExplainPanel: React.FC<{
  selfId: string;
  atoms: ContextAtom[];
  manualAtoms?: ContextAtom[];
  onChangeManualAtoms?: (atoms: ContextAtom[]) => void;
}> = ({ selfId, atoms, manualAtoms, onChangeManualAtoms }) => {
  const model = useMemo(() => {
    // Inputs we care about for explanation (keep minimal and stable)
    const ids = {
      threat: `threat:final:${selfId}`,
      unc: `ctx:uncertainty:${selfId}`,
      pub: `ctx:publicness:${selfId}`,
      surv: `ctx:surveillance:${selfId}`,
      cover: `world:map:cover:${selfId}`,
      escape: `world:map:escape:${selfId}`,
      // optional
      norm: `ctx:normPressure:${selfId}`,
      intimacy: `ctx:intimacy:${selfId}`,

      appThreat: `app:threat:${selfId}`,
      appUnc: `app:uncertainty:${selfId}`,
      appControl: `app:control:${selfId}`,
      appPressure: `app:pressure:${selfId}`,
      appAttach: `app:attachment:${selfId}`,

      fear: `emo:fear:${selfId}`,
      anger: `emo:anger:${selfId}`,
      shame: `emo:shame:${selfId}`,
      relief: `emo:relief:${selfId}`,
      resolve: `emo:resolve:${selfId}`,
      care: `emo:care:${selfId}`,
      arousal: `emo:arousal:${selfId}`,
      valence: `emo:valence:${selfId}`,
    };

    // Read inputs
    const threat = getM(atoms, ids.threat, 0);
    const unc = getM(atoms, ids.unc, 0);
    const pub = getM(atoms, ids.pub, 0);
    const surv = getM(atoms, ids.surv, 0);
    const cover = getM(atoms, ids.cover, 0.5);
    const escape = getM(atoms, ids.escape, 0.5);

    const norm = getM(atoms, ids.norm, clamp01(0.65 * surv + 0.35 * pub));
    const intimacy = getM(atoms, ids.intimacy, clamp01(1 - pub));

    // Appraisals (computed reference values, to explain even if app:* missing)
    const appControlRef = clamp01(0.45 * cover + 0.35 * escape + 0.20 * (1 - unc));
    const appPressureRef = clamp01(0.65 * norm + 0.35 * pub);
    const appAttachRef = clamp01(0.75 * intimacy + 0.25 * (1 - pub));

    // Actual app:* atoms if present (or manual overrides)
    const appThreat = getM(atoms, ids.appThreat, threat);
    const appUnc = getM(atoms, ids.appUnc, unc);
    const appControl = getM(atoms, ids.appControl, appControlRef);
    const appPressure = getM(atoms, ids.appPressure, appPressureRef);
    const appAttach = getM(atoms, ids.appAttach, appAttachRef);

    // Emotion formulas (same as deriveEmotionLayer@v1)
    const fearRef = clamp01(appThreat * (1 - appControl) * (0.5 + 0.5 * appUnc));
    const angerRef = clamp01(appThreat * appControl * (1 - appUnc) * (1 - appPressure));
    const shameRef = clamp01(appPressure * (0.6 + 0.4 * appThreat) * (1 - appAttach));
    const reliefRef = clamp01((1 - appThreat) * appControl);
    const resolveRef = clamp01(0.55 * appControl + 0.30 * angerRef + 0.15 * (1 - appUnc));
    const careRef = clamp01(appAttach * (0.65 + 0.35 * (1 - appThreat)));

    const arousalRef = clamp01(0.60 * appThreat + 0.20 * appUnc + 0.20 * appPressure);
    // valence in model is stored as 0..1 in v2 patch; if yours is signed, we'll just display raw atom too.
    const valenceAtom = getM(atoms, ids.valence, 0);

    // Read actual emotion atoms if present
    const fearAtom = getM(atoms, ids.fear, fearRef);
    const angerAtom = getM(atoms, ids.anger, angerRef);
    const shameAtom = getM(atoms, ids.shame, shameRef);
    const reliefAtom = getM(atoms, ids.relief, reliefRef);
    const resolveAtom = getM(atoms, ids.resolve, resolveRef);
    const careAtom = getM(atoms, ids.care, careRef);
    const arousalAtom = getM(atoms, ids.arousal, arousalRef);

    const curveOf = (atomId: string) => {
      const a = findAtom(atoms, atomId) as any;
      const p = a?.trace?.parts || a?.trace?.p || null;
      if (!p || typeof p !== 'object') return undefined;
      if (p.raw == null && p.x1 == null && p.preset == null) return undefined;
      return {
        raw: typeof p.raw === 'number' ? p.raw : undefined,
        x1: typeof p.x1 === 'number' ? p.x1 : undefined,
        preset: typeof p.preset === 'string' ? p.preset : undefined,
        bias: typeof p.bias === 'number' ? p.bias : undefined,
        gain: typeof p.gain === 'number' ? p.gain : undefined,
      };
    };

    const inputs: Row[] = [
      { id: ids.threat, label: 'threat.final', value: threat, origin: getOrigin(atoms, ids.threat) },
      { id: ids.unc, label: 'ctx.uncertainty', value: unc, origin: getOrigin(atoms, ids.unc) },
      { id: ids.pub, label: 'ctx.publicness', value: pub, origin: getOrigin(atoms, ids.pub) },
      { id: ids.surv, label: 'ctx.surveillance', value: surv, origin: getOrigin(atoms, ids.surv) },
      { id: ids.cover, label: 'world.map.cover', value: cover, origin: getOrigin(atoms, ids.cover) },
      { id: ids.escape, label: 'world.map.escape', value: escape, origin: getOrigin(atoms, ids.escape) },
      { id: ids.norm, label: 'ctx.normPressure', value: norm, origin: getOrigin(atoms, ids.norm) },
      { id: ids.intimacy, label: 'ctx.intimacy', value: intimacy, origin: getOrigin(atoms, ids.intimacy) },
    ];

    const app: Array<Row & { ref?: number }> = [
      { id: ids.appThreat, label: 'app.threat', value: appThreat, origin: getOrigin(atoms, ids.appThreat), ref: threat },
      { id: ids.appUnc, label: 'app.uncertainty', value: appUnc, origin: getOrigin(atoms, ids.appUnc), ref: unc },
      { id: ids.appControl, label: 'app.control', value: appControl, origin: getOrigin(atoms, ids.appControl), ref: appControlRef },
      { id: ids.appPressure, label: 'app.pressure', value: appPressure, origin: getOrigin(atoms, ids.appPressure), ref: appPressureRef },
      { id: ids.appAttach, label: 'app.attachment', value: appAttach, origin: getOrigin(atoms, ids.appAttach), ref: appAttachRef },
    ];

    const emo: Array<Row & { ref?: number }> = [
      { id: ids.fear, label: 'emo.fear', value: fearAtom, origin: getOrigin(atoms, ids.fear), ref: fearRef, curve: curveOf(ids.fear) },
      { id: ids.anger, label: 'emo.anger', value: angerAtom, origin: getOrigin(atoms, ids.anger), ref: angerRef, curve: curveOf(ids.anger) },
      { id: ids.shame, label: 'emo.shame', value: shameAtom, origin: getOrigin(atoms, ids.shame), ref: shameRef, curve: curveOf(ids.shame) },
      { id: ids.relief, label: 'emo.relief', value: reliefAtom, origin: getOrigin(atoms, ids.relief), ref: reliefRef, curve: curveOf(ids.relief) },
      { id: ids.resolve, label: 'emo.resolve', value: resolveAtom, origin: getOrigin(atoms, ids.resolve), ref: resolveRef, curve: curveOf(ids.resolve) },
      { id: ids.care, label: 'emo.care', value: careAtom, origin: getOrigin(atoms, ids.care), ref: careRef, curve: curveOf(ids.care) },
      { id: ids.arousal, label: 'emo.arousal', value: arousalAtom, origin: getOrigin(atoms, ids.arousal), ref: arousalRef },
      { id: ids.valence, label: 'emo.valence', value: valenceAtom, origin: getOrigin(atoms, ids.valence) },
    ];

    return {
      inputs: Array.isArray(inputs) ? inputs : [],
      app: Array.isArray(app) ? app : [],
      emo: Array.isArray(emo) ? emo : [],
    };
  }, [atoms, selfId]);

  const RowView = ({ r, showRef }: { r: any; showRef?: boolean }) => {
    const ov = isOverrideOrigin(r.origin);
    return (
      <div className={`border rounded p-2 ${ov ? 'border-orange-500/50 bg-orange-500/10' : 'border-canon-border/40 bg-black/15'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-canon-text truncate">{r.label}</div>
            <div className="text-[10px] font-mono text-canon-text-light/70 break-all">{r.id}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-mono text-canon-text">{Number(r.value).toFixed(3)}</div>
            <div className={`text-[10px] font-mono ${ov ? 'text-orange-200' : 'text-canon-text-light/60'}`}>
              origin: {String(r.origin)}
            </div>
          </div>
        </div>
        <div className="h-1.5 w-full bg-canon-bg-light rounded-full overflow-hidden mt-2">
          <div className="h-full bg-canon-accent" style={{ width: `${Math.min(100, Math.max(0, Number(r.value) * 100))}%` }} />
        </div>
        {showRef && typeof r.ref === 'number' ? (
          <div className="text-[10px] text-canon-text-light/70 mt-2">
            ref (computed): <span className="font-mono">{Number(r.ref).toFixed(3)}</span>
          </div>
        ) : null}

        {r.curve && (typeof r.curve.raw === 'number' || typeof r.curve.x1 === 'number') ? (
          <div className="text-[10px] text-canon-text-light/70 mt-1">
            curve: raw <span className="font-mono">{Number(r.curve.raw ?? 0).toFixed(3)}</span>
            {' '}→ x1 <span className="font-mono">{Number(r.curve.x1 ?? 0).toFixed(3)}</span>
            {' '}→ y <span className="font-mono">{Number(r.value).toFixed(3)}</span>
            {r.curve.preset ? (
              <span className="ml-2">
                preset=<span className="font-mono">{String(r.curve.preset)}</span>
              </span>
            ) : null}
            {typeof r.curve.bias === 'number' ? (
              <span className="ml-2">
                bias=<span className="font-mono">{Number(r.curve.bias).toFixed(2)}</span>
              </span>
            ) : null}
            {typeof r.curve.gain === 'number' ? (
              <span className="ml-2">
                gain=<span className="font-mono">{Number(r.curve.gain).toFixed(2)}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const upsert = (list: ContextAtom[], a: ContextAtom) => {
    const i = list.findIndex(x => x.id === a.id);
    if (i >= 0) {
      const next = list.slice();
      next[i] = a;
      return next;
    }
    return [...list, a];
  };

  const setOverride = (id: string, v01: number) => {
    if (!onChangeManualAtoms) return;
    const list = arr(manualAtoms);
    const a: ContextAtom = {
      id,
      ns: id.startsWith('app:') ? 'app' : 'emo',
      kind: id.startsWith('app:') ? 'appraisal_override' : 'emotion_override',
      origin: 'override',
      source: 'manual',
      magnitude: clamp01(v01),
      confidence: 1,
      tags: ['override'],
      label: `Override ${id}`,
      trace: { usedAtomIds: [id], notes: ['manual override from EmotionExplain'], parts: {} },
    } as any;
    onChangeManualAtoms(upsert(list, a));
  };

  return (
    <div className="space-y-4">
      <div className="border border-canon-border/40 rounded bg-black/10 p-3">
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider">Emotion Explain</div>
        <div className="text-[12px] text-canon-text-light mt-2">
          Показывает цепочку <span className="font-mono">inputs → app:* → emo:*</span> и подсвечивает <span className="text-orange-200">override</span>.
          Если <span className="font-mono">app:*</span> отсутствует, используется ref (computed) из базовых формул.
        </div>
        {onChangeManualAtoms ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="px-2 py-1 text-[11px] rounded border border-canon-border/60 bg-canon-bg-light hover:bg-canon-bg-light/70"
              onClick={() => setOverride(`app:control:${selfId}`, 0.95)}
              title="app:control высокий → fear падает, resolve растёт"
            >
              Boost control
            </button>
            <button
              className="px-2 py-1 text-[11px] rounded border border-canon-border/60 bg-canon-bg-light hover:bg-canon-bg-light/70"
              onClick={() => setOverride(`app:pressure:${selfId}`, 0.95)}
              title="app:pressure высокий → shame растёт, anger падает"
            >
              Boost pressure
            </button>
            <button
              className="px-2 py-1 text-[11px] rounded border border-orange-500/50 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20"
              onClick={() => onChangeManualAtoms(arr(manualAtoms).filter(a => !a.id.endsWith(`:${selfId}`) || (!a.id.startsWith('app:') && !a.id.startsWith('emo:'))))}
              title="Удалить manual overrides для app/emo по selfId"
            >
              Clear app/emo overrides
            </button>
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Inputs</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {arr(model?.inputs).map(r => <RowView key={r.id} r={r} />)}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Appraisals (app:*)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {arr(model?.app).map(r => <RowView key={r.id} r={r} showRef />)}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-canon-text uppercase tracking-wider mb-2">Emotions (emo:*)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {arr(model?.emo).map(r => <RowView key={r.id} r={r} showRef />)}
        </div>
      </div>
    </div>
  );
};
