/**
 * Writes public/runtime-config.json from VITE_API_URL at build time.
 * Vercel (and other hosts) can set VITE_API_URL; this file is then served and
 * loaded at runtime so the frontend uses the correct backend URL even when
 * Vite's import.meta.env doesn't get the variable.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiUrl = process.env.VITE_API_URL?.trim() || '';
const publicDir = join(__dirname, '..', 'public');
const outPath = join(publicDir, 'runtime-config.json');

mkdirSync(publicDir, { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify({ apiUrl: apiUrl.replace(/\/$/, '') }, null, 0),
  'utf8'
);
console.log('[runtime-config] Wrote', outPath, apiUrl ? `(apiUrl: ${apiUrl})` : '(apiUrl empty)');
