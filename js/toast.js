// Lightweight toast with an optional action button (used for undo delete,
// FR-12, and one-time hints, FR-24). No confirmation dialogs.

import { el, icon } from './util.js';

const host = () => document.getElementById('toast-host');

/**
 * Show a toast. options: { action: {label, onClick}, duration=5000 }.
 * Returns a dismiss() function.
 */
export function toast(message, options = {}) {
  const { action, duration = 5000 } = options;
  const node = el('div', { class: 'toast', role: 'status' });
  node.append(el('span', { text: message }));

  let done = false;
  let timer = null;
  const dismiss = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    node.style.transition = 'opacity .15s ease';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 160);
  };

  if (action) {
    node.append(el('button', {
      class: 'toast__action',
      type: 'button',
      onClick: () => { action.onClick?.(); dismiss(); },
    }, action.label));
  } else {
    const close = el('button', {
      class: 'toast__action', type: 'button', 'aria-label': 'Dismiss', onClick: dismiss,
    });
    close.append(icon('x', 18));
    node.append(close);
  }

  host().append(node);
  if (duration > 0) timer = setTimeout(dismiss, duration);
  return dismiss;
}
