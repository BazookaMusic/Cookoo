// Settings sheet: theme override (FR-27), per-app default sound (FR-23),
// wake-lock toggle (FR-29), and volume. Rendered as a bottom-sheet <dialog>.

import { el, icon } from './util.js';
import * as store from './store.js';
import { SOUNDS, previewSound, unlockAudio, setMasterVolume } from './sounds.js';
import { wakeLockSupported } from './wakelock.js';

let dialog = null;

export function openSettings() {
  const s = store.getSettings();
  dialog = el('dialog', { class: 'sheet', 'aria-label': 'Settings' });

  const close = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close settings' });
  close.append(icon('x', 24));
  close.addEventListener('click', () => dialog.close());

  const head = el('div', { class: 'sheet__head' }, [el('h2', {}, 'Settings'), close]);

  // Theme segmented control
  const themeSeg = seg(['auto', 'light', 'dark'], s.theme, (val) => {
    store.setSettings({ theme: val });
  }, { auto: 'Auto', light: 'Light', dark: 'Dark' });
  const themeRow = row('Theme', 'Auto follows your device.', themeSeg);

  // Default sound
  const soundSel = el('select', { class: 'select', 'aria-label': 'Default alarm sound' },
    SOUNDS.map((so) => el('option', { value: so.id, selected: so.id === s.defaultSound }, so.name)));
  soundSel.addEventListener('change', async () => {
    store.setSettings({ defaultSound: soundSel.value });
    await unlockAudio();
    previewSound(soundSel.value, store.getSettings().volume);
  });
  const soundRow = row('Default sound', 'Used for new and shared timers.', soundSel);

  // Volume
  const vol = el('input', {
    type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume),
    class: 'select', 'aria-label': 'Alarm volume',
  });
  vol.addEventListener('input', () => {
    const v = parseFloat(vol.value);
    store.setSettings({ volume: v });
    setMasterVolume(v);
  });
  const volRow = row('Volume', 'Alarm loudness.', vol);

  // Wake lock
  const wl = toggle(s.wakeLock, (on) => store.setSettings({ wakeLock: on }));
  const wlRow = row('Keep screen on', wakeLockSupported()
    ? 'While a timer runs.' : 'Not supported on this device.', wl);
  if (!wakeLockSupported()) wl.disabled = true;

  const inner = el('div', { class: 'sheet__inner' }, [head, themeRow, soundRow, volRow, wlRow]);
  dialog.append(inner);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  // Click on backdrop closes
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.showModal();
}

function row(title, sub, control) {
  return el('div', { class: 'setting-row' }, [
    el('div', { class: 'setting-row__text' }, [
      el('span', {}, title),
      el('small', {}, sub),
    ]),
    control,
  ]);
}

function seg(values, current, onPick, labels) {
  const wrap = el('div', { class: 'seg', role: 'group' });
  const btns = values.map((v) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(v === current) },
      labels[v] || v);
    b.addEventListener('click', () => {
      for (const x of wrap.children) x.setAttribute('aria-pressed', String(x === b));
      onPick(v);
    });
    return b;
  });
  wrap.append(...btns);
  return wrap;
}

function toggle(on, onChange) {
  const b = el('button', {
    class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on),
    'aria-label': 'Toggle',
  });
  b.addEventListener('click', () => {
    const next = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return b;
}
