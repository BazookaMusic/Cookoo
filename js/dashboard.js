// Dashboard: one card per running timer, sorted soonest-first with expired
// pinned to top (FR-2..FR-5a). Cards update in place each tick so the DOM
// isn't rebuilt from scratch (keeps it smooth at scale).

import { el, icon, formatDuration, relativeAgo, now } from './util.js';
import * as engine from './engine.js';
import { shareTimer } from './share.js';
import { toast } from './toast.js';

let listEl = null;
const cardEls = new Map(); // id -> { root, refs }

export function renderDashboard(root, nav) {
  root.replaceChildren();
  cardEls.clear();

  const timers = engine.getTimers();
  const head = el('div', { class: 'dash-head' }, [
    el('h1', {}, 'Timers'),
    el('span', { class: 'dash-count' }, countText(timers.length)),
  ]);
  listEl = el('ul', { class: 'timer-list', 'aria-label': 'Running timers' });
  root.append(head, listEl);

  for (const t of timers) {
    const card = buildCard(t, nav);
    cardEls.set(t.id, card);
    listEl.append(card.root);
  }
  update(); // paint initial times
}

function countText(n) {
  return n === 1 ? '1 running' : `${n} running`;
}

function buildCard(t, nav) {
  const time = el('div', { class: 'timer-card__time', role: 'timer' });
  const meta = el('div', { class: 'timer-card__meta' });
  const progress = el('div', { class: 'timer-card__progress' });
  const label = el('div', { class: 'timer-card__label' }, t.label);

  const dismiss = el('button', {
    class: 'timer-card__dismiss', type: 'button', 'aria-label': `Dismiss ${t.label}`,
    onClick: () => engine.dismissTimer(t.id),
  });
  dismiss.append(icon('close', 22));

  const pauseBtn = el('button', { class: 'btn btn--ghost', type: 'button' });
  const pauseIcon = icon('pause', 20);
  const pauseLabel = el('span', {}, 'Pause');
  pauseBtn.append(pauseIcon, pauseLabel);
  pauseBtn.addEventListener('click', () => engine.pauseResume(t.id));

  const resetBtn = el('button', { class: 'btn btn--ghost', type: 'button' });
  resetBtn.append(icon('reset', 20), el('span', {}, 'Reset'));
  resetBtn.addEventListener('click', () => engine.resetTimer(t.id));

  const shareBtn = el('button', { class: 'btn btn--ghost', type: 'button', 'aria-label': `Share ${t.label}` });
  shareBtn.append(icon('share', 18));
  shareBtn.addEventListener('click', () => doShare(t));

  const controls = el('div', { class: 'timer-card__controls' }, [pauseBtn, resetBtn, shareBtn]);

  const root = el('li', { class: 'timer-card' }, [
    progress,
    el('div', { class: 'timer-card__top' }, [label, dismiss]),
    time,
    meta,
    controls,
  ]);

  return { root, refs: { time, meta, progress, label, pauseBtn, pauseIcon, pauseLabel, controls } };
}

async function doShare(t) {
  const res = await shareTimer(t.durationSec, t.label);
  if (res.method === 'copy') toast('Share link copied to clipboard');
  else if (res.method === 'none') toast('Sharing not supported on this device');
}

/**
 * Update all card contents from current engine state. Called every tick.
 * Re-sorts if ordering changed. Returns true if the timer set changed
 * (so the router can re-render the whole view / swap dashboard↔new-timer).
 */
export function update() {
  if (!listEl) return false;
  const timers = engine.getTimers();
  const ids = timers.map((t) => t.id).join(',');
  const domIds = [...cardEls.keys()].join(',');
  if (ids !== domIds) return true; // membership/order changed — let router re-render

  for (const t of timers) {
    const card = cardEls.get(t.id);
    if (!card) continue;
    paintCard(card, t);
  }
  return false;
}

function paintCard(card, t) {
  const { time, meta, progress, label, pauseBtn, pauseIcon, pauseLabel } = card.refs;
  const rem = engine.remainingMs(t);
  const expired = engine.isExpired(t);
  const paused = engine.isPaused(t);
  const ringing = engine.isRinging(t);

  label.textContent = t.label;

  if (expired) {
    time.textContent = '0:00';
    time.setAttribute('aria-label', `${t.label} finished`);
    const ago = relativeAgo(now() - (t.endTime ?? now()));
    meta.textContent = ringing ? 'Finished — tap dismiss to silence' : `Finished ${ago}`;
    progress.style.setProperty('--progress', '1');
    card.root.classList.add('timer-card--done');
    card.root.classList.toggle('timer-card--ringing', ringing);
    card.root.classList.remove('timer-card--paused');
    setPause(card, false, true);
  } else {
    const secs = Math.ceil(rem / 1000);
    time.textContent = formatDuration(secs);
    time.setAttribute('aria-label', `${t.label}, ${formatDuration(secs)} remaining`);
    const frac = 1 - rem / (t.durationSec * 1000);
    progress.style.setProperty('--progress', String(Math.min(1, Math.max(0, frac))));
    meta.textContent = paused ? 'Paused' : `of ${formatDuration(t.durationSec)}`;
    card.root.classList.remove('timer-card--done', 'timer-card--ringing');
    card.root.classList.toggle('timer-card--paused', paused);
    setPause(card, paused, false);
  }
}

function setPause(card, paused, expired) {
  const { pauseBtn, pauseIcon, pauseLabel } = card.refs;
  pauseBtn.disabled = expired;
  if (expired) { pauseLabel.textContent = 'Pause'; return; }
  pauseLabel.textContent = paused ? 'Resume' : 'Pause';
  const next = paused ? 'play' : 'pause';
  const fresh = icon(next, 20);
  pauseIcon.replaceWith(fresh);
  card.refs.pauseIcon = fresh;
}
