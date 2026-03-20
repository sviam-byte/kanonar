// pages/ComparePage.tsx
// Compare mode: run two headless simulations with different character sets
// and inspect divergence in tension/actions.

import React, { useState, useCallback, useMemo } from 'react';
import { getEntitiesByType, getAllCharactersWithRuntime } from '../data';
import { EntityType } from '../enums';
import type { CharacterEntity, LocationEntity } from '../types';
import { runBatch, compareRuns, type RunConfig, type CompareResult } from '../lib/simkit/compare/batchRunner';
import { CompareView } from '../components/sim/CompareView';

export const CompareSimPage: React.FC = () => {
  const allCharacters = useMemo(() => getAllCharactersWithRuntime() as CharacterEntity[], []);
  const allLocations = useMemo(() => getEntitiesByType(EntityType.Location) as LocationEntity[], []);

  const [locId, setLocId] = useState('');
  const [charsA, setCharsA] = useState<string[]>([]);
  const [charsB, setCharsB] = useState<string[]>([]);
  const [ticks, setTicks] = useState(30);
  const [seed, setSeed] = useState(42);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [running, setRunning] = useState(false);

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of allCharacters) map[c.entityId] = c.title || c.entityId;
    return map;
  }, [allCharacters]);

  const toggleA = useCallback((id: string) => {
    setCharsA((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleB = useCallback((id: string) => {
    setCharsB((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const canRun = Boolean(locId) && charsA.length >= 2 && charsB.length >= 2;

  const handleRun = useCallback(() => {
    if (!canRun) return;
    setRunning(true);

    // Keep UI responsive while running two headless batches.
    setTimeout(() => {
      const selectedLocation = allLocations.filter((l) => l.entityId === locId);

      const makeConfig = (label: string, charIds: string[]): RunConfig => ({
        label,
        characters: allCharacters.filter((c) => charIds.includes(c.entityId)),
        locations: selectedLocation,
        placements: Object.fromEntries(charIds.map((id) => [id, locId])),
        seed,
        maxTicks: ticks,
      });

      const runA = runBatch(makeConfig('Run A', charsA));
      const runB = runBatch(makeConfig('Run B', charsB));
      setResult(compareRuns(runA, runB));
      setRunning(false);
    }, 50);
  }, [allCharacters, allLocations, canRun, charsA, charsB, locId, seed, ticks]);

  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace', padding: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Compare Runs</h1>
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>Один сценарий, два набора персонажей. Запусти и сравни.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>Локация</div>
          <select
            value={locId}
            onChange={(e) => setLocId(e.target.value)}
            style={{ width: '100%', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: '4px 8px', fontSize: 11 }}
          >
            <option value="">—</option>
            {allLocations.map((l) => <option key={l.entityId} value={l.entityId}>{l.title || l.entityId}</option>)}
          </select>

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <label style={{ fontSize: 10, color: '#64748b' }}>
              Ticks:{' '}
              <input type="number" value={ticks} onChange={(e) => setTicks(Number(e.target.value) || 30)} style={{ width: 50, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 3, padding: 2, fontSize: 10 }} />
            </label>
            <label style={{ fontSize: 10, color: '#64748b' }}>
              Seed:{' '}
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 42)} style={{ width: 60, background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 3, padding: 2, fontSize: 10 }} />
            </label>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: '#3b82f6', textTransform: 'uppercase', marginBottom: 4 }}>Run A ({charsA.length})</div>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allCharacters.map((c) => (
              <label key={c.entityId} style={{ display: 'flex', gap: 4, fontSize: 10, cursor: 'pointer', color: charsA.includes(c.entityId) ? '#e2e8f0' : '#475569' }}>
                <input type="checkbox" checked={charsA.includes(c.entityId)} onChange={() => toggleA(c.entityId)} style={{ accentColor: '#3b82f6' }} />
                {c.title || c.entityId}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: '#f97316', textTransform: 'uppercase', marginBottom: 4 }}>Run B ({charsB.length})</div>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allCharacters.map((c) => (
              <label key={c.entityId} style={{ display: 'flex', gap: 4, fontSize: 10, cursor: 'pointer', color: charsB.includes(c.entityId) ? '#e2e8f0' : '#475569' }}>
                <input type="checkbox" checked={charsB.includes(c.entityId)} onChange={() => toggleB(c.entityId)} style={{ accentColor: '#f97316' }} />
                {c.title || c.entityId}
              </label>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleRun}
        disabled={!canRun || running}
        style={{
          padding: '8px 24px',
          borderRadius: 6,
          border: 'none',
          fontSize: 13,
          fontWeight: 700,
          background: canRun ? '#3b82f6' : '#1e293b',
          color: canRun ? '#fff' : '#475569',
          cursor: canRun ? 'pointer' : 'not-allowed',
          marginBottom: 16,
        }}
      >
        {running ? '⏳ Считаю...' : '▶ Запустить оба'}
      </button>

      {result && <CompareView result={result} names={names} />}
    </div>
  );
};

// Backward-compatible named export used by current lazy loader default mapping.
export const ComparePage = CompareSimPage;
