// Small shared helpers: formatting, sanitisation, ids, DOM.

export const MAX_LABEL = 60;
export const MIN_DURATION = 1;          // seconds (FR-8: zero-duration cannot start)
export const MAX_DURATION = 24 * 3600;  // 24h clamp (NFR-5)

/** Strip control chars, collapse to a single line, cap at MAX_LABEL. */
export function cleanLabel(raw) {
  if (typeof raw !== 'string') return '';
  // Remove C0/C1 control chars (incl. newlines/tabs) and zero-width joiners.
  const stripped = raw
    // Whitespace-like controls (tab, newline, CR, form/vertical feed, NEL)
    // become a space so words on separate lines don't get glued together.
    .replace(/[\t\n\r\f\v\u0085\u2028\u2029]/g, ' ')
    // Remaining C0/C1 control chars are removed entirely.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    // Zero-width & BOM characters are removed.
    .replace(/[\u200b-\u200f\ufeff]/g, '');
  return stripped.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
}

/** Clamp a duration in seconds to the allowed range; returns an integer. */
export function clampDuration(sec) {
  const n = Math.floor(Number(sec));
  if (!Number.isFinite(n)) return 0;
  if (n < MIN_DURATION) return n <= 0 ? 0 : MIN_DURATION;
  return Math.min(n, MAX_DURATION);
}

/** Split seconds into {h, m, s}. */
export function toHMS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function fromHMS(h, m, s) {
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Format seconds as m:ss or h:mm:ss (FR-2). */
export function formatDuration(totalSec) {
  const { h, m, s } = toHMS(totalSec);
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}

/** Human, screen-reader-friendly duration, e.g. "6 min 30 sec". */
export function spokenDuration(totalSec) {
  const { h, m, s } = toHMS(totalSec);
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s || parts.length === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** "3 min ago", "just now", "1 hr 5 min ago" — for finished timers (FR-4). */
export function relativeAgo(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${h} hr ${rem} min ago` : `${h} hr ago`;
}

/** Prefer crypto UUID; fall back for older engines. */
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const now = () => Date.now();

// ---- tiny DOM helpers (textContent only — never innerHTML for data) ----

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('innerHTML is forbidden for untrusted data');
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k in node && k !== 'list' && typeof v !== 'object') {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    } else {
      node.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Render an inline SVG icon from a small allow-listed set. */
export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
  }
  return svg;
}

const ICONS = {
  play: ['M8 5v14l11-7z'],
  pause: ['M6 5h4v14H6zM14 5h4v14h-4z'],
  reset: ['M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z'],
  close: ['M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 6.3 17.7l-1.42-1.42L11.17 12 4.88 5.71 6.3 4.29l4.29 4.3 6.29-6.3z'],
  x: ['M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 6.3 17.7l-1.42-1.42L11.17 12 4.88 5.71 6.3 4.29l4.29 4.3 6.29-6.3z'],
  edit: ['M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z'],
  trash: ['M6 7h12l-1 13H7zM9 4h6l1 2H8zM4 6h16v2H4z'],
  share: ['M18 16a3 3 0 0 0-2.24 1L9 13.51a3 3 0 0 0 0-1.02l6.76-3.49A3 3 0 1 0 15 7a3 3 0 0 0 .07.66L8.31 11.2a3 3 0 1 0 0 5.6l6.76 3.5A3 3 0 1 0 18 16z'],
  search: ['M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z'],
  plus: ['M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'],
  up: ['M12 8l6 6H6z'],
  down: ['M12 16l-6-6h12z'],
  back: ['M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z'],
  save: ['M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10z'],
};
