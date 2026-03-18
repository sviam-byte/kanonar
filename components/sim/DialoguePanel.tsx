// components/sim/DialoguePanel.tsx
// Dedicated dialogue log panel showing structured speech exchanges.

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
        <div style={{ marginLeft: 20, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
      )}

      {entry.recipients.length > 0 && (
        <div style={{ marginLeft: 20, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
      )}
    </div>
  );
};

export const DialoguePanel: React.FC<Props> = ({ world, actorLabels, maxEntries = 50 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<DialogueEntry[]>(() => {
    if (!world) return [];
    return getDialogueLog(world).slice(-maxEntries);
  }, [world, maxEntries]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  if (!entries.length) {
    return (
      <div style={{ padding: 16, color: '#475569', fontSize: 11, fontStyle: 'italic' }}>
        Пока тишина…
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: '100%', padding: '4px 0' }}>
      {entries.map((e, i) => <EntryRow key={i} entry={e} labels={actorLabels} />)}
    </div>
  );
};
