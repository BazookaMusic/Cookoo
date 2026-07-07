import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, parseShare, SCHEMA_VERSION } from '../js/share.js';

test('encode uses base36 seconds + encoded label', () => {
  assert.equal(encodeShare(390, 'Soft-boiled egg'), 'au.Soft-boiled%20egg');
  assert.equal((390).toString(36), 'au');
});

test('roundtrip through parseShare', () => {
  for (const [sec, label] of [[390, 'Egg'], [600, 'Pasta 🍝'], [3661, 'Focaccia proof']]) {
    const s = encodeShare(sec, label);
    const parsed = parseShare(`v=${SCHEMA_VERSION}&s=${s}`);
    assert.equal(parsed.durationSec, sec);
    assert.equal(parsed.label, label);
  }
});

test('parseShare ignores malformed / out-of-range (FR-17)', () => {
  assert.equal(parseShare(''), null);
  assert.equal(parseShare('v=1'), null);            // missing s
  assert.equal(parseShare('v=9&s=au.Egg'), null);   // unknown version
  assert.equal(parseShare('s=.NoDuration'), null);  // empty duration
  assert.equal(parseShare('s=0.Zero'), null);       // zero duration invalid
  assert.equal(parseShare('s=!!.Bad'), null);       // non-base36 duration
  assert.equal(parseShare('s=%%%'), null);          // garbage
});

test('parseShare clamps oversized durations', () => {
  // 100 hours in base36
  const big = (100 * 3600).toString(36);
  const parsed = parseShare(`v=1&s=${big}.Long`);
  assert.equal(parsed.durationSec, 24 * 3600); // clamped to 24h
});

test('version param is optional but must match if present', () => {
  const parsed = parseShare('s=au.Egg');
  assert.equal(parsed.durationSec, 390);
  assert.equal(parsed.label, 'Egg');
});

test('label sanitised on parse', () => {
  const parsed = parseShare('v=1&s=au.' + encodeURIComponent('a\nb'));
  assert.equal(parsed.label, 'a b');
});
