// Timer engine — the single source of truth for running timers.
//
// Core rule (FR-18): remaining time is ALWAYS derived as endTime - now, never
// decremented. Pause clears endTime and stores remainingMs (FR-19). This makes
// the app immune to tab suspension / clock throttling (NFR-1): whenever we
// wake up, the numbers are correct.

import * as store from './store.js';
import { now, clampDuration, uid, cleanLabel } from './util.js';
import { Alarm } from './sounds.js';
import { DEFAULT_SOUND } from './sounds.js';

const TICK_MS = 250;

const listeners = new Set();
const alarms = new Map();     // id -> Alarm
const onExpireCbs = new Set();

let intervalId = null;

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onExpire(fn) { onExpireCbs.add(fn); return () => onExpireCbs.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } }

/** Remaining milliseconds for a timer, derived (never stored while running). */
export function remainingMs(t) {
  if (t.endTime == null) return Math.max(0, t.remainingMs ?? 0);
  return Math.max(0, t.endTime - now());
}

export function isPaused(t) { return t.endTime == null; }
export function isExpired(t) { return !isPaused(t) && remainingMs(t) <= 0; }
export function isRinging(t) { return alarms.has(t.id); }

export function getTimers() {
  return store.getRunning().sort(sortTimers);
}

// Sort: expired pinned to top, then soonest-to-finish (FR-5).
function sortTimers(a, b) {
  const ax = isExpired(a), bx = isExpired(b);
  if (ax !== bx) return ax ? -1 : 1;
  if (ax && bx) return (a.endTime ?? 0) - (b.endTime ?? 0); // oldest-expired first
  return remainingMs(a) - remainingMs(b);
}

/** Start a brand-new running timer from a spec. Returns the timer or null. */
export function startTimer({ label, durationSec, sound }) {
  const dur = clampDuration(durationSec);
  if (dur < 1) return null; // FR-8: zero-duration cannot start
  const t0 = now();
  const timer = {
    id: uid(),
    label: cleanLabel(label) || 'Timer',
    durationSec: dur,
    sound: sound || DEFAULT_SOUND,
    startTime: t0,
    endTime: t0 + dur * 1000,
    remainingMs: null,
    notified: false,
  };
  store.upsertRunning(timer);
  ensureTicking();
  emit();
  return timer;
}

export function pauseResume(id) {
  const list = store.getRunning();
  const t = list.find((x) => x.id === id);
  if (!t) return;
  if (isExpired(t)) return; // can't pause a finished timer
  if (isPaused(t)) {
    // resume
    const rem = Math.max(1, t.remainingMs ?? 0);
    t.endTime = now() + rem;
    t.remainingMs = null;
  } else {
    // pause
    t.remainingMs = remainingMs(t);
    t.endTime = null;
  }
  store.upsertRunning(t);
  ensureTicking();
  emit();
}

/** Reset a timer back to its full duration, preserving running/paused state. */
export function resetTimer(id) {
  stopAlarm(id);
  const list = store.getRunning();
  const t = list.find((x) => x.id === id);
  if (!t) return;
  const wasPaused = isPaused(t) && !isExpired(t);
  t.notified = false;
  if (wasPaused) {
    t.remainingMs = t.durationSec * 1000;
    t.endTime = null;
  } else {
    t.startTime = now();
    t.endTime = now() + t.durationSec * 1000;
    t.remainingMs = null;
  }
  store.upsertRunning(t);
  ensureTicking();
  emit();
}

export function dismissTimer(id) {
  stopAlarm(id);
  store.deleteRunning(id);
  emit();
}

function stopAlarm(id) {
  const a = alarms.get(id);
  if (a) { a.stop(); alarms.delete(id); }
}

/** Stop every ringing alarm (used when the last done timer is dismissed). */
export function silenceAll() {
  for (const [, a] of alarms) a.stop();
  alarms.clear();
  emit();
}

// ---------------- tick / expiry detection ----------------

function tick() {
  const list = store.getRunning();
  let changed = false;
  let anyActive = false;

  for (const t of list) {
    if (isPaused(t)) continue;
    if (remainingMs(t) > 0) { anyActive = true; continue; }
    // Expired now.
    if (!t.notified) {
      t.notified = true;
      changed = true;
      ring(t);
    }
  }
  if (changed) store.setRunning(list);
  emit();

  // Keep ticking while anything counts down or is actively ringing.
  if (!anyActive && alarms.size === 0) stopTicking();
}

function ring(timer) {
  // Audible alarm (loops until dismissed).
  if (!alarms.has(timer.id)) {
    const settings = store.getSettings();
    const a = new Alarm(timer.sound, settings.volume);
    if (a.start()) alarms.set(timer.id, a);
  }
  // Notify listeners (notification / vibration / visual are wired in main.js).
  for (const fn of onExpireCbs) { try { fn(timer); } catch (e) { console.error(e); } }
}

function ensureTicking() {
  if (intervalId == null) intervalId = setInterval(tick, TICK_MS);
}
function stopTicking() {
  if (intervalId != null) { clearInterval(intervalId); intervalId = null; }
}

/**
 * Initialise on page load. Any timer already expired is marked as
 * acknowledged so it renders as "finished N ago" WITHOUT ringing (FR-20).
 */
export function init() {
  const list = store.getRunning();
  let changed = false;
  for (const t of list) {
    if (!isPaused(t) && remainingMs(t) <= 0 && !t.notified) {
      t.notified = true;
      changed = true;
    }
  }
  if (changed) store.setRunning(list);

  // Catch up immediately whenever the tab becomes visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { ensureTicking(); tick(); }
  });

  // Cross-tab updates: re-render and make sure we're ticking if needed.
  store.subscribe((what) => {
    if (what === 'running') { ensureTicking(); emit(); }
  });

  if (list.some((t) => !isPaused(t))) ensureTicking();
  emit();
}
