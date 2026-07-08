// New-timer view: search + saved results, three dials, presets, label field,
// sound selector, and Start / Save / Save & Start actions.
// Covers FR-6..FR-13 and FR-9 sound selection.

import { el, icon, toHMS, fromHMS, formatDuration, cleanLabel, MAX_LABEL } from './util.js';
import { Dial } from './dial.js';
import * as store from './store.js';
import * as engine from './engine.js';
import { SOUNDS, previewSound, unlockAudio, DEFAULT_SOUND } from './sounds.js';
import { toast } from './toast.js';
import { onFirstStart } from './main.js';

const PRESETS = [
  { label: '1 min', sec: 60 },
  { label: '3 min', sec: 180 },
  { label: '5 min', sec: 300 },
  { label: '10 min', sec: 600 },
];

export function renderNewTimer(root, nav, prefill = {}) {
  root.replaceChildren();

  const settings = store.getSettings();
  const state = {
    label: prefill.label ?? '',
    sound: prefill.sound ?? settings.defaultSound ?? DEFAULT_SOUND,
    editingId: prefill.editingId ?? null,
  };
  const init = toHMS(prefill.durationSec ?? 0);

  // ---- search + saved results (FR-10, FR-11) ----
  const savedSection = el('section', { 'aria-label': 'Saved timers' });
  const searchInput = el('input', {
    class: 'search-input',
    type: 'search',
    placeholder: 'Search saved timers',
    'aria-label': 'Search saved timers',
    autocomplete: 'off',
    autocapitalize: 'off',
  });
  const searchIcon = icon('search', 20);
  searchIcon.classList.add('search-icon');
  const clearBtn = el('button', {
    class: 'search-clear', type: 'button', 'aria-label': 'Clear search', hidden: true,
    onClick: () => { searchInput.value = ''; clearBtn.hidden = true; renderSaved(); searchInput.focus(); },
  });
  clearBtn.append(icon('x', 18));
  const searchWrap = el('div', { class: 'search-wrap' }, [searchIcon, searchInput, clearBtn]);
  const savedList = el('ul', { class: 'saved-list' });

  searchInput.addEventListener('input', () => {
    clearBtn.hidden = !searchInput.value;
    renderSaved();
  });

  function renderSaved() {
    const q = searchInput.value.trim().toLowerCase();
    const all = store.getSaved().sort((a, b) => a.label.localeCompare(b.label));
    const results = q ? all.filter((t) => t.label.toLowerCase().includes(q)) : all;
    savedList.replaceChildren();

    if (all.length === 0) {
      savedSection.hidden = false;
      searchWrap.hidden = true;
      savedList.append(el('li', { class: 'empty-note' },
        'No saved timers yet. Set a duration below and tap Save to reuse it later.'));
      return;
    }
    savedSection.hidden = false;
    searchWrap.hidden = false;

    if (results.length === 0) {
      savedList.append(el('li', { class: 'empty-note' }, `No matches for “${q}”.`));
      return;
    }
    for (const t of results) savedList.append(savedRow(t));
  }

  function savedRow(t) {
    const main = el('button', {
      class: 'saved-item__main', type: 'button',
      onClick: () => prefillFrom(t),                 // FR-11: tweak before start
    }, [
      el('span', { class: 'saved-item__label' }, t.label),
      el('span', { class: 'saved-item__dur' }, formatDuration(t.durationSec)),
    ]);

    const editBtn = el('button', {
      class: 'saved-item__act', type: 'button', 'aria-label': `Edit ${t.label}`,
      onClick: () => prefillFrom(t, true),           // FR-13: edit (Save overwrites)
    });
    editBtn.append(icon('edit', 20));

    const delBtn = el('button', {
      class: 'saved-item__act saved-item__act--danger', type: 'button',
      'aria-label': `Delete ${t.label}`,
      onClick: () => deleteSaved(t),                 // FR-12: delete + undo
    });
    delBtn.append(icon('trash', 20));

    const item = el('li', { class: 'saved-item' }, [
      el('div', { class: 'saved-item__row' }, [
        main,
        el('div', { class: 'saved-item__actions' }, [editBtn, delBtn]),
      ]),
    ]);
    attachSwipeToDelete(item, main, () => deleteSaved(t));
    return item;
  }

  function deleteSaved(t) {
    store.deleteSaved(t.id);
    renderSaved();
    // Undo toast, no confirmation dialog (FR-12).
    toast(`Deleted “${t.label}”`, {
      action: { label: 'Undo', onClick: () => { store.upsertSaved(t); renderSaved(); } },
    });
  }

  function prefillFrom(t, editing = false) {
    const { h, m, s } = toHMS(t.durationSec);
    hDial.value = h; mDial.value = m; sDial.value = s;
    labelInput.value = t.label;
    state.label = t.label;
    setSound(t.sound);
    state.editingId = editing ? t.id : null;
    updateActions();
    saveBtn.querySelector('.btn-label').textContent = editing ? 'Update' : 'Save';
    // Bring the dials into view and announce.
    dials.scrollIntoView({ behavior: 'smooth', block: 'center' });
    labelInput.focus();
  }

  savedSection.append(searchWrap, savedList);

  // ---- dials (FR-6) ----
  const onDial = () => updateActions();
  const hDial = new Dial({ label: 'Hours', max: 23, value: init.h, onChange: onDial });
  const mDial = new Dial({ label: 'Minutes', max: 59, value: init.m, onChange: onDial });
  const sDial = new Dial({ label: 'Seconds', max: 59, value: init.s, onChange: onDial });
  const dials = el('div', { class: 'dials', role: 'group', 'aria-label': 'Timer duration' },
    [hDial.el, mDial.el, sDial.el]);

  // ---- presets (FR-7) ----
  const presetRow = el('div', { class: 'presets', role: 'group', 'aria-label': 'Quick presets' },
    PRESETS.map((p) => el('button', {
      class: 'preset', type: 'button',
      onClick: () => { setDuration(p.sec); },
    }, p.label)));

  // ---- label (FR-6) ----
  const labelInput = el('input', {
    type: 'text', maxlength: String(MAX_LABEL), value: state.label,
    placeholder: 'Label (optional)', 'aria-label': 'Timer label', id: 'label-input',
    autocomplete: 'off',
  });
  const labelCount = el('span', { class: 'label-field__count' }, `${state.label.length}/${MAX_LABEL}`);
  labelInput.addEventListener('input', () => {
    state.label = labelInput.value;
    labelCount.textContent = `${labelInput.value.length}/${MAX_LABEL}`;
  });
  const labelField = el('div', { class: 'label-field' }, [
    el('div', { class: 'label-field__row' }, [
      el('label', { for: 'label-input', class: 'dial__label' }, 'Label'),
      labelCount,
    ]),
    labelInput,
  ]);

  // ---- sound selector (FR-9) ----
  const soundChips = new Map();
  function setSound(id) {
    state.sound = id;
    for (const [sid, chip] of soundChips) chip.setAttribute('aria-pressed', String(sid === id));
  }
  const soundGrid = el('div', { class: 'sound-grid', role: 'group', 'aria-label': 'Alarm sound' },
    SOUNDS.map((s) => {
      const chip = el('button', {
        class: 'sound-chip', type: 'button', 'aria-pressed': String(s.id === state.sound),
        onClick: async () => { await unlockAudio(); setSound(s.id); previewSound(s.id, store.getSettings().volume); },
      }, [el('span', { class: 'sound-chip__dot' }), el('span', {}, s.name)]);
      soundChips.set(s.id, chip);
      return chip;
    }));
  const soundSection = el('section', { class: 'sound-select' }, [
    el('h2', { class: 'section-title' }, 'Alarm sound'),
    soundGrid,
  ]);

  // ---- actions (FR-8) ----
  const startBtn = actionBtn('primary', 'play', 'Start', () => doStart(false));
  const saveStartBtn = actionBtn('ghost', 'save', 'Save & Start', () => doStart(true));
  const saveBtn = actionBtn('ghost', 'save', state.editingId ? 'Update' : 'Save', () => doSave());
  const actions = el('div', { class: 'btn-row' }, [
    Object.assign(startBtn, { className: 'btn btn--primary btn--wide' }),
    saveBtn,
    saveStartBtn,
  ]);

  function currentDuration() { return fromHMS(hDial.value, mDial.value, sDial.value); }
  function setDuration(sec) {
    const { h, m, s } = toHMS(sec);
    hDial.value = h; mDial.value = m; sDial.value = s;
    updateActions();
  }
  function updateActions() {
    const dur = currentDuration();
    const zero = dur < 1;
    startBtn.disabled = zero;       // FR-8: zero-duration cannot start
    saveStartBtn.disabled = zero;
    saveBtn.disabled = zero;
  }

  function buildSpec() {
    return { label: cleanLabel(state.label), durationSec: currentDuration(), sound: state.sound };
  }

  async function doStart(alsoSave) {
    const spec = buildSpec();
    if (spec.durationSec < 1) return;
    if (alsoSave) store.upsertSaved({ id: state.editingId || undefined, ...spec, createdAt: Date.now() });
    await unlockAudio();          // first-gesture audio unlock (FR-24)
    onFirstStart();               // contextual notification permission (FR-26)
    engine.startTimer(spec);
    nav.home();
  }

  function doSave() {
    const spec = buildSpec();
    if (spec.durationSec < 1) return;
    const saved = store.upsertSaved({ id: state.editingId || undefined, ...spec, createdAt: Date.now() });
    state.editingId = saved.id;
    toast(`Saved “${saved.label || 'Timer'}”`);
    renderSaved();
  }

  // ---- assemble ----
  root.append(
    savedSection,
    el('h2', { class: 'section-title' }, 'New timer'),
    dials,
    presetRow,
    labelField,
    soundSection,
    actions,
  );

  renderSaved();
  updateActions();
}

function actionBtn(variant, ico, text, onClick) {
  const b = el('button', { class: `btn btn--${variant}`, type: 'button', onClick });
  b.append(icon(ico, 20), el('span', { class: 'btn-label' }, text));
  return b;
}

// Swipe-left-to-delete for saved rows (FR-12). Pointer-based, cancels on tap.
function attachSwipeToDelete(item, handle, onDelete) {
  let startX = 0, dx = 0, active = false, pid = null;
  const main = item.querySelector('.saved-item__main');
  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return; // mouse users have the button
    active = true; pid = e.pointerId; startX = e.clientX; dx = 0;
  });
  handle.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - startX;
    if (dx < 0) main.style.transform = `translateX(${Math.max(dx, -120)}px)`;
  });
  const end = () => {
    if (!active) return;
    active = false;
    main.style.transform = '';
    if (dx < -80) onDelete();
    pid = null;
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  // Long-press alternative
  let lp = null;
  handle.addEventListener('pointerdown', () => { lp = setTimeout(() => onDelete(), 600); });
  handle.addEventListener('pointerup', () => clearTimeout(lp));
  handle.addEventListener('pointermove', () => { if (Math.abs(dx) > 8) clearTimeout(lp); });
}
