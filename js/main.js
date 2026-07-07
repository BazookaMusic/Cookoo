// App entry point: initialises subsystems, wires the shell chrome, and routes
// between the dashboard, new-timer, and share-preview views.

import * as store from './store.js';
import * as engine from './engine.js';
import { initTheme } from './theme.js';
import { initWakeLock, updateWakeLock } from './wakelock.js';
import { renderDashboard, update as updateDashboard } from './dashboard.js';
import { renderNewTimer } from './newtimer.js';
import { renderSharePreview } from './sharepreview.js';
import { openSettings } from './settings.js';
import { readShareFromLocation } from './share.js';
import { ensureNotificationPermission, notifyDone, vibrateDone } from './notify.js';
import { audioAvailable } from './sounds.js';
import { formatDuration, spokenDuration } from './util.js';
import { toast } from './toast.js';

const root = () => document.getElementById('view-root');
const fab = () => document.getElementById('fab');
const live = () => document.getElementById('aria-live');
const alertRegion = () => document.getElementById('aria-alert');

const view = { name: 'home', prefill: null, share: null, homeMode: null };

const nav = {
  home() { view.name = 'home'; view.prefill = null; render(); },
  newTimer(prefill = null) { view.name = 'new'; view.prefill = prefill; render(); },
};

function render() {
  const r = root();
  if (view.name === 'share' && view.share) {
    fab().hidden = true;
    view.homeMode = null;
    renderSharePreview(r, nav, view.share);
    focusMain();
    return;
  }
  if (view.name === 'new') {
    fab().hidden = true;
    view.homeMode = null;
    renderNewTimer(r, nav, view.prefill || {});
    focusMain();
    return;
  }
  // home
  const timers = engine.getTimers();
  if (timers.length === 0) {
    // FR-1: empty home IS the new-timer view.
    view.homeMode = 'new';
    fab().hidden = true;
    renderNewTimer(r, nav, {});
  } else {
    view.homeMode = 'dash';
    fab().hidden = false;   // FR-3: persistent + when dashboard non-empty
    renderDashboard(r, nav);
  }
}

function focusMain() {
  // Move focus to the top of the new view for keyboard/AT users.
  document.getElementById('main')?.focus?.({ preventScroll: true });
}

// ---- keep the home view in sync as timers tick / change ----
function onEngineChange() {
  updateWake();
  if (view.name !== 'home' || view.homeMode !== 'dash') {
    // If we're on the empty new-timer home and a timer appeared, switch.
    if (view.name === 'home' && view.homeMode === 'new' && engine.getTimers().length > 0) render();
    return;
  }
  const membershipChanged = updateDashboard();
  if (membershipChanged) render();
  announce();
}

function updateWake() {
  const s = store.getSettings();
  const anyRunning = engine.getTimers().some((t) => !engine.isPaused(t) && !engine.isExpired(t));
  updateWakeLock(s.wakeLock && anyRunning);
}

// ---- throttled aria-live countdown for the soonest timer (NFR-4) ----
let lastSpoken = -1;
let lastSpokenId = null;
function announce() {
  const active = engine.getTimers()
    .filter((t) => !engine.isPaused(t) && !engine.isExpired(t))
    .sort((a, b) => engine.remainingMs(a) - engine.remainingMs(b));
  const t = active[0];
  if (!t) { lastSpoken = -1; lastSpokenId = null; return; }
  const secs = Math.ceil(engine.remainingMs(t) / 1000);
  const atBoundary = secs % 60 === 0 || secs <= 10;
  if (!atBoundary) return;
  if (t.id === lastSpokenId && secs === lastSpoken) return;
  lastSpoken = secs;
  lastSpokenId = t.id;
  live().textContent = secs <= 10
    ? `${t.label}: ${secs} second${secs === 1 ? '' : 's'} left`
    : `${t.label}: ${formatDuration(secs)} remaining`;
}

// ---- expiry: alarm is handled by the engine; here we notify + announce ----
engine.onExpire((timer) => {
  alertRegion().textContent = `${timer.label} — timer finished`;
  vibrateDone();
  notifyDone(timer);
});

// ---- contextual permissions on first start (FR-24, FR-26) ----
let firstStartDone = false;
export function onFirstStart() {
  if (firstStartDone) return;
  firstStartDone = true;
  ensureNotificationPermission();
  // If audio couldn't unlock, surface a one-time hint (FR-24).
  setTimeout(() => {
    if (!audioAvailable()) {
      toast('Sound is blocked — timers will vibrate and flash instead.', { duration: 7000 });
    }
  }, 300);
}

// ---- shell chrome ----
function initChrome() {
  fab().addEventListener('click', () => nav.newTimer());
  document.getElementById('home-btn').addEventListener('click', () => nav.home());
  document.getElementById('settings-btn').addEventListener('click', () => openSettings());
}

// ---- service worker (offline / installable, NFR-3) ----
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  });
}

function boot() {
  store.initStorageSync();
  initTheme();
  initWakeLock();
  engine.init();
  engine.onChange(onEngineChange);
  initChrome();
  initServiceWorker();

  // Route: a share link takes priority (FR-16), else home.
  const payload = readShareFromLocation();
  if (payload) { view.name = 'share'; view.share = payload; }

  render();
  updateWake();
}

boot();
