
import { PossibilityDef } from './catalog';

export const DEFAULT_POSSIBILITY_DEFS: PossibilityDef[] = [
  // --- HIDE ---
  {
    key: 'hide',
    kind: 'aff',
    label: 'Hide (use cover)',
    build: ({ selfId, atoms, helpers }) => {
      // use canonical world/map metrics
      // prefer world:map:cover if available, fallback to map:cover or ctx:cover
      const coverAtom = 
        helpers.findPrefix(`world:map:cover:${selfId}`)[0]?.id ||
        helpers.findPrefix(`map:cover:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:cover:${selfId}`)[0]?.id;

      const cover = coverAtom ? helpers.get(coverAtom, 0) : 0;

      if (cover < 0.05) return null;

      // visibility
      const visibilityAtom = 
        helpers.findPrefix(`world:loc:visibility:${selfId}`)[0]?.id ||
        helpers.findPrefix(`world:map:visibility:${selfId}`)[0]?.id ||
        helpers.findPrefix(`env_visibility`)[0]?.id;

      const vis = visibilityAtom ? helpers.get(visibilityAtom, 0.5) : 0.5;

      const magnitude = helpers.clamp01(0.7 * cover + 0.3 * (1 - vis));

      return {
        id: `aff:hide:${selfId}`,
        kind: 'aff',
        label: 'Hide',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        requires: [coverAtom || 'world:map:cover:*'],
        trace: { usedAtomIds: [coverAtom, visibilityAtom].filter(Boolean) as any, notes: ['cover->hide'] }
      };
    }
  },

  // --- ESCAPE ---
  {
    key: 'escape',
    kind: 'exit',
    label: 'Escape',
    build: ({ selfId, helpers }) => {
      const exitsAtom = 
        helpers.findPrefix(`world:map:exits:${selfId}`)[0]?.id ||
        helpers.findPrefix(`nav_exits_count`)[0]?.id;

      const escapeAtom = 
        helpers.findPrefix(`world:map:escape:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:escape`)[0]?.id;

      const exits = exitsAtom ? helpers.get(exitsAtom, 0) : 0;
      const esc = escapeAtom ? helpers.get(escapeAtom, 0) : 0;

      if (exits < 0.05 && esc < 0.05) return null;

      const magnitude = helpers.clamp01(0.5 * exits + 0.5 * esc);

      return {
        id: `exit:escape:${selfId}`,
        kind: 'exit',
        label: 'Escape',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        requires: [exitsAtom, escapeAtom].filter(Boolean) as any,
        trace: { usedAtomIds: [exitsAtom, escapeAtom].filter(Boolean) as any, notes: ['exits+escape'] }
      };
    }
  },

  // --- TALK PRIVATE (needs privacy / low publicness) ---
  {
    key: 'talk_private',
    kind: 'aff',
    label: 'Talk privately',
    build: ({ selfId, helpers }) => {
      const privacyAtom = 
        helpers.findPrefix(`world:loc:privacy:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:privacy:${selfId}`)[0]?.id;

      const publicAtom = 
        helpers.findPrefix(`world:loc:publicness:${selfId}`)[0]?.id ||
        helpers.findPrefix(`ctx:publicness:${selfId}`)[0]?.id;

      const privacy = privacyAtom ? helpers.get(privacyAtom, 0) : 0;
      const publicness = publicAtom ? helpers.get(publicAtom, 0) : 0.5;

      const magnitude = helpers.clamp01(0.7 * privacy + 0.3 * (1 - publicness));
      if (magnitude < 0.15) return null;

      return {
        id: `aff:talk:private:${selfId}`,
        kind: 'aff',
        label: 'Talk privately',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        requires: [privacyAtom, publicAtom].filter(Boolean) as any,
        trace: { usedAtomIds: [privacyAtom, publicAtom].filter(Boolean) as any }
      };
    }
  },

  // --- ATTACK (blocked by protocol or relation taboo) ---
  {
    key: 'attack',
    kind: 'aff',
    label: 'Attack (generic)',
    build: ({ selfId, helpers }) => {
      const noViolence = helpers.findPrefix(`con:protocol:noViolence`)[0]?.id;
      // if any taboo exists, we still return possibility but blocked; UI can show reason
      const taboo = helpers.findPrefix(`con:rel:taboo:attack:${selfId}:`);

      const blockedBy: string[] = [];
      if (noViolence) blockedBy.push(noViolence);
      for (const t of taboo) blockedBy.push(t.id);

      // if blocked, magnitude 1 but blockedBy explains; decision layer will gate it
      const magnitude = 1;

      return {
        id: `aff:attack:${selfId}`,
        kind: 'aff',
        label: 'Attack',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        blockedBy,
        trace: { usedAtomIds: blockedBy, notes: ['attack base possibility; gating later'] }
      };
    }
  },

  // --- OFFER: HELP (scene or npc) ---
  {
    key: 'help_offer',
    kind: 'off',
    label: 'Offer: help available',
    build: ({ selfId, helpers }) => {
      // if scene injected off:npc:help:* or similar, pass through
      const off = helpers.findPrefix('off:');
      const help = off.find(a => a.id.includes(':help'))?.id;
      if (!help) return null;

      const magnitude = helpers.get(help, 1);
      return {
        id: help,
        kind: 'off',
        label: 'Help offer',
        magnitude,
        confidence: 1,
        subjectId: selfId,
        trace: { usedAtomIds: [], notes: ['from scene/offers'], parts: { offerAtomId: help } }
      };
    }
  }
];
