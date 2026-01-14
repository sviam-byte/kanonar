// components/simlog/renderTickRU.ts
// Human-readable Russian narration for SimKit tick records.

import type { SimWorld, SimEvent, SimAction } from '../../lib/simkit/core/types';

type TickRecord = {
  tickIndex: number;
  chosen: Array<{ actorId: string; action: SimAction; score?: number; p?: number; reason?: string }>;
  events: SimEvent[];
  notes: string[];
};

function nameOf(world: SimWorld, id: string) {
  const c: any = world.characters?.[id];
  return String(c?.name ?? id);
}

function fmtDelta(d: any) {
  if (!d) return '';
  const parts: string[] = [];
  if (d.dHealth) parts.push(`здоровье ${d.dHealth > 0 ? '+' : ''}${d.dHealth.toFixed(2)}`);
  if (d.dStress) parts.push(`стресс ${d.dStress > 0 ? '+' : ''}${d.dStress.toFixed(2)}`);
  if (d.dEnergy) parts.push(`энергия ${d.dEnergy > 0 ? '+' : ''}${d.dEnergy.toFixed(2)}`);
  return parts.length ? ` (Δ: ${parts.join(', ')})` : '';
}

function renderActionRU(world: SimWorld, x: TickRecord['chosen'][number]) {
  const a = x.action;
  const A = nameOf(world, a.actorId);
  const B = a.targetId ? nameOf(world, String(a.targetId)) : null;
  const sp = (x.score != null) ? ` score=${x.score.toFixed(3)}` : '';
  const pp = (x.p != null) ? ` p=${x.p.toFixed(2)}` : '';
  const because = x.reason ? ` потому что ${x.reason}` : '';
  const tgt = B ? ` → ${B}` : '';

  const k = a.kind;
  if (k === 'rest') return `${A}: отдых${sp}${pp}${because}`;
  if (k === 'wait') return `${A}: ждёт${sp}${pp}${because}`;
  if (k === 'move_xy') {
    const x1 = Number((a.payload as any)?.x);
    const y1 = Number((a.payload as any)?.y);
    return `${A}: идёт по карте к (${Math.round(x1)},${Math.round(y1)})${sp}${pp}${because}`;
  }
  if (k === 'talk') return `${A}: говорит${tgt}${sp}${pp}${because}`;
  if (k === 'question_about') return `${A}: спрашивает${tgt}${sp}${pp}${because}`;
  if (k === 'negotiate') return `${A}: ведёт переговоры${tgt}${sp}${pp}${because}`;
  if (k === 'attack') return `${A}: атакует${tgt}${sp}${pp}${because}`;
  if (k === 'observe') return `${A}: осматривается${sp}${pp}${because}`;
  if (k === 'start_intent') return `${A}: начинает намерение${tgt}${sp}${pp}${because}`;
  if (k === 'continue_intent') return `${A}: продолжает намерение${sp}${pp}${because}`;
  if (k === 'abort_intent') return `${A}: прекращает намерение${sp}${pp}${because}`;
  return `${A}: ${k}${tgt}${sp}${pp}${because}`;
}

function renderEventRU(world: SimWorld, e: SimEvent) {
  if (e.type === 'speech:v1') {
    const p: any = e.payload || {};
    const A = nameOf(world, String(p.actorId));
    const B = nameOf(world, String(p.targetId));
    const txt = String(p.text ?? '');
    const vol = p.volume ? ` (${p.volume})` : '';
    const n = Array.isArray(p.atoms) ? p.atoms.length : 0;
    return `реплика: ${A} → ${B}${vol}${txt ? `: ${txt}` : ''}${n ? ` [атомов:${n}]` : ''}`;
  }
  if (e.type === 'action:move_xy') {
    const p: any = e.payload || {};
    const A = nameOf(world, String(p.actorId));
    return `движение: ${A} теперь в (${Math.round(p.x)},${Math.round(p.y)})`;
  }
  if (e.type === 'action:attack') {
    const p: any = e.payload || {};
    const A = nameOf(world, String(p.actorId));
    const B = nameOf(world, String(p.targetId));
    const d = p.selfDelta ? fmtDelta(p.selfDelta) : '';
    return `удар: ${A} бьёт ${B}${d}`;
  }
  if (e.type?.startsWith('action:')) {
    const p: any = e.payload || {};
    const d = p.selfDelta ? fmtDelta(p.selfDelta) : '';
    return `действие: ${e.type}${d}`;
  }
  return `событие: ${e.type}`;
}

export function renderTickRU(world: SimWorld, rec: TickRecord): string {
  const lines: string[] = [];
  for (const ch of rec.chosen) lines.push(renderActionRU(world, ch));
  for (const e of rec.events) lines.push(`  - ${renderEventRU(world, e)}`);
  return lines.join('\n');
}
