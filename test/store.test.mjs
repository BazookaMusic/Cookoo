import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage + window shim so store.js runs under Node.
class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}
globalThis.localStorage = new MemStorage();
globalThis.window = { addEventListener() {} };

const store = await import('../js/store.js');

test('invalid saved entries are dropped, not thrown on (FR-21)', () => {
  localStorage.setItem(store.KEYS.saved, JSON.stringify([
    { id: 'a', label: 'Egg', durationSec: 390, sound: 'bell', createdAt: 1 },
    { id: 'b', durationSec: 0 },                 // zero duration -> dropped
    null,                                         // junk -> dropped
    { label: 'NoId', durationSec: 120, sound: 'nope' }, // bad sound -> defaulted, id filled
    'not-an-object',
  ]));
  const list = store.getSaved();
  assert.equal(list.length, 2);
  assert.equal(list[0].label, 'Egg');
  const filled = list[1];
  assert.ok(filled.id, 'id was generated');
  assert.equal(filled.sound, 'bell'); // default sound
});

test('corrupt JSON falls back to empty list', () => {
  localStorage.setItem(store.KEYS.saved, '{not json');
  assert.deepEqual(store.getSaved(), []);
});

test('running timer validation: paused needs remainingMs', () => {
  localStorage.setItem(store.KEYS.running, JSON.stringify([
    { id: 'r1', label: 'Live', durationSec: 60, sound: 'beep', startTime: 1, endTime: 999, remainingMs: null },
    { id: 'r2', label: 'Paused', durationSec: 60, sound: 'beep', startTime: 1, endTime: null, remainingMs: 30000 },
    { id: 'r3', label: 'BadPaused', durationSec: 60, sound: 'beep', endTime: null, remainingMs: null }, // invalid
  ]));
  const list = store.getRunning();
  assert.equal(list.length, 2);
  assert.equal(list.find((t) => t.id === 'r2').remainingMs, 30000);
});

test('upsert + delete saved', () => {
  localStorage.clear();
  const t = store.upsertSaved({ label: 'Pasta', durationSec: 600, sound: 'bell', createdAt: 1 });
  assert.ok(t.id);
  assert.equal(store.getSaved().length, 1);
  const edited = store.upsertSaved({ ...t, label: 'Pasta al dente' });
  assert.equal(store.getSaved().length, 1); // overwrite, not append
  assert.equal(edited.label, 'Pasta al dente');
  store.deleteSaved(t.id);
  assert.equal(store.getSaved().length, 0);
});

test('settings validated with sane defaults', () => {
  localStorage.clear();
  const s = store.getSettings();
  assert.equal(s.theme, 'auto');
  assert.equal(s.wakeLock, true);
  const updated = store.setSettings({ theme: 'purple', volume: 5 });
  assert.equal(updated.theme, 'auto'); // invalid theme rejected
  assert.equal(updated.volume, 1);     // clamped
});
