// Share-link encoding/decoding (§5.3). URL: ?v=1&s=<dur36>.<label>
// - duration: base36 seconds
// - label: URI-encoded
// Sound is intentionally NOT encoded (FR-15) — receiver-side default applies.
// Malformed / out-of-range params are silently ignored (FR-17).

import { cleanLabel, clampDuration } from './util.js';

export const SCHEMA_VERSION = '1';

/** Build the `s` parameter value for a timer. */
export function encodeShare(durationSec, label) {
  const dur = clampDuration(durationSec);
  const dur36 = dur.toString(36);
  return `${dur36}.${encodeURIComponent(cleanLabel(label))}`;
}

/** Build a full absolute share URL for the current origin. */
export function buildShareUrl(durationSec, label, base = location.href) {
  const url = new URL(base);
  url.hash = '';
  url.search = '';
  url.searchParams.set('v', SCHEMA_VERSION);
  url.searchParams.set('s', encodeShare(durationSec, label));
  return url.toString();
}

/**
 * Parse a share payload into { durationSec, label } or null if invalid.
 * Accepts either a URLSearchParams or a location-like object.
 */
export function parseShare(search) {
  let params;
  try {
    params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  } catch {
    return null;
  }
  const v = params.get('v');
  const s = params.get('s');
  if (!s) return null;
  // Only version 1 is understood today; unknown versions are ignored (FR-17).
  if (v != null && v !== SCHEMA_VERSION) return null;

  const dot = s.indexOf('.');
  const dur36 = dot === -1 ? s : s.slice(0, dot);
  const rawLabel = dot === -1 ? '' : s.slice(dot + 1);

  if (!/^[0-9a-z]+$/i.test(dur36)) return null;
  const durationSec = clampDuration(parseInt(dur36, 36));
  if (!durationSec || durationSec < 1) return null;

  let label = '';
  try {
    label = cleanLabel(decodeURIComponent(rawLabel));
  } catch {
    label = cleanLabel(rawLabel);
  }

  return { durationSec, label: label || 'Shared timer' };
}

/** Read a share payload from the current URL, if any. */
export function readShareFromLocation() {
  return parseShare(location.search);
}

/** Remove share params from the address bar without reloading. */
export function clearShareFromLocation() {
  const url = new URL(location.href);
  url.searchParams.delete('v');
  url.searchParams.delete('s');
  history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
}

/**
 * Share a timer via the Web Share API when available, else copy to clipboard
 * (FR-14). Returns { method: 'share'|'copy'|'none' }.
 */
export async function shareTimer(durationSec, label) {
  const url = buildShareUrl(durationSec, label);
  const title = label || 'Kitchen timer';
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return { method: 'share', url };
    } catch (e) {
      if (e && e.name === 'AbortError') return { method: 'none', url };
      // fall through to clipboard
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { method: 'copy', url };
    } catch { /* fall through */ }
  }
  return { method: 'none', url };
}
