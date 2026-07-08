// Theme handling (FR-27): default follows prefers-color-scheme; manual
// override persisted in settings.

import * as store from './store.js';

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme'); // 'auto' -> follow prefers-color-scheme
  }
  updateThemeColorMeta();
}

export function initTheme() {
  applyTheme(store.getSettings().theme);
  // React to OS theme changes while in auto mode.
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => {
    if (store.getSettings().theme === 'auto') updateThemeColorMeta();
  });
  store.subscribe((what) => {
    if (what === 'settings') applyTheme(store.getSettings().theme);
  });
}

function updateThemeColorMeta() {
  // Let the browser chrome match the active surface.
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (!document.documentElement.getAttribute('data-theme')
        && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const color = dark ? '#0e1113' : '#f6f7f9';
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}
