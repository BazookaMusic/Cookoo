// Wake Lock (FR-29): keep the screen on while any timer runs. Toggleable in
// settings. Re-acquired automatically after the tab returns to the foreground.

let lock = null;
let wanted = false;

export function wakeLockSupported() {
  return 'wakeLock' in navigator;
}

async function acquire() {
  if (!wakeLockSupported() || lock) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch {
    lock = null; // e.g. tab not visible, low battery — non-fatal
  }
}

async function release() {
  if (lock) {
    try { await lock.release(); } catch { /* */ }
    lock = null;
  }
}

/** Reflect whether a lock is desired given running state + user setting. */
export function updateWakeLock(shouldHold) {
  wanted = shouldHold;
  if (shouldHold) acquire(); else release();
}

export function initWakeLock() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted) acquire();
  });
}
