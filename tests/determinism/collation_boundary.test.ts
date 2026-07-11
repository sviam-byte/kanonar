// tests/determinism/collation_boundary.test.ts
//
// Boundary gate (GOLDEN-DRIFT root cause, 2026-07-11): localeCompare is
// ICU-collation dependent — its order differs across Node builds and machine
// locales, which split the MVP-0 golden hash into two per-environment
// lineages. Semantic/trace code must sort with codeUnitCompare
// (lib/utils/compare.ts) instead. localeCompare stays legal in UI display
// code (.tsx, components/, pages/) and dev codegen (lib/context/catalog).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED_DISPLAY_OR_CODEGEN_FILES = new Set([
  join('lib', 'context', 'catalog', 'catalogTemplates.ts'),
  join('lib', 'context', 'catalog', 'generateMissingSpecs.ts'),
  join('lib', 'linter.ts'),
]);

function walkTsFiles(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkTsFiles(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

describe('collation boundary', () => {
  it('semantic paths do not use locale-dependent string comparison', () => {
    const offenders: string[] = [];
    for (const file of walkTsFiles(join(process.cwd(), 'lib'), [])) {
      const relative = file.slice(process.cwd().length + 1);
      const src = readFileSync(file, 'utf8');
      if (src.includes('.localeCompare(') && !ALLOWED_DISPLAY_OR_CODEGEN_FILES.has(relative)) offenders.push(file);
    }
    expect(offenders, 'use codeUnitCompare from lib/utils/compare.ts').toEqual([]);
  });
});
