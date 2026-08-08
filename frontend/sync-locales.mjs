/**
 * Sync locale files: for every key in English locale files,
 * ensure the key exists in all other locale files.
 * If missing, copy the English value as fallback.
 * Preserves existing translations.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE = './public/locales';
const SOURCE_LANG = 'en';

// Get all locale dirs
const allLangs = readdirSync(BASE).filter(d => d !== SOURCE_LANG);
const namespaces = readdirSync(join(BASE, SOURCE_LANG))
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));

function deepMerge(source, target) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (!(key in result)) {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = deepMerge(value, result[key] || {});
    }
  }
  return result;
}

let totalAdded = 0;

for (const lang of allLangs) {
  let langAdded = 0;
  for (const ns of namespaces) {
    const enPath = join(BASE, SOURCE_LANG, `${ns}.json`);
    const targetPath = join(BASE, lang, `${ns}.json`);

    const enData = JSON.parse(readFileSync(enPath, 'utf-8'));

    let targetData = {};
    try {
      targetData = JSON.parse(readFileSync(targetPath, 'utf-8'));
    } catch {
      // File doesn't exist, will be created
    }

    const countBefore = JSON.stringify(targetData).split('"').length;
    const merged = deepMerge(enData, targetData);
    const countAfter = JSON.stringify(merged).split('"').length;
    const added = (countAfter - countBefore) / 2; // rough estimate

    if (JSON.stringify(merged) !== JSON.stringify(targetData)) {
      writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n');
      langAdded++;
    }
  }
  if (langAdded > 0) {
    console.log(`✅ ${lang}: updated ${langAdded} namespace(s)`);
    totalAdded += langAdded;
  } else {
    console.log(`✓ ${lang}: up to date`);
  }
}

console.log(`\nDone! Updated ${totalAdded} namespace files across ${allLangs.length} locales.`);
