// components/sim/SetupPanel.tsx
// Multi-location setup: select locations/characters, preview on MacroMap,
// and configure character placements before launching the simulator.

import React, { useMemo, useState, useCallback } from 'react';
import type { CharacterEntity, LocationEntity } from '../../types';
import { MacroMap } from './MacroMap';
import type { SimWorld } from '../../lib/simkit/core/types';
import { autoPlaceCharacters } from '../../lib/simkit/adapters/autoPlace';

type StartConfig = {
  selectedCharIds: string[];
  selectedLocIds: string[];
  placements: Record<string, string>;
};

type Props = {
  characters: CharacterEntity[];
  locations: LocationEntity[];
  onStart: (config: StartConfig) => void;
};

export const SetupPanel: React.FC<Props> = ({ characters, locations, onStart }) => {
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([]);
  // characterId -> locationId
  const [placements, setPlacements] = useState<Record<string, string>>({});

  const toggleChar = useCallback((id: string) => {
    setSelectedCharIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];

      setPlacements((current) => {
        const out = { ...current };
        if (!next.includes(id)) {
          delete out[id];
        } else if (!out[id] && selectedLocIds.length) {
          // Default assignment for newly selected character.
          out[id] = selectedLocIds[0];
        }
        return out;
      });

      return next;
    });
  }, [selectedLocIds]);

  const toggleLoc = useCallback((id: string) => {
    setSelectedLocIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];

      // Reassign characters from removed location to first available location.
      if (!next.includes(id)) {
        setPlacements((current) => {
          const out = { ...current };
          for (const [cid, lid] of Object.entries(out)) {
            if (lid === id) out[cid] = next[0] || '';
          }
          return out;
        });
      }

      return next;
    });
  }, []);

  const autoDistribute = useCallback(() => {
    if (!selectedCharIds.length || !selectedLocIds.length) return;

    const auto = autoPlaceCharacters(
      selectedCharIds,
      selectedLocIds,
      locations.filter((l) => selectedLocIds.includes(l.entityId)),
      characters.filter((c) => selectedCharIds.includes(c.entityId)),
    );
    setPlacements(auto);
  }, [selectedCharIds, selectedLocIds, locations, characters]);

  const previewWorld = useMemo<SimWorld | null>(() => {
    if (!selectedLocIds.length) return null;

    const selectedLocations = locations.filter((l) => selectedLocIds.includes(l.entityId));

    const worldLocations: SimWorld['locations'] = {};
    for (const l of selectedLocations) {
      worldLocations[l.entityId] = {
        id: l.entityId,
        name: l.title || l.entityId,
        neighbors: Object.keys(l.connections || {}).filter((n) => selectedLocIds.includes(n)),
        hazards: {},
        tags: [],
        entity: l,
      };
    }

    const worldCharacters: SimWorld['characters'] = {};
    for (const cid of selectedCharIds) {
      const ch = characters.find((c) => c.entityId === cid);
      if (!ch) continue;
      const locId = placements[cid] || selectedLocIds[0] || '';
      worldCharacters[cid] = {
        id: cid,
        name: ch.title || cid,
        locId,
        stress: 0,
        health: 1,
        energy: 1,
        entity: ch,
      };
    }

    return {
      tickIndex: 0,
      seed: 0,
      characters: worldCharacters,
      locations: worldLocations,
      facts: {} as any,
      events: [],
    };
  }, [selectedLocIds, selectedCharIds, placements, locations, characters]);

  const canStart = selectedCharIds.length >= 2 && selectedLocIds.length >= 1;

  const moveCharToLoc = useCallback((charId: string, locId: string) => {
    if (!selectedLocIds.includes(locId)) return;
    setPlacements((current) => ({ ...current, [charId]: locId }));
  }, [selectedLocIds]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24, maxWidth: 960, margin: '20px auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>
        Kanonar Simulator
      </h1>
      <p style={{ color: '#64748b', fontSize: 12 }}>
        Выбери локации (1+) и персонажей (2+). Расставь персонажей по локациям или нажми «Авторасстановка».
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Персонажи ({selectedCharIds.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
            {characters.map((c) => {
              const sel = selectedCharIds.includes(c.entityId);
              const locId = placements[c.entityId];
              return (
                <div
                  key={c.entityId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 5,
                    background: sel ? '#1e3a5f' : '#0f172a', border: sel ? '1px solid #3b82f6' : '1px solid #1e293b',
                    cursor: 'pointer', fontSize: 12, transition: 'all 0.15s',
                  }}
                >
                  <input type="checkbox" checked={sel} onChange={() => toggleChar(c.entityId)} style={{ accentColor: '#3b82f6' }} />
                  <span style={{ flex: 1, fontWeight: sel ? 600 : 400, color: sel ? '#e2e8f0' : '#64748b' }}>
                    {c.title || c.entityId}
                  </span>
                  {sel && selectedLocIds.length > 1 && (
                    <select
                      value={locId || ''}
                      onChange={(e) => moveCharToLoc(c.entityId, e.target.value)}
                      style={{ fontSize: 10, background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 3, padding: '1px 4px' }}
                    >
                      {selectedLocIds.map((lid) => {
                        const ll = locations.find((l) => l.entityId === lid);
                        return <option key={lid} value={lid}>{ll?.title || lid}</option>;
                      })}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Локации ({selectedLocIds.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
            {locations.map((l) => {
              const sel = selectedLocIds.includes(l.entityId);
              const connectedTo = Object.keys(l.connections || {});
              const connectedSelected = connectedTo.filter((n) => selectedLocIds.includes(n));
              return (
                <label
                  key={l.entityId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 5,
                    background: sel ? '#1e3a5f' : '#0f172a', border: sel ? '1px solid #3b82f6' : '1px solid #1e293b',
                    cursor: 'pointer', fontSize: 12, transition: 'all 0.15s',
                  }}
                >
                  <input type="checkbox" checked={sel} onChange={() => toggleLoc(l.entityId)} style={{ accentColor: '#3b82f6' }} />
                  <span style={{ flex: 1, fontWeight: sel ? 600 : 400, color: sel ? '#e2e8f0' : '#64748b' }}>
                    {l.title || l.entityId}
                  </span>
                  {connectedSelected.length > 0 && (
                    <span style={{ fontSize: 9, color: '#475569' }}>→{connectedSelected.length}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {previewWorld && (
        <div style={{ border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
          <MacroMap
            world={previewWorld}
            onSelectAgent={() => {}}
            onSelectLocation={() => {}}
            onManualMove={(charId, toLocId) => moveCharToLoc(charId, toLocId)}
            height={300}
            width={900}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={autoDistribute}
          disabled={!canStart}
          style={{
            padding: '8px 20px', borderRadius: 6, border: '1px solid #334155', cursor: canStart ? 'pointer' : 'not-allowed',
            background: '#0f172a', color: canStart ? '#94a3b8' : '#475569', fontSize: 12, fontWeight: 600,
          }}
        >
          ↻ Авторасстановка
        </button>
        <button
          onClick={() => onStart({ selectedCharIds, selectedLocIds, placements })}
          disabled={!canStart}
          style={{
            padding: '8px 28px', borderRadius: 6, border: 'none', cursor: canStart ? 'pointer' : 'not-allowed',
            background: canStart ? '#3b82f6' : '#1e293b', color: canStart ? '#fff' : '#475569',
            fontSize: 14, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          ▶ Запуск
        </button>
      </div>
    </div>
  );
};
