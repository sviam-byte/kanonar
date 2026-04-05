// components/sim/DialoguePanel.tsx
// Dedicated dialogue log panel showing structured speech exchanges
// and atom reception with human-readable descriptions.

import React, { useMemo, useRef, useEffect } from 'react';
import type { SimWorld } from '../../lib/simkit/core/types';
import { getDialogueLog } from '../../lib/simkit/dialogue/dialogueState';
import type { DialogueEntry } from '../../lib/simkit/dialogue/types';

type Props = {
  world: SimWorld | null;
  actorLabels?: Record<string, string>;
  maxEntries?: number;
};

const ACT_ICONS: Record<string, string> = {
  inform: '💬', ask: '❓', propose: '📋', accept: '✅', reject: '❌',
  counter: '↩️', threaten: '⚠️', promise: '🤝', command: '📢',
  negotiate: '🤝',
};

const INTENT_BADGE: Record<string, { label: string; color: string }> = {
  truthful: { label: '', color: '' },
  selective: { label: 'SELECTIVE', color: '#f59e0b' },
  deceptive: { label: 'DECEPTIVE', color: '#ef4444' },
};

const VOLUME_STYLE: Record<string, { color: string; label: string }> = {
  whisper: { color: '#94a3b8', label: 'шёпот' },
  normal: { color: '#e2e8f0', label: '' },
  shout: { color: '#fbbf24', label: 'КРИК' },
};

// ── Human-readable atom descriptions ──
const ATOM_RU: Record<string, string> = {
  'danger': 'уровень опасности',
  'control': 'контроль ситуации',
  'uncertainty': 'неопределённость',
  'scarcity': 'нехватка ресурсов',
  'publicness': 'публичность',
  'normPressure': 'давление норм',
  'privacy': 'приватность',
  'stress': 'стресс',
  'fatigue': 'усталость',
  'comfort': 'комфорт',
  'noise': 'шум',
  'crowdDensity': 'плотность толпы',
  'temperature': 'температура',
  'tactical:threats': 'тактические угрозы',
  'tactical:allies': 'союзники рядом',
  'tactical:cover': 'укрытие',
  'tactical:advantage': 'тактическое преим.',
};

const ACCEPT_REASON_RU: Record<string, string> = {
  trust_high: 'высокое доверие',
  trust_medium: 'среднее доверие',
  trust_low: 'низкое доверие',
  compat_high: 'совместимость взглядов',
  no_speaker: 'наблюдение',
  observation: 'наблюдение',
};

function atomIdToRu(id: string): string {
  // Remove agent suffixes and ctx: prefix
  const clean = id
    .replace(/^ctx:observe:action:/, 'действие:')
    .replace(/^ctx:/, '')
    .replace(/^obs:nonverbal:[\w-]+:[\w-]+:/, 'невербальное:')
    .replace(/^obs:/, '')
    .replace(/:[\w-]+$/, '');
  return ATOM_RU[clean] || clean;
}

function describeAtomTransfer(atom: any, names: Record<string, string>): { what: string; why: string } {
  const id = String(atom.id || '');
  const mag = Number(atom.magnitude ?? 0);
  const src = String(atom.src || atom.source || atom.meta?.origin?.type || 'unknown');
  const from = atom.from || atom.meta?.from || atom.meta?.origin?.from || null;

  const what = atomIdToRu(id);
  const magPct = `${Math.round(mag * 100)}%`;
  const fromLabel = from ? (names[from] || from) : null;

  let why: string;
  if (src === 'observation' || id.includes('observe:action')) {
    why = fromLabel ? `наблюдение за ${fromLabel}` : 'наблюдение за обстановкой';
  } else if (src === 'speech') {
    why = fromLabel ? `${fromLabel} сообщил` : 'речь';
  } else if (id.includes('nonverbal')) {
    why = fromLabel ? `невербальные сигналы ${fromLabel}` : 'невербальные сигналы';
  } else {
    why = fromLabel ? `от ${fromLabel}` : 'контекст';
  }

  return { what: `${what} (${magPct})`, why };
}

function describeAcceptReason(info: any): string {
  const reasonKey = String(info?.reason || info?.acceptReason || '').trim();
  if (reasonKey && ACCEPT_REASON_RU[reasonKey]) return ACCEPT_REASON_RU[reasonKey];
  const trust = Number(info?.trust ?? 0.5);
  const compat = Number(info?.compat ?? 0.5);
  const parts: string[] = [];
  if (trust > 0.7) parts.push('высокое доверие');
  else if (trust > 0.4) parts.push('среднее доверие');
  else parts.push('низкое доверие');
  if (compat > 0.6) parts.push('совместимые взгляды');
  return parts.join(', ');
}

function name(id: string, labels?: Record<string, string>): string {
  return labels?.[id] || id;
}

const EntryRow: React.FC<{ entry: DialogueEntry; labels?: Record<string, string> }> = ({ entry, labels }) => {
  const icon = ACT_ICONS[entry.act] || '💬';
  const vol = VOLUME_STYLE[entry.volume] || VOLUME_STYLE.normal;
  const intent = INTENT_BADGE[entry.intent] || INTENT_BADGE.truthful;

  return (
    <div style={{
      padding: '6px 8px', marginBottom: 4, borderRadius: 4,
      background: entry.act === 'threaten' || entry.act === 'command' ? '#1c1917' : '#0f172a',
      borderLeft: `3px solid ${vol.color}`,
      fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ color: '#64748b', fontSize: 9 }}>T:{entry.tick}</span>
        <span>{icon}</span>
        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{name(entry.speakerId, labels)}</span>
        <span style={{ color: '#475569' }}>→</span>
        <span style={{ color: '#94a3b8' }}>{name(entry.targetId, labels)}</span>
        <span style={{ color: '#475569', fontSize: 9 }}>({entry.act})</span>
        {vol.label && <span style={{ color: vol.color, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{vol.label}</span>}
        {intent.label && (
          <span style={{
            color: intent.color, fontSize: 7, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: 1, padding: '1px 4px', borderRadius: 3, background: `${intent.color}15`,
          }}>
            {intent.label}
          </span>
        )}
      </div>

      <div style={{ color: vol.color, marginLeft: 20, marginBottom: 3 }}>
        «{entry.text}»
      </div>

      {entry.atoms.length > 0 && (
        <div style={{ marginLeft: 20, marginBottom: 3 }}>
          <div style={{ color: '#64748b', fontSize: 9, marginBottom: 2 }}>📦 что передано:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {entry.atoms.slice(0, 6).map((a, i) => (
              <span key={i} style={{
                padding: '1px 5px', borderRadius: 3, fontSize: 9,
                background: '#1e293b', color: '#94a3b8',
                border: a.trueMagnitude !== undefined ? '1px solid #ef444480' : '1px solid #334155',
              }}>
                {a.id.split(':').slice(-2).join(':')}={Math.round((a.magnitude ?? 0) * 100)}%
                {a.trueMagnitude !== undefined && (
                  <span style={{ color: '#ef4444', marginLeft: 3 }}>
                    (реал: {Math.round(a.trueMagnitude * 100)}%)
                  </span>
                )}
              </span>
            ))}
            {entry.atoms.length > 6 && (
              <span style={{ fontSize: 8, color: '#475569' }}>+{entry.atoms.length - 6}</span>
            )}
          </div>
        </div>
      )}

      {entry.recipients.length > 0 && (
        <div style={{ marginLeft: 20, marginTop: 3 }}>
          <div style={{ color: '#64748b', fontSize: 9, marginBottom: 2 }}>📥 кто принял:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {entry.recipients.map((r, i) => (
              <span key={i} style={{
                fontSize: 8, padding: '1px 4px', borderRadius: 2,
                background: r.accepted ? '#064e3b' : '#7f1d1d',
                color: r.accepted ? '#6ee7b7' : '#fca5a5',
              }}>
                {name(r.agentId, labels)}:
                {r.channel === 'overheard' ? '👂' : r.channel === 'distant' ? '📡' : ''}
                {r.accepted ? '✓' : '✗'}
                <span style={{ opacity: 0.6 }}> {Math.round(r.confidence * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Atom Exchange Row: shows observation/context atom transfers with descriptions ──
type AtomExchangeEntry = {
  tick: number;
  agentId: string;
  accepted: number;
  quarantined: number;
  rejected: number;
  items: Array<{ id: string; mag: string; src: string; from: string | null }>;
  acceptMeta?: any;
};

const AtomExchangeRow: React.FC<{ entry: AtomExchangeEntry; labels: Record<string, string> }> = ({ entry, labels }) => {
  const agentName = name(entry.agentId, labels);
  const acceptReason = describeAcceptReason(entry.acceptMeta);

  return (
    <div style={{
      padding: '5px 8px', marginBottom: 3, borderRadius: 4,
      background: '#0a0f1a',
      borderLeft: '3px solid #334155',
      fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ color: '#64748b', fontSize: 9 }}>T:{entry.tick}</span>
        <span>📥</span>
        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{agentName}</span>
        <span style={{ color: '#475569', fontSize: 9 }}>
          принял ✓{entry.accepted}{entry.quarantined ? ` ⏸${entry.quarantined}` : ''}{entry.rejected ? ` ✗${entry.rejected}` : ''}
        </span>
      </div>

      {entry.items.length > 0 && (
        <div style={{ marginLeft: 20 }}>
          {entry.items.slice(0, 5).map((item, i) => {
            const desc = describeAtomTransfer(item, labels);
            return (
              <div key={i} style={{ color: '#64748b', fontSize: 9, marginBottom: 1 }}>
                <span style={{ color: '#94a3b8' }}>{desc.what}</span>
                <span style={{ color: '#475569' }}> — {desc.why}</span>
              </div>
            );
          })}
          {entry.items.length > 5 && (
            <div style={{ color: '#475569', fontSize: 8 }}>+{entry.items.length - 5} ещё</div>
          )}
        </div>
      )}
      {!!acceptReason && (
        <div style={{ marginLeft: 20, color: '#475569', fontSize: 8 }}>
          причина принятия: {acceptReason}
        </div>
      )}
    </div>
  );
};

export const DialoguePanel: React.FC<Props> = ({ world, actorLabels, maxEntries = 50 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const names = actorLabels || {};

  const entries = useMemo<DialogueEntry[]>(() => {
    if (!world) return [];
    return getDialogueLog(world).slice(-maxEntries);
  }, [world, maxEntries]);

  // ── Collect atom exchange entries from debug:inbox facts ──
  const atomExchanges = useMemo<AtomExchangeEntry[]>(() => {
    if (!world) return [];
    const result: AtomExchangeEntry[] = [];
    const facts = world.facts as any;
    // Scan last 20 ticks for inbox debug data
    const currentTick = world.tickIndex ?? 0;
    for (let t = Math.max(0, currentTick - 20); t <= currentTick; t++) {
      const dbg = facts[`debug:inbox:${t}`];
      if (!dbg?.perAgent) continue;
      for (const [agentId, info] of Object.entries(dbg.perAgent as Record<string, any>)) {
        const acc = info.accepted || 0;
        const qua = info.quarantined || 0;
        const rej = info.rejected || 0;
        if (acc + qua + rej === 0) continue;
        result.push({
          tick: t,
          agentId,
          accepted: acc,
          quarantined: qua,
          rejected: rej,
          items: (info.acceptedItems || []).filter((it: any) => it && it.id),
          acceptMeta: info,
        });
      }
    }
    return result.slice(-maxEntries);
  }, [world, maxEntries]);

  // ── Merge and sort both types by tick ──
  const merged = useMemo(() => {
    const all: Array<{ tick: number; type: 'dialogue' | 'atoms'; data: any }> = [];
    for (const e of entries) all.push({ tick: e.tick, type: 'dialogue', data: e });
    for (const e of atomExchanges) all.push({ tick: e.tick, type: 'atoms', data: e });
    all.sort((a, b) => a.tick - b.tick);
    return all;
  }, [entries, atomExchanges]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [merged.length]);

  if (!merged.length) {
    return (
      <div style={{ padding: 16, color: '#475569', fontSize: 11, fontStyle: 'italic' }}>
        Пока тишина…
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: '100%', padding: '4px 0' }}>
      {merged.map((item, i) => {
        if (item.type === 'dialogue') {
          return <EntryRow key={`d${i}`} entry={item.data} labels={actorLabels} />;
        }
        return <AtomExchangeRow key={`a${i}`} entry={item.data} labels={names} />;
      })}
    </div>
  );
};
