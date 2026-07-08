// System notifications (FR-26) + vibration/visual fallbacks (FR-24).
// Permission is requested contextually on first timer start — never on load.

import { formatDuration } from './util.js';

let permissionAsked = false;

export function notificationsSupported() {
  return 'Notification' in window;
}

/** Ask for notification permission (call from a user gesture, e.g. first start). */
export async function ensureNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  if (permissionAsked) return Notification.permission;
  permissionAsked = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Fire a completion notification if permission was granted. */
export function notifyDone(timer) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(`${timer.label} — done`, {
      body: `Your ${formatDuration(timer.durationSec)} timer finished.`,
      tag: 'kt-' + timer.id,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge.png',
      renotify: false,
      requireInteraction: true,
    });
    n.addEventListener('click', () => { window.focus(); n.close(); });
    return true;
  } catch {
    return false;
  }
}

/** Buzz the device if vibration is supported (fallback when audio is blocked). */
export function vibrateDone() {
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200, 100, 400]); return true; } catch { /* */ }
  }
  return false;
}
