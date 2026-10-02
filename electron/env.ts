import * as fs from 'fs';
import * as path from 'path';

function applyEnvFile(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** Load AI_GATEWAY_API_KEY and other vars from .env. Existing process env wins. */
export function loadEnvFiles() {
  const home = process.env.HOME || '';
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.join(process.cwd(), '.env'),
    path.join(home, 'Library/Application Support/open-handy/.env'),
  ];
  for (const file of candidates) applyEnvFile(file);
}

export function gatewayApiKey(settingsKey?: string): string {
  loadEnvFiles();
  return (process.env.AI_GATEWAY_API_KEY || settingsKey || '').trim();
}
