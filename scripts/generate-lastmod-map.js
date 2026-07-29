// scripts/generate-lastmod-map.js
// ============================================================
// Окремий скрипт: обходить файли проекту та фіксувати дату
// останнього git-коміту для кожного з них у єдиний JSON.
//
// НАВІЩО ЦЕ ОКРЕМИЙ СКРИПТ, А НЕ ЧАСТИНА sitemap.xml.ts:
// Cloudflare Pages клонує репозиторій НЕ повною історією —
// лише один коміт (shallow fetch конкретного SHA). Це видно
// з логу білду Cloudflare: "branch <SHA> -> FETCH_HEAD".
// Тому "git log" усередині sitemap.xml.ts на Cloudflare нічого
// не знаходить і мовчки падає на фолбек-дату для ВСІХ сторінок.
//
// РІШЕННЯ: рахувати git-дати ТУТ, у GitHub Actions, де є повна
// історія (fetch-depth: 0 у workflow), і зберігати результат
// у файл усередині репозиторію. Cloudflare Pages при своєму
// білді просто ЧИТАЄ цей готовий файл — git там більше не
// потрібен.
//
// Запускати ДО кроку "npm run build" / ДО коміту змін.
// Викликається з unzip-and-update.yml одним рядком:
//   node scripts/generate-lastmod-map.js
//
// Результат: src/data/lastmod-map.json
// Формат:
//   { "src/pages/kontakty.astro": "2026-07-23", ... }
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd(); // очікується запуск з кореня репозиторію
const OUTPUT_PATH = path.join(REPO_ROOT, 'src/data/lastmod-map.json');

// Директорії, які скануємо на .astro сторінки
const PAGE_DIRS = [
  'src/pages',                              // верхній рівень
  'src/pages/posluhy-ta-produktsiia',       // продукція UA
  'src/pages/ru',                           // всі RU-сторінки (рекурсивно нижче)
];

// Директорії з контентом Content Collections
const CONTENT_DIRS = [
  'src/content/vykonani-roboty',
];

const FALLBACK_DATE = new Date().toISOString().split('T')[0];

// Рекурсивно збирає всі файли з розширенням .astro або .md у директорії
function collectFiles(dir, ext) {
  const fullDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];

  const results = [];
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryRelPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(entryRelPath, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      // Пропускаємо динамічні роути на кшталт [slug].astro —
      // для них немає сенсу рахувати lastmod окремо
      if (entry.name.startsWith('[')) continue;
      results.push(entryRelPath.split(path.sep).join('/')); // нормалізація слешів
    }
  }
  return results;
}

// Повертає дату останнього коміту для файлу, або фолбек
function getGitDate(relFilePath) {
  try {
    const out = execSync(`git log -1 --format=%cs -- "${relFilePath}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out || FALLBACK_DATE;
  } catch {
    return FALLBACK_DATE;
  }
}

function main() {
  const allFiles = [];

  for (const dir of PAGE_DIRS) {
    allFiles.push(...collectFiles(dir, '.astro'));
  }
  for (const dir of CONTENT_DIRS) {
    allFiles.push(...collectFiles(dir, '.md'));
  }

  const uniqueFiles = Array.from(new Set(allFiles));

  const map = {};
  let gitFailures = 0;

  for (const file of uniqueFiles) {
    const date = getGitDate(file);
    map[file] = date;
    if (date === FALLBACK_DATE) {
      // Не обов'язково помилка (файл міг реально змінитись сьогодні),
      // але рахуємо для підсумкового звіту в консолі
      gitFailures++;
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(map, null, 2) + '\n', 'utf-8');

  console.log(`✅ lastmod-map.json згенеровано: ${uniqueFiles.length} файлів`);
  console.log(`   Записано у: ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
  if (gitFailures > 0) {
    console.log(`   ⚠️  ${gitFailures} файл(ів) отримали сьогоднішню дату (fallback або реальна сьогоднішня зміна)`);
  }
}

main();
