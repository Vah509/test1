// scripts/process-update.js
// ============================================================
// Головний сценарій обробки оновлення сайту.
// Викликається одним рядком з .github/workflows/unzip-and-update.yml:
//   node scripts/process-update.js
//
// ЩО РОБИТЬ, ПО КРОКАХ:
//  1. Знаходить ZIP-архів у ai-updates/
//  2. Читає список файлів усередині архіву (для звіту)
//  3. Створює staging-копію репозиторію (БЕЗ .git)
//  4. Розпаковує архів поверх staging
//  5. Перевіряє/оптимізує фото — усередині staging
//  6. Надсилає ПЕРШЕ повідомлення в Telegram (файли + фото)
//  7. Пробує зібрати Astro (npm run build) — усередині staging
//  8. Якщо білд ОК:
//       - переносить staging → реальний репозиторій
//       - записує прапорець успіху для наступних кроків workflow
//     Якщо білд НЕ ОК:
//       - нічого не переносить, реальний репозиторій лишається як був
//  9. Надсилає ДРУГЕ повідомлення в Telegram (статус збірки)
//  10. Видаляє оригінальний ZIP з ai-updates/ (В БУДЬ-ЯКОМУ ВИПАДКУ —
//      і при успіху, і при провалі, щоб не залишався "хвіст"
//      для наступного коміту)
//  11. Прибирає staging-директорію
//
// Далі (ПОЗА цим скриптом, окремим кроком у workflow, лише якщо
// білд був успішним) — запускається generate-lastmod-map.js,
// і вже після нього — git add/commit/push.
//
// Скрипт завершується з кодом виходу 0 при успіху, 1 при провалі
// білду — щоб workflow міг через `if: success()` / `if: failure()`
// коректно розгалужити подальші кроки (генерація lastmod-map,
// коміт) без потреби парсити вивід.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

import { readArchiveFileList } from './lib/read-archive.js';
import { optimizePhotos } from './lib/optimize-photos.js';
import { createStaging, applyArchiveToStaging, promoteToRepo, cleanupStaging } from './lib/staging.js';
import { testBuild } from './lib/test-build.js';
import { sendTelegramMessage, buildInfoMessage, buildResultMessage } from './lib/send-telegram.js';

const REPO_ROOT = process.cwd();
const AI_UPDATES_DIR = path.join(REPO_ROOT, 'ai-updates');

function getCurrentTime() {
  // Той самий часовий пояс, що й раніше — Europe/Bratislava
  return new Date().toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Bratislava',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function findZipFile() {
  if (!fs.existsSync(AI_UPDATES_DIR)) return null;
  const zipFiles = fs.readdirSync(AI_UPDATES_DIR).filter((f) => f.endsWith('.zip'));
  if (zipFiles.length === 0) return null;
  return path.join(AI_UPDATES_DIR, zipFiles[0]);
}

async function main() {
  const repoName = path.basename(REPO_ROOT);
  const zipPath = findZipFile();

  if (!zipPath) {
    console.log('Архів не знайдено в ai-updates/ — завершення без дій.');
    return;
  }

  const zipName = path.basename(zipPath);
  const timeAtStart = getCurrentTime();

  // --- Крок 2: список файлів з архіву ---
  const archiveFiles = readArchiveFileList(zipPath);

  // --- Крок 3-4: staging + застосування архіву ---
  console.log('Створення staging-копії репозиторію...');
  const stagingDir = createStaging(REPO_ROOT);
  console.log('Розпакування архіву поверх staging...');
  applyArchiveToStaging(stagingDir, zipPath);

  // --- Крок 5: перевірка/оптимізація фото ---
  console.log('Перевірка фото...');
  const photoReport = await optimizePhotos(stagingDir, archiveFiles);

  // --- Крок 6: перше повідомлення в Telegram ---
  const infoMessage = buildInfoMessage({
    repoName,
    time: timeAtStart,
    zipName,
    files: archiveFiles,
    photoLines: photoReport.lines,
  });
  await sendTelegramMessage(infoMessage);

  // --- Крок 7: тестова збірка ---
  console.log('Тестова збірка Astro у staging...');
  const buildResult = testBuild(stagingDir);

  const timeAtEnd = getCurrentTime();

  // --- Крок 8: перенос у реальний репозиторій, ЛИШЕ якщо білд ОК ---
  if (buildResult.success) {
    console.log('Білд успішний — перенесення файлів у реальний репозиторій...');
    promoteToRepo(stagingDir, REPO_ROOT);
  } else {
    console.log('Білд провалився — реальний репозиторій НЕ змінено.');
  }

  // --- Крок 9: друге повідомлення в Telegram ---
  const resultMessage = buildResultMessage({
    success: buildResult.success,
    repoName,
    time: timeAtEnd,
    errorSummary: buildResult.errorSummary,
  });
  await sendTelegramMessage(resultMessage);

  // --- Крок 10: видалення ZIP з ai-updates/ (завжди, незалежно від результату) ---
  console.log('Видалення оригінального архіву з ai-updates/...');
  fs.rmSync(zipPath, { force: true });

  // --- Крок 11: прибирання staging ---
  cleanupStaging();

  if (!buildResult.success) {
    // Ненульовий код виходу — щоб workflow міг через `if: failure()`
    // пропустити генерацію lastmod-map та коміт
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Неочікувана помилка у process-update.js:', err);
  process.exit(1);
});
