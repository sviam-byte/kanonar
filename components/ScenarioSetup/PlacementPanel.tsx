import React, { useMemo, useState } from 'react';

export function PlacementPanel({ draft, setDraft }: { draft: any; setDraft: (x: any) => void }) {
  const [charId, setCharId] = useState<string>(() => draft.characters?.[0]?.id || '');
  const [locId, setLocId] = useState<string>(() => (draft.locationSpecs?.[0]?.id || draft.locations?.[0]?.id || ''));

  const nav = useMemo(() => {
    const spec = (draft.locationSpecs || []).find((s: any) => s.id === locId);
    const loc = (draft.locations || []).find((l: any) => l.id === locId);
    return spec?.nodes ? spec : loc?.nav ? loc : null;
  }, [draft, locId]);

  const nodes = nav?.nodes || nav?.nav?.nodes || [];
  const placements = draft.placements || [];

  return (
    <div className="canon-card p-3">
      <div className="text-sm font-semibold mb-2">Placements</div>
      <div className="flex gap-2 mb-2">
        <select className="canon-input" value={charId} onChange={(e) => setCharId(e.target.value)}>
          {(draft.characters || []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.title || c.id}</option>
          ))}
        </select>
        <select className="canon-input" value={locId} onChange={(e) => setLocId(e.target.value)}>
          {[...(draft.locationSpecs || []).map((s: any) => s.id), ...(draft.locations || []).map((l: any) => l.id)]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((id: string) => <option key={id} value={id}>{id}</option>)}
        </select>
      </div>

      <div className="text-xs opacity-70 mb-2">Click a node to place selected character</div>

      <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto">
        {nodes.map((n: any) => (
          <button
            key={n.id}
            className="canon-card px-2 py-1 text-left hover:bg-white/5"
            onClick={() => {
              const next = placements.filter((p: any) => p.characterId !== charId);
              next.push({ characterId: charId, locationId: locId, nodeId: n.id, x: n.x, y: n.y });
              setDraft({ ...draft, placements: next });
            }}
          >
            <div className="text-xs font-medium">{n.id}</div>
            <div className="text-[10px] opacity-70">{Math.round(n.x)}, {Math.round(n.y)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
