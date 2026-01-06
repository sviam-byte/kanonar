import React, { useMemo, useState } from 'react';
import { useSandbox } from '../contexts/SandboxContext';
import { relations as STATIC_RELATIONS } from '../data/relations';

type EdgeRow = {
  a: string;
  b: string;
  tags: string[];
  closeness?: number;
  loyalty?: number;
  hostility?: number;
  dependency?: number;
  authority?: number;

  // Social biography aggregate (shown later, kept for debugging).
  bioAspects?: Record<string, number>;
  bioVector?: Record<string, number>;
};

function clamp01(x: unknown, fallback = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampSigned(x: unknown, fallback = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-1, Math.min(1, n));
}

function uniq(xs: string[]) {
  return Array.from(new Set((Array.isArray(xs) ? xs : []).map(String).filter(Boolean)));
}

function pairKey(a: string, b: string) {
  return `${a}→${b}`;
}

function inferParticipants(ev: any, selfId: string): string[] {
  const out = new Set<string>();

  // 1) Explicit participants
  if (Array.isArray(ev?.participants)) {
    for (const p of ev.participants) if (p != null) out.add(String(p));
  }

  // 2) Common "second participant" fields
  const directKeys = [
    'targetId', 'otherId', 'other_id', 'partnerId', 'withId', 'to', 'against',
    'b', 'objectId', 'subjectId', 'enemyId', 'victimId'
  ];

  for (const k of directKeys) {
    const v = ev?.[k];
    if (v != null && String(v)) out.add(String(v));
  }

  // 3) payload.* (most common storage in historical events)
  const payload = ev?.payload || {};
  for (const k of ['targetId', 'otherId', 'partnerId', 'withId', 'to', 'against', 'b', 'objectId', 'subjectId']) {
    const v = payload?.[k];
    if (v != null && String(v)) out.add(String(v));
  }

  // 4) payload.participants (if stored there)
  if (Array.isArray(payload?.participants)) {
    for (const x of payload.participants) if (x != null) out.add(String(x));
  }

  // events are stored from the perspective of self
  out.delete(String(selfId));

  return Array.from(out.values()).filter(Boolean);
}

function parseStaticRelationsToDirectedRows(charIds: Set<string>): EdgeRow[] {
  // STATIC_RELATIONS keys are sorted "a__b"; emit directed rows for UI.
  const rows: EdgeRow[] = [];
  for (const k of Object.keys(STATIC_RELATIONS || {})) {
    const [x, y] = k.split('__');
    if (!x || !y) continue;
    if (!charIds.has(x) || !charIds.has(y)) continue;

    const rel = (STATIC_RELATIONS as any)[k];
    const weight = clamp01(rel?.weight ?? 0.6, 0.6);

    if (rel?.kind === 'kin') {
      // bidirectional kin-ish defaults
      rows.push({
        a: x,
        b: y,
        tags: ['kin', 'family'],
        closeness: clamp01(0.45 + 0.35 * weight),
        loyalty: clamp01(0.55 + 0.35 * weight),
        hostility: 0,
        dependency: clamp01(0.10 + 0.25 * weight),
        authority: 0.5,
      });
      rows.push({
        a: y,
        b: x,
        tags: ['kin', 'family'],
        closeness: clamp01(0.45 + 0.35 * weight),
        loyalty: clamp01(0.55 + 0.35 * weight),
        hostility: 0,
        dependency: clamp01(0.10 + 0.25 * weight),
        authority: 0.5,
      });
    } else if (rel?.kind === 'ally') {
      rows.push({ a: x, b: y, tags: ['ally'], closeness: 0.35, loyalty: 0.65, hostility: 0.05, dependency: 0.10, authority: 0.5 });
      rows.push({ a: y, b: x, tags: ['ally'], closeness: 0.35, loyalty: 0.65, hostility: 0.05, dependency: 0.10, authority: 0.5 });
    } else if (rel?.kind === 'rival') {
      rows.push({ a: x, b: y, tags: ['rival'], closeness: 0.15, loyalty: 0.25, hostility: 0.55, dependency: 0.05, authority: 0.5 });
      rows.push({ a: y, b: x, tags: ['rival'], closeness: 0.15, loyalty: 0.25, hostility: 0.55, dependency: 0.05, authority: 0.5 });
    } else if (rel?.kind === 'faction') {
      rows.push({ a: x, b: y, tags: ['faction'], closeness: 0.25, loyalty: 0.45, hostility: 0.10, dependency: 0.10, authority: 0.5 });
      rows.push({ a: y, b: x, tags: ['faction'], closeness: 0.25, loyalty: 0.45, hostility: 0.10, dependency: 0.10, authority: 0.5 });
    }
  }
  return rows;
}

function roleToRow(a: string, b: string, role: string): EdgeRow | null {
  // roles.relations entries are directional (a has role wrt b).
  const r = String(role || '');
  if (!r) return null;

  if (r === 'caretaker_of' || r === 'protector_of') {
    return {
      a,
      b,
      tags: ['protector', 'caretaker', 'kin'],
      closeness: 0.55,
      loyalty: 0.75,
      hostility: 0.05,
      dependency: 0.20,
      authority: 0.75,
    };
  }
  if (r === 'ward_of' || r === 'protected_by') {
    return {
      a,
      b,
      tags: ['protected', 'dependent', 'kin'],
      closeness: 0.55,
      loyalty: 0.65,
      hostility: 0.05,
      dependency: 0.55,
      authority: 0.35,
    };
  }
  if (r === 'subordinate_of') {
    return { a, b, tags: ['subordinate'], closeness: 0.25, loyalty: 0.55, hostility: 0.10, dependency: 0.35, authority: 0.25 };
  }
  if (r === 'superior_of') {
    return { a, b, tags: ['superior'], closeness: 0.25, loyalty: 0.55, hostility: 0.10, dependency: 0.15, authority: 0.80 };
  }
  if (r === 'rival_of') {
    return { a, b, tags: ['rival'], closeness: 0.10, loyalty: 0.20, hostility: 0.60, dependency: 0.05, authority: 0.50 };
  }
  if (r === 'ally_of') {
    return { a, b, tags: ['ally'], closeness: 0.30, loyalty: 0.65, hostility: 0.10, dependency: 0.10, authority: 0.50 };
  }

  return { a, b, tags: [r], closeness: 0.2, loyalty: 0.4, hostility: 0.15, dependency: 0.1, authority: 0.5 };
}

function eventTagsToBioDelta(tags: string[], domain: string, intensity: number) {
  // Convert event tags to incremental social-biography weights.
  const tagSet = new Set((tags || []).map(String));
  const magnitude = clamp01(intensity ?? 0.7, 0.7);

  const aspects: Record<string, number> = {};
  const vec: Record<string, number> = {};

  // aspects
  if (tagSet.has('devotion')) aspects.devotion = (aspects.devotion ?? 0) + 0.35 * magnitude;
  if (tagSet.has('obedience') || tagSet.has('submission')) aspects.submission = (aspects.submission ?? 0) + 0.35 * magnitude;
  if (tagSet.has('romance')) aspects.romance = (aspects.romance ?? 0) + 0.35 * magnitude;
  if (tagSet.has('friendship')) aspects.friendship = (aspects.friendship ?? 0) + 0.25 * magnitude;
  if (tagSet.has('betrayal') || domain === 'betrayal') aspects.betrayed_by = (aspects.betrayed_by ?? 0) + 0.40 * magnitude;
  if (tagSet.has('humiliation')) aspects.humiliated_by = (aspects.humiliated_by ?? 0) + 0.30 * magnitude;
  if (tagSet.has('support_interpersonal') || tagSet.has('care')) aspects.care_from = (aspects.care_from ?? 0) + 0.25 * magnitude;
  if (tagSet.has('shared_trauma') || (tagSet.has('social') && tagSet.has('trauma'))) aspects.shared_trauma = (aspects.shared_trauma ?? 0) + 0.40 * magnitude;

  // “rescue_actor” heuristic: if domain says rescue/help or tags include help/rescue/support.
  if (tagSet.has('help') || tagSet.has('rescue') || domain.includes('rescue')) {
    aspects.rescue_actor = (aspects.rescue_actor ?? 0) + 0.35 * magnitude;
  }

  // vector (signed)
  if (aspects.devotion) {
    vec.Loyalty = (vec.Loyalty ?? 0) + 0.45 * magnitude;
    vec.Self = (vec.Self ?? 0) - 0.20 * magnitude;
  }
  if (aspects.submission) {
    vec.Discipline = (vec.Discipline ?? 0) + 0.45 * magnitude;
    vec.Formalism = (vec.Formalism ?? 0) + 0.30 * magnitude;
  }
  if (aspects.shared_trauma) {
    vec.Bond = (vec.Bond ?? 0) + 0.40 * magnitude;
    vec.Cohesion = (vec.Cohesion ?? 0) + 0.35 * magnitude;
  }
  if (aspects.rescue_actor) {
    vec.Agency = (vec.Agency ?? 0) + 0.35 * magnitude;
    vec.Heroism = (vec.Heroism ?? 0) + 0.35 * magnitude;
  }
  if (aspects.betrayed_by) {
    vec.Trust = (vec.Trust ?? 0) - 0.40 * magnitude;
    vec.Paranoia = (vec.Paranoia ?? 0) + 0.35 * magnitude;
  }

  // clamp
  for (const k of Object.keys(aspects)) aspects[k] = clamp01(aspects[k]);
  for (const k of Object.keys(vec)) vec[k] = clampSigned(vec[k]);

  return { aspects, vec };
}

function foldBioIntoMetrics(base: EdgeRow, bioAspects: Record<string, number>, bioVector: Record<string, number>) {
  // Produce readable c/l/h/d/a even if there were no explicit relationship metrics.
  // This is intentionally “slow memory” flavored.
  const devotion = clamp01(bioAspects.devotion ?? 0);
  const submission = clamp01(bioAspects.submission ?? 0);
  const trauma = clamp01(bioAspects.shared_trauma ?? 0);
  const rescue = clamp01(bioAspects.rescue_actor ?? 0);
  const romance = clamp01(bioAspects.romance ?? 0);
  const friendship = clamp01(bioAspects.friendship ?? 0);
  const betrayed = clamp01(bioAspects.betrayed_by ?? 0);
  const harmed = clamp01(bioAspects.harmed ?? 0);

  const closenessFromBio = clamp01(0.10 + 0.35 * devotion + 0.25 * romance + 0.20 * friendship + 0.15 * trauma);
  const loyaltyFromBio = clamp01(0.15 + 0.55 * devotion + 0.20 * rescue + 0.10 * trauma);
  const hostilityFromBio = clamp01(0.05 + 0.65 * betrayed + 0.35 * harmed);
  const dependencyFromBio = clamp01(0.05 + 0.65 * submission + 0.15 * trauma);

  return {
    ...base,
    closeness: base.closeness ?? closenessFromBio,
    loyalty: base.loyalty ?? loyaltyFromBio,
    hostility: base.hostility ?? hostilityFromBio,
    dependency: base.dependency ?? dependencyFromBio,
    // authority usually role-driven; if none, infer mildly from submission
    authority: base.authority ?? clamp01(0.50 + 0.20 * submission - 0.10 * friendship),
    bioAspects,
    bioVector,
  };
}

export const RelationsLabPage: React.FC = () => {
  const { characters } = useSandbox();
  const [focusA, setFocusA] = useState<string>('');
  const [focusB, setFocusB] = useState<string>('');

  const ids = useMemo(() => characters.map(c => c.entityId), [characters]);

  const globalEdges: EdgeRow[] = useMemo(() => {
    const rows: EdgeRow[] = [];
    const charIds = new Set<string>(characters.map(c => c.entityId));

    // (1) static relations
    rows.push(...parseStaticRelationsToDirectedRows(charIds));

    // (2) roles.relations
    for (const c of characters) {
      const a = c.entityId;
      const relRoles: any[] = (c as any)?.roles?.relations || [];
      for (const rr of relRoles) {
        const b = String(rr?.other_id || rr?.otherId || '');
        const role = String(rr?.role || rr?.kind || '');
        if (!b || b === a || !charIds.has(b)) continue;
        const row = roleToRow(a, b, role);
        if (row) rows.push(row);
      }
    }

    // (3) historicalEvents → bio aspects/vector aggregated per dyad
    const bioAcc = new Map<string, { a: string; b: string; tags: string[]; aspects: Record<string, number>; vec: Record<string, number> }>();

    for (const c of characters) {
      const a = c.entityId;
      const evs: any[] = (c as any)?.historicalEvents || (c as any)?.history?.events || [];
      for (const ev of evs) {
        const participants: string[] = inferParticipants(ev, a);
        const tags: string[] = Array.isArray(ev?.tags) ? ev.tags.map(String) : [];
        const domain = String(ev?.domain ?? '');
        const intensity = clamp01(ev?.intensity ?? ev?.magnitude ?? 0.7, 0.7);

        for (const b of participants) {
          if (!b || b === a || !charIds.has(b)) continue;

          const k = pairKey(a, b);
          const slot = bioAcc.get(k) || { a, b, tags: [], aspects: {}, vec: {} };
          const d = eventTagsToBioDelta(tags, domain, intensity);

          slot.tags = uniq([...slot.tags, ...tags, 'bio']);
          for (const [ak, av] of Object.entries(d.aspects)) slot.aspects[ak] = clamp01((slot.aspects[ak] ?? 0) + av);
          for (const [vk, vv] of Object.entries(d.vec)) slot.vec[vk] = clampSigned((slot.vec[vk] ?? 0) + vv);

          bioAcc.set(k, slot);
        }
      }
    }

    for (const slot of bioAcc.values()) {
      rows.push(
        foldBioIntoMetrics(
          {
            a: slot.a,
            b: slot.b,
            tags: uniq(slot.tags),
          },
          slot.aspects,
          slot.vec,
        ),
      );
    }

    // merge by (a,b)
    const merged = new Map<string, EdgeRow>();
    for (const r of rows) {
      const k = pairKey(r.a, r.b);
      const prev = merged.get(k);
      if (!prev) {
        merged.set(k, { ...r, tags: uniq(r.tags || []) });
        continue;
      }
      merged.set(k, {
        a: r.a,
        b: r.b,
        tags: uniq([...(prev.tags || []), ...(r.tags || [])]),
        closeness: prev.closeness ?? r.closeness,
        loyalty: prev.loyalty ?? r.loyalty,
        hostility: prev.hostility ?? r.hostility,
        dependency: prev.dependency ?? r.dependency,
        authority: prev.authority ?? r.authority,
        bioAspects: { ...(prev.bioAspects || {}), ...(r.bioAspects || {}) },
        bioVector: { ...(prev.bioVector || {}), ...(r.bioVector || {}) },
      });
    }

    return Array.from(merged.values()).filter(e => e.a && e.b && e.a !== e.b);
  }, [characters]);

  const filtered = useMemo(() => {
    return globalEdges.filter(e => {
      if (focusA && e.a !== focusA) return false;
      if (focusB && e.b !== focusB) return false;
      return true;
    });
  }, [globalEdges, focusA, focusB]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-canon-text">Relations Lab (Global)</h1>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col">
          <label className="text-xs text-canon-text-light">A (source)</label>
          <select
            className="bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm"
            value={focusA}
            onChange={e => setFocusA(e.target.value)}
          >
            <option value="">(all)</option>
            {ids.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-canon-text-light">B (target)</label>
          <select
            className="bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm"
            value={focusB}
            onChange={e => setFocusB(e.target.value)}
          >
            <option value="">(all)</option>
            {ids.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-canon-text-light">
          Rows: <span className="text-canon-text font-bold">{filtered.length}</span>
        </div>
      </div>

      <div className="border border-canon-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 bg-canon-bg-light/40 text-xs text-canon-text-light px-3 py-2">
          <div className="col-span-2">A</div>
          <div className="col-span-2">B</div>
          <div className="col-span-3">tags</div>
          <div className="col-span-5">metrics (c/l/h/d/a)</div>
        </div>

        {filtered.map((e, i) => (
          <div key={`${e.a}-${e.b}-${i}`} className="grid grid-cols-12 px-3 py-2 text-sm border-t border-canon-border/40">
            <div className="col-span-2 font-mono text-canon-text">{e.a}</div>
            <div className="col-span-2 font-mono text-canon-text">{e.b}</div>
            <div className="col-span-3 text-canon-text-light">{(e.tags || []).join(', ') || '—'}</div>
            <div className="col-span-5 font-mono text-canon-text-light">
              {`${(e.closeness ?? 0).toFixed(2)}/${(e.loyalty ?? 0).toFixed(2)}/${(e.hostility ?? 0).toFixed(2)}/${(e.dependency ?? 0).toFixed(2)}/${(e.authority ?? 0.5).toFixed(2)}`}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-4 text-sm text-canon-text-light">No edges.</div>
        )}
      </div>

      <div className="text-xs text-canon-text-light">
        Примечание: это “глобальная связь” по sandbox-биографиям (static relations + roles.relations + historicalEvents). Дальше можно переключить источник на
        world.socialGraph и сделать редактор.
      </div>
    </div>
  );
};
