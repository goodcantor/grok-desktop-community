/** Read-only view of native privacy. The official CLI owns changes and file permissions. */
import fs from 'node:fs';
import { authJsonPath } from './grok-home.mjs';
export function getCodingDataStatus() {
  try {
    const raw = JSON.parse(fs.readFileSync(authJsonPath(), 'utf8'));
    const entry = Object.values(raw).find(value => value && typeof value === 'object' && (value.key || value.refresh_token || value.access_token || value.email || value.auth_mode || value.authMode));
    const value = entry?.coding_data_retention_opt_out;
    return { optedIn: value === undefined || value === null ? null : !(value === true || value === 'true' || value === 1), source: entry ? (value == null ? 'default' : 'auth') : 'none', managed: true, note: 'Managed by the official Grok CLI. Use /privacy there to inspect or change sharing. Community never changes this account preference.' };
  } catch { return { optedIn: null, source: 'none', managed: true, note: 'Native sharing preference is unavailable. Use /privacy in the official Grok CLI.' }; }
}
