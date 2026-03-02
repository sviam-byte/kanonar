/**
 * scripts/codemod-dedup.ts
 *
 * Автоматическая дедупликация clamp01, getMag, getMagById, getAtomValue.
 *
 * ЗАПУСК:  npx tsx scripts/codemod-dedup.ts
 * DRY RUN: DRY_RUN=1 npx tsx scripts/codemod-dedup.ts
 *
 * ЧТО ДЕЛАЕТ:
 * 1. Находит файлы с локальными function clamp01/getMag/getMagById/getAtomValue
 * 2. Удаляет локальное определение (multi-line function body)
 * 3. Добавляет import из canonical модуля с правильным relative path
 * 4. Заменяет getAtomValue() → getMag()
 * 5. Логирует файлы, требующие ручной доработки
 *
 * НЕ ТРОГАЕТ: lib/util/math.ts, lib/util/atoms.ts (canonical определения)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DRY_RUN = process.env.DRY_RUN === '1';
const ROOT = process.cwd();

function relImport(fromFile: string, toModule: string): string {
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, toModule).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function grepFiles(pattern: string, exclude: string): string[] {
  try {
    return execSync(
      `grep -rl "${pattern}" lib/ --include="*.ts" | grep -v "${exclude}"`,
      { encoding: 'utf8', cwd: ROOT }
    ).trim().split('\n').filter(Boolean);
  } catch { return []; }
}

/**
 * Удаляет function fnName(...) { ... } включая тело с вложенными скобками.
 * Работает с multi-line телами до ~15 строк.
 */
function removeFnDef(content: string, fnName: string): { content: string; removed: boolean } {
  // Стратегия: найти начало функции, потом считать скобки до закрывающей
  const startRe = new RegExp(`(?:export\\s+)?function\\s+${fnName}\\s*\\(`);
  const match = startRe.exec(content);
  if (!match) return { content, removed: false };

  // Найти открывающую скобку тела функции {
  let i = match.index + match[0].length;
  while (i < content.length && content[i] !== '{') i++;
  if (i >= content.length) return { content, removed: false };

  // Считать скобки
  let depth = 0;
  let end = i;
  for (; end < content.length; end++) {
    if (content[end] === '{') depth++;
    if (content[end] === '}') {
      depth--;
      if (depth === 0) { end++; break; }
    }
  }

  // Включить trailing newline
  while (end < content.length && content[end] === '\n') end++;

  // Найти начало строки с function
  let start = match.index;
  while (start > 0 && content[start - 1] !== '\n') start--;

  const removed = content.slice(0, start) + content.slice(end);
  return { content: removed, removed: true };
}

function addImportLine(content: string, symbols: string[], fromPath: string): string {
  const importStr = `import { ${symbols.join(', ')} } from '${fromPath}';`;

  // Проверить, есть ли уже import из этого модуля
  const escaped = fromPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingRe = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escaped}['"]`);
  const existing = content.match(existingRe);
  if (existing) {
    const syms = existing[1].split(',').map(s => s.trim()).filter(Boolean);
    const merged = [...new Set([...syms, ...symbols])];
    return content.replace(existing[0], `import { ${merged.join(', ')} } from '${fromPath}'`);
  }

  // Вставить после последнего import
  const lastIdx = content.lastIndexOf('\nimport ');
  if (lastIdx >= 0) {
    const lineEnd = content.indexOf('\n', lastIdx + 1);
    return content.slice(0, lineEnd) + '\n' + importStr + content.slice(lineEnd);
  }

  // Нет imports — в начало
  return importStr + '\n' + content;
}

// ═══ Phase 1: clamp01 ═══════════════════════════════════════════════════

function dedupClamp01(): void {
  console.log('\n═══ clamp01 dedup ═══\n');
  const files = grepFiles('function clamp01', 'util/math.ts');
  console.log(`Найдено ${files.length} файлов с локальным clamp01.\n`);

  let ok = 0, skip = 0;
  const manual: string[] = [];

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');

    // Уже импортирует clamp01 из util/math?
    if (/clamp01/.test(content) && /from\s*['"][^'"]*util\/math['"]/.test(content)) {
      // Просто удалить локальное определение
      const r = removeFnDef(content, 'clamp01');
      if (r.removed && !DRY_RUN) fs.writeFileSync(file, r.content);
      if (r.removed) { console.log(`CLEANED: ${file}`); ok++; }
      continue;
    }

    const r = removeFnDef(content, 'clamp01');
    if (!r.removed) {
      console.log(`MANUAL: ${file}`);
      manual.push(file);
      skip++;
      continue;
    }
    content = r.content;

    if (!/\bclamp01\b/.test(content)) {
      if (!DRY_RUN) fs.writeFileSync(file, content);
      console.log(`REMOVED (unused): ${file}`);
      ok++;
      continue;
    }

    const imp = relImport(file, 'lib/util/math');
    content = addImportLine(content, ['clamp01'], imp);
    if (!DRY_RUN) fs.writeFileSync(file, content);
    console.log(`REPLACED: ${file}`);
    ok++;
  }

  console.log(`\nclamp01: ok=${ok}, skip=${skip}`);
  if (manual.length) {
    console.log('Ручная доработка:');
    manual.forEach(f => console.log(`  ${f}`));
  }
}

// ═══ Phase 2: getMag/getMagById/getAtomValue ════════════════════════════

function dedupGetMag(): void {
  console.log('\n═══ getMag dedup ═══\n');
  const f1 = grepFiles('function getMag\\b', 'util/atoms.ts');
  const f2 = grepFiles('function getMagById\\b', 'util/atoms.ts');
  const f3 = grepFiles('function getAtomValue\\b', 'util/atoms.ts');
  const files = [...new Set([...f1, ...f2, ...f3])];
  console.log(`Найдено ${files.length} файлов.\n`);

  let ok = 0, skip = 0;
  const manual: string[] = [];

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');

    if (/from\s*['"][^'"]*util\/atoms['"]/.test(content)) {
      let any = false;
      for (const fn of ['getMag', 'getMagById', 'getAtomValue']) {
        const r = removeFnDef(content, fn);
        if (r.removed) { content = r.content; any = true; }
      }
      if (any && !DRY_RUN) fs.writeFileSync(file, content);
      if (any) { console.log(`CLEANED: ${file}`); ok++; }
      continue;
    }

    const symbols: string[] = [];
    let any = false;
    for (const fn of ['getMag', 'getMagById', 'getAtomValue']) {
      const r = removeFnDef(content, fn);
      if (r.removed) {
        content = r.content;
        any = true;
        if (fn === 'getAtomValue') {
          content = content.replace(/\bgetAtomValue\s*\(/g, 'getMag(');
          if (!symbols.includes('getMag')) symbols.push('getMag');
        } else {
          if (!symbols.includes(fn)) symbols.push(fn);
        }
      }
    }

    if (!any) {
      console.log(`MANUAL: ${file}`);
      manual.push(file);
      skip++;
      continue;
    }

    if (symbols.length > 0) {
      const imp = relImport(file, 'lib/util/atoms');
      content = addImportLine(content, symbols, imp);
    }

    if (!DRY_RUN) fs.writeFileSync(file, content);
    console.log(`REPLACED: ${file} [${symbols.join(', ')}]`);
    ok++;
  }

  console.log(`\ngetMag: ok=${ok}, skip=${skip}`);
  if (manual.length) {
    console.log('Ручная доработка:');
    manual.forEach(f => console.log(`  ${f}`));
  }
}

// ═══ Main ═══════════════════════════════════════════════════════════════

if (DRY_RUN) console.log('*** DRY RUN — файлы не изменяются ***\n');
dedupClamp01();
dedupGetMag();
console.log('\n═══ DONE ═══');
console.log('Далее: npx tsc --noEmit && npm test');
