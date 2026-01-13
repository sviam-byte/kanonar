import React from 'react';

export function LocationImportPanel({
  draft,
  setDraft,
}: {
  draft: any;
  setDraft: (x: any) => void;
}) {
  const specs = draft.locationSpecs || [];
  return (
    <div className="canon-card p-3">
      <div className="text-sm font-semibold mb-2">Location import (GoalLab)</div>
      <input
        type="file"
        accept="application/json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const txt = await f.text();
          const spec = JSON.parse(txt);
          setDraft({
            ...draft,
            locationSpecs: [...specs.filter((s: any) => s.id !== spec.id), spec],
          });
        }}
      />
      <div className="text-xs opacity-70 mt-2">
        Upload GoalLabLocationV1 JSON (nodes/edges/map/features).
      </div>
    </div>
  );
}
