import type { GoalLabPipelineV1 } from '../pipeline/runPipelineV1';
import type { ContextAtom } from '../../context/v2/types';

type Opts = {
  maxAtoms?: number;
  maxGoals?: number;
  maxActions?: number;
};

function clampN(n: number, lo: number, hi: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function fmt2(x: any): string {
  const v = Number(x);
  if (!Number.isFinite(v)) return '0.00';
  return (Math.round(v * 100) / 100).toFixed(2);
}

function pickStage(r: GoalLabPipelineV1, stageId: string): any | null {
  return r.stages.find((s) => String((s as any).stage || (s as any).id) === stageId) ?? null;
}

function atomLine(a: ContextAtom): string {
  const id = String(a.id);
  const ns = String((a as any).ns ?? '').trim();
  const origin = String((a as any).origin ?? '');
  const mag = fmt2((a as any).magnitude ?? 0);
  const conf = fmt2((a as any).confidence ?? 1);
  return `- \`${id}\`  ns=\`${ns}\` origin=\`${origin}\` mag=${mag} conf=${conf}`;
}

function uniq(xs: string[]): string[] {
  const s = new Set<string>();
  for (const x of xs) if (x) s.add(x);
  return [...s];
}

export function generateGoalLabReportMarkdown(r: GoalLabPipelineV1, opts: Opts = {}): string {
  const maxAtoms = clampN(opts.maxAtoms ?? 60, 10, 400);
  const maxGoals = clampN(opts.maxGoals ?? 18, 5, 120);
  const maxActions = clampN(opts.maxActions ?? 12, 5, 120);

  const s0 = pickStage(r, 'S0');
  const s1 = pickStage(r, 'S1');
  const s2 = pickStage(r, 'S2');
  const s7 = pickStage(r, 'S7');
  const s8 = pickStage(r, 'S8');

  const atoms: ContextAtom[] = (s0?.atoms ?? s0?.artifacts?.atoms ?? []) as any;
  const signal = (s2?.signalField ?? s2?.artifacts?.signalField ?? null) as any;
  const goals = (s7?.goals ?? s7?.artifacts?.goals ?? s7?.artifacts?.ecology ?? []) as any[];
  const decision = (s8?.decision ?? s8?.artifacts?.decision ?? null) as any;

  // Try to read action candidates from new-style S8.
  const ranked = (decision?.ranked ?? s8?.artifacts?.ranked ?? []) as any[];
  const best = (decision?.best ?? s8?.artifacts?.best ?? null) as any;

  const usedAtomIdsBest: string[] = uniq([
    ...(best?.supportAtoms ?? []).map((a: any) => String(a?.id ?? '')),
    ...((best?.trace?.usedAtomIds ?? []) as string[]).map(String),
  ]);

  const lines: string[] = [];

  lines.push(`# GoalLab Explainability Report`);
  lines.push(``);
  lines.push(`**selfId**: \`${r.selfId}\``);
  lines.push(`**tick**: ${r.tick}`);
  if ((r as any).step) {
    const step = (r as any).step;
    lines.push(
      `**step**: t=${step.t} dt=${step.dt} seed=\`${String(step.seed)}\` events=${(step.events?.length ?? 0)}`
    );
  }
  lines.push(``);

  // 1) Atoms.
  lines.push(`## 1) Inputs: atoms/events that drive the pipeline`);
  lines.push(`Atoms in S0: **${atoms.length}** (showing up to ${maxAtoms})`);
  lines.push(``);
  for (const a of atoms.slice(0, maxAtoms)) lines.push(atomLine(a));
  if (atoms.length > maxAtoms) lines.push(`- … (${atoms.length - maxAtoms} more)`);
  lines.push(``);

  // 2) SignalField.
  lines.push(`## 2) SignalField (channels)`);
  if (!signal) {
    lines.push(`(signalField not found in S2)`);
  } else {
    const byCh = signal.byChannel ?? signal.byCh ?? {};
    const chs = Object.keys(byCh);
    lines.push(`Channels: ${chs.map((c) => `\`${c}\``).join(', ')}`);
    lines.push(``);
    for (const ch of chs) {
      const v = byCh[ch]?.raw_value ?? byCh[ch]?.rawValue ?? 0;
      const srcCount = (byCh[ch]?.sources?.length ?? 0);
      lines.push(`- \`${ch}\`: value=${fmt2(v)} sources=${srcCount}`);
    }
  }
  lines.push(``);

  // 3) Goals.
  lines.push(`## 3) Goals: where they come from`);
  if (!goals?.length) {
    lines.push(`(goals not found in S7)`);
  } else {
    const sorted = [...goals].sort(
      (a, b) => Number((b?.v ?? b?.value ?? 0)) - Number((a?.v ?? a?.value ?? 0))
    );
    lines.push(`Goals in S7: **${goals.length}** (showing top ${maxGoals})`);
    lines.push(``);
    for (const g of sorted.slice(0, maxGoals)) {
      const id = String(g?.domain ?? g?.id ?? g?.goalId ?? 'goal');
      const v = fmt2(g?.v ?? g?.value ?? 0);
      const parts = g?.parts ?? {};
      const why = parts?.activationHysteresis
        ? ` (EMA after=${fmt2(parts.activationHysteresis.after)} alpha=${fmt2(parts.activationHysteresis.alpha)})`
        : '';
      lines.push(`- **${id}**: score=${v}${why}`);

      const contrib = (parts?.contribs ?? parts?.contributions ?? null) as any;
      const used = (g?.trace?.usedAtomIds ?? parts?.usedAtomIds ?? []) as string[];
      if (Array.isArray(used) && used.length) {
        lines.push(
          `  - uses atoms: ${used
            .slice(0, 10)
            .map((x) => `\`${x}\``)
            .join(', ')}${used.length > 10 ? ' …' : ''}`
        );
      }
      if (contrib && typeof contrib === 'object') {
        const keys = Object.keys(contrib).slice(0, 6);
        if (keys.length) lines.push(`  - contrib keys: ${keys.map((k) => `\`${k}\``).join(', ')}`);
      }
    }
  }
  lines.push(``);

  // 4) Actions/Decision.
  lines.push(`## 4) Actions: how action space is constructed and ranked`);
  if (!decision && !ranked.length) {
    lines.push(`(decision not found in S8)`);
  } else {
    const temp = decision?.temperature ?? decision?.T ?? decision?.temp ?? null;
    lines.push(`Decision params: temperature=${temp ?? '(unknown)'}`);
    lines.push(`Ranked actions: **${ranked.length}** (showing top ${maxActions})`);
    lines.push(``);
    for (const item of ranked.slice(0, maxActions)) {
      const a = item.action ?? item;
      const q = item.q ?? item.score ?? null;
      const id = String(a?.id ?? a?.actionId ?? a?.kind ?? 'action');
      const kind = String(a?.kind ?? a?.type ?? '');
      const cost = fmt2(a?.cost ?? 0);
      const conf = fmt2(a?.confidence ?? 1);
      lines.push(`- \`${id}\` kind=\`${kind}\` Q=${q != null ? fmt2(q) : '(n/a)'} cost=${cost} conf=${conf}`);
      const dg = a?.deltaGoals ?? null;
      if (dg && typeof dg === 'object') {
        const pairs = Object.entries(dg)
          .slice(0, 6)
          .map(([k, v]) => `${k}:${fmt2(v)}`);
        if (pairs.length) lines.push(`  - Δgoals: ${pairs.join(', ')}`);
      }
    }
    lines.push(``);
    lines.push(`### Selected best`);
    if (!best) {
      lines.push(`(best not found)`);
    } else {
      lines.push(`- id=\`${String(best.id ?? best.actionId ?? best.kind ?? 'best')}\` kind=\`${String(best.kind ?? best.type ?? '')}\``);
      if (usedAtomIdsBest.length) {
        lines.push(
          `- support atoms: ${usedAtomIdsBest
            .slice(0, 16)
            .map((x) => `\`${x}\``)
            .join(', ')}${usedAtomIdsBest.length > 16 ? ' …' : ''}`
        );
      }
    }
  }
  lines.push(``);

  // 5) Diagram (Mermaid).
  lines.push(`## 5) Diagram`);
  lines.push('```mermaid');
  lines.push('flowchart TD');
  lines.push('  A[Atoms + Events (S0)] --> B[SignalField (S2)]');
  lines.push('  B --> C[Goal Ecology + EMA (S7)]');
  lines.push('  C --> D[ActionCandidates (S8)]');
  lines.push('  D --> E[Decision: ranked + best]');
  lines.push('  E --> F[WorldΔ / eventLog]');
  lines.push('  F --> A');
  lines.push('```');
  lines.push(``);

  return lines.join('\n');
}
