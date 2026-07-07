// localStorage persistence with schema validation (FR-21) and versioned
// keys (kt:v1:*). Invalid entries are dropped, never thrown on.

import { cleanLabel, clampDuration, uid, MAX_DURATION } from './util.js';
import { SOUND_IDS, DEFAULT_SOUND } from './sounds.js';

const NS = 'kt:v1:';
export const KEYS = {
  saved: NS + 'saved',
  running: NS + 'running',
  settings: NS + 'settings',
};

const listeners = new Set();
/** Subscribe to any store change (local writes + other-tab storage events). */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(what) { for (const fn of listeners) { try { fn(what); } catch (e) { console.error(e); } } }

function readRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const val = JSON.parse(raw);
    return val;
  } catch {
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Quota or private-mode failure — degrade gracefully, keep app usable.
    console.warn('Storage write failed', e);
  }
}

// ---------------- validation ----------------

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const validSound = (s) => (SOUND_IDS.includes(s) ? s : null);

function validateSaved(t) {
  if (!t || typeof t !== 'object') return null;
  const durationSec = clampDuration(t.durationSec);
  if (durationSec < 1) return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : uid(),
    label: cleanLabel(t.label) || 'Timer',
    durationSec,
    sound: validSound(t.sound) || DEFAULT_SOUND,
    createdAt: isNum(t.createdAt) ? t.createdAt : Date.now(),
  };
}

function validateRunning(t) {
  if (!t || typeof t !== 'object') return null;
  const durationSec = clampDuration(t.durationSec);
  if (durationSec < 1) return null;
  const paused = t.endTime == null;
  const remainingMs = isNum(t.remainingMs) ? t.remainingMs : null;
  if (paused && (remainingMs == null || remainingMs < 0)) return null;
  if (!paused && !isNum(t.endTime)) return null;
  return {
    id: typeof t.id === 'string' && t.id ? t.id : uid(),
    label: cleanLabel(t.label) || 'Timer',
    durationSec,
    sound: validSound(t.sound) || DEFAULT_SOUND,
    startTime: isNum(t.startTime) ? t.startTime : Date.now(),
    endTime: paused ? null : t.endTime,
    remainingMs: paused ? Math.min(remainingMs, MAX_DURATION * 1000) : null,
    // client-only flag, not persisted meaningfully across ring semantics
    notified: t.notified === true,
  };
}

function validateSettings(s) {
  const src = s && typeof s === 'object' ? s : {};
  const theme = ['auto', 'light', 'dark'].includes(src.theme) ? src.theme : 'auto';
  return {
    theme,
    defaultSound: validSound(src.defaultSound) || DEFAULT_SOUND,
    wakeLock: src.wakeLock !== false, // default on
    volume: isNum(src.volume) ? Math.min(1, Math.max(0, src.volume)) : 0.9,
  };
}

function validateList(arr, fn) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    const v = fn(item);
    if (v) out.push(v);
  }
  return out;
}

// ---------------- public API ----------------

export function getSaved() {
  return validateList(readRaw(KEYS.saved, []), validateSaved);
}

export function setSaved(list) {
  writeRaw(KEYS.saved, list.map(validateSaved).filter(Boolean));
  emit('saved');
}

export function upsertSaved(timer) {
  const v = validateSaved(timer);
  if (!v) return null;
  const list = getSaved();
  const i = list.findIndex((t) => t.id === v.id);
  if (i >= 0) list[i] = v; else list.push(v);
  setSaved(list);
  return v;
}

export function deleteSaved(id) {
  setSaved(getSaved().filter((t) => t.id !== id));
}

export function getRunning() {
  return validateList(readRaw(KEYS.running, []), validateRunning);
}

export function setRunning(list) {
  writeRaw(KEYS.running, list.map(validateRunning).filter(Boolean));
  emit('running');
}

export function upsertRunning(timer) {
  const v = validateRunning(timer);
  if (!v) return null;
  const list = getRunning();
  const i = list.findIndex((t) => t.id === v.id);
  if (i >= 0) list[i] = v; else list.push(v);
  setRunning(list);
  return v;
}

export function deleteRunning(id) {
  setRunning(getRunning().filter((t) => t.id !== id));
}

let settingsCache = null;
export function getSettings() {
  if (!settingsCache) settingsCache = validateSettings(readRaw(KEYS.settings, {}));
  return { ...settingsCache };
}

export function setSettings(patch) {
  settingsCache = validateSettings({ ...getSettings(), ...patch });
  writeRaw(KEYS.settings, settingsCache);
  emit('settings');
  return { ...settingsCache };
}

// Multi-tab consistency (FR-22): last-write-wins. Refresh caches and notify.
export function initStorageSync() {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(NS)) return;
    if (e.key === KEYS.settings) settingsCache = null;
    if (e.key === KEYS.saved) emit('saved');
    else if (e.key === KEYS.running) emit('running');
    else if (e.key === KEYS.settings) emit('settings');
  });
}
