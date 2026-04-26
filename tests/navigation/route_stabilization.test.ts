import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function readRepoFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('navigation stabilization', () => {
  it('HomePage links simulation entry to the mounted simulator route', () => {
    const source = readRepoFile('pages/HomePage.tsx');
    expect(source).not.toContain('link: "/simulation-hub"');
    expect(source).toContain('link: "/simulator"');
  });

  it('Header promotes GoalLab v2 routes before legacy debug routes', () => {
    const source = readRepoFile('components/Header.tsx');
    const primaryLab = source.indexOf('to="/goal-lab-v2"');
    const primaryConsole = source.indexOf('to="/goal-lab-console-v2"');
    const legacyLab = source.indexOf('to="/goal-lab"');
    const legacyConsole = source.indexOf('to="/goal-lab-console"');

    expect(primaryLab).toBeGreaterThanOrEqual(0);
    expect(primaryConsole).toBeGreaterThanOrEqual(0);
    expect(legacyLab).toBeGreaterThan(primaryLab);
    expect(legacyConsole).toBeGreaterThan(primaryConsole);
    expect(source).toContain('GoalLab legacy (debug)');
  });
});
