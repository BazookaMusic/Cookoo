// Share-link preview (FR-16): shows the incoming timer with Start and Save
// actions. NEVER auto-starts. Sound is not in the link, so the receiver's
// default applies (FR-15).

import { el, icon, formatDuration, spokenDuration } from './util.js';
import * as store from './store.js';
import * as engine from './engine.js';
import { unlockAudio, DEFAULT_SOUND, soundName } from './sounds.js';
import { clearShareFromLocation } from './share.js';
import { toast } from './toast.js';
import { onFirstStart } from './main.js';

export function renderSharePreview(root, nav, payload) {
  root.replaceChildren();
  const settings = store.getSettings();
  const sound = settings.defaultSound || DEFAULT_SOUND;
  const spec = { label: payload.label, durationSec: payload.durationSec, sound };

  const card = el('section', { class: 'preview-card', 'aria-label': 'Shared timer' }, [
    el('div', { class: 'preview-card__eyebrow' }, 'Shared timer'),
    el('h1', { class: 'preview-card__label' }, payload.label),
    el('div', {
      class: 'preview-card__time',
      role: 'text',
      'aria-label': spokenDuration(payload.durationSec),
    }, formatDuration(payload.durationSec)),
    el('p', { class: 'timer-card__meta preview-card__sound' },
      `Alarm sound: ${soundName(sound)} (your default)`),
  ]);

  const startBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button' });
  startBtn.append(icon('play', 20), el('span', {}, 'Start'));
  startBtn.addEventListener('click', async () => {
    await unlockAudio();
    onFirstStart();
    engine.startTimer(spec);
    clearShareFromLocation();
    nav.home();
  });

  const saveBtn = el('button', { class: 'btn btn--ghost btn--block', type: 'button' });
  saveBtn.append(icon('save', 20), el('span', {}, 'Save for later'));
  saveBtn.addEventListener('click', () => {
    store.upsertSaved({ ...spec, createdAt: Date.now() });
    toast(`Saved “${payload.label}”`);
    clearShareFromLocation();
    nav.newTimer();
  });

  const dismiss = el('button', { class: 'btn btn--ghost btn--block', type: 'button' },
    'Not now');
  dismiss.addEventListener('click', () => { clearShareFromLocation(); nav.home(); });

  const actions = el('div', { class: 'btn-row' }, [
    Object.assign(startBtn, { className: 'btn btn--primary btn--wide' }),
    saveBtn,
    dismiss,
  ]);

  root.append(card, actions);
}
