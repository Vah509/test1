// scripts/lib/staging.js
// ============================================================
// Керує "пісочницею" (staging) — тимчасовою копією репозиторію,
// куди застосовується ZIP-архів і де відбувається тестова
// збірка. Реальний репозиторій НЕ змінюється, доки білд не
// підтвердить успіх.
//
// createStaging()  — копіює поточний стан репозиторію у staging
// applyArchive()    — розпаковує ZIP поверх staging
// promoteToRepo()   — переносить staging назад у реальний репозиторій
//                      (викликається ТІЛЬКИ після успішного білду)
// cleanupStaging()  — прибирає тимчасову директорію
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const STAGING_DIR = '/tmp/em-staging';

/**
 * Копіює поточний репозиторій (без .git — він не потрібен у staging,
 * тестова збірка Astro git не використовує) у тимчасову директорію.
 * @param {string} repoRoot
 * @returns {string} - шлях до staging-директорії
 */
export function createStaging(repoRoot) {
  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  // cp -a зберігає атрибути та є доступним у будь-якому Linux-оточенні
  // (на відміну від rsync, який не завжди встановлений за замовчуванням).
  // Виключаємо .git окремо, бо cp -a не має --exclude.
  execSync(`cp -a "${repoRoot}/." "${STAGING_DIR}/"`, { stdio: 'inherit' });
  const stagingGitDir = path.join(STAGING_DIR, '.git');
  if (fs.existsSync(stagingGitDir)) {
    fs.rmSync(stagingGitDir, { recursive: true, force: true });
  }

  return STAGING_DIR;
}

/**
 * Розпаковує ZIP-архів поверх staging-директорії.
 * @param {string} stagingDir
 * @param {string} zipPath
 */
export function applyArchiveToStaging(stagingDir, zipPath) {
  execSync(`unzip -o "${zipPath}" -d "${stagingDir}"`, { stdio: 'inherit' });
}

/**
 * Переносить вміст staging назад у реальний репозиторій.
 * Викликати ЛИШЕ після успішного тестового білду.
 * @param {string} stagingDir
 * @param {string} repoRoot
 */
export function promoteToRepo(stagingDir, repoRoot) {
  // cp -a не має --exclude, тому виключаємо dist/ та node_modules/
  // тимчасовим переміщенням їх за межі staging перед копіюванням,
  // а потім поверненням назад (щоб не копіювати зайве у репозиторій).
  const tmpDist = path.join('/tmp', 'em-staging-dist-aside');
  const tmpNodeModules = path.join('/tmp', 'em-staging-nm-aside');

  const distPath = path.join(stagingDir, 'dist');
  const nodeModulesPath = path.join(stagingDir, 'node_modules');

  if (fs.existsSync(distPath)) fs.renameSync(distPath, tmpDist);
  if (fs.existsSync(nodeModulesPath)) fs.renameSync(nodeModulesPath, tmpNodeModules);

  execSync(`cp -a "${stagingDir}/." "${repoRoot}/"`, { stdio: 'inherit' });

  // Повертаємо назад у staging (про всяк випадок, якщо cleanupStaging
  // очікує повну структуру) — хоча зазвичай staging одразу після цього видаляється
  if (fs.existsSync(tmpDist)) fs.renameSync(tmpDist, distPath);
  if (fs.existsSync(tmpNodeModules)) fs.renameSync(tmpNodeModules, nodeModulesPath);
}

/**
 * Прибирає тимчасову staging-директорію.
 */
export function cleanupStaging() {
  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
}

export { STAGING_DIR };
