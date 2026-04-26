import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function readRepoFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('navigation stabilization', () => {
  it('HomePage promotes Live Sim without the old simulation hub copy', () => {
    const source = readRepoFile('pages/HomePage.tsx');
    expect(source).toContain("type: 'live-sim'");
    expect(source).toContain("link: '/simulator'");
    expect(source).not.toContain('simulation-hub');
    expect(source).not.toContain('Оркестратор сценариев');
  });

  it('Header exposes only the active lab surface', () => {
    const source = readRepoFile('components/Header.tsx');
    const activeRoutes = [
      '/goal-lab-v2',
      '/goal-lab-console-v2',
      '/builder',
      '/location-constructor',
      '/conflict-lab',
      '/simulator',
      '/relations-lab',
      '/narrative',
      '/archetypes',
      '/archetype-relations',
    ];

    for (const route of activeRoutes) {
      expect(source).toContain(`to="${route}"`);
    }

    expect(source).toContain('label="Lab"');
    expect(source).toContain('Инспектор целей');
    expect(source).toContain('label="Narrative"');
    expect(source).toContain('Куб архетипов');
    expect(source).not.toContain('label="Simulation"');
    expect(source).not.toContain('to="/inspector"');
    expect(source).not.toContain('GoalLab legacy (debug)');
    expect(source).not.toContain('/compare');
    expect(source).not.toContain('/planning-lab');
    expect(source).not.toContain('/dialogue-lab');
    expect(source).not.toContain('/presets');
    expect(source).not.toContain('/linter');
  });

  it('App mounts the active routes and compat redirects only', () => {
    const source = readRepoFile('App.tsx');
    const activeRoutes = [
      '/',
      '/builder',
      '/location-constructor',
      '/goal-lab-v2',
      '/goal-lab-console-v2',
      '/conflict-lab',
      '/simulator',
      '/relations-lab',
      '/narrative',
      '/archetypes',
      '/archetype-relations',
      '/:entityType',
      '/:entityType/:entityId',
    ];

    for (const route of activeRoutes) {
      expect(source).toContain(`path="${route}"`);
    }

    expect(source).toContain('path="/goal-lab" element={<Navigate to="/goal-lab-v2" replace />}');
    expect(source).toContain('path="/goal-lab-console" element={<Navigate to="/goal-lab-console-v2" replace />}');
    expect(source).toContain('path="/dilemma-lab" element={<Navigate to="/conflict-lab?tab=dilemma" replace />}');
    expect(source).toContain('path="/mafia-lab" element={<Navigate to="/conflict-lab?tab=mafia" replace />}');

    for (const removed of [
      '/scenarios',
      '/solver',
      '/inspector',
      '/compare',
      '/planning-lab',
      '/dialogue-lab',
      '/dialogue-lab-v2',
      '/dialogue-lab-v3',
      '/biography-lab',
      '/presets',
      '/linter',
      '/character-lab',
    ]) {
      expect(source).not.toContain(`path="${removed}"`);
    }
  });
});
