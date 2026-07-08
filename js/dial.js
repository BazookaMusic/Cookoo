// Touch dial for h/m/s (FR-6). Operable by drag, wheel, stepper buttons, and
// keyboard; the value itself is a native number input so screen readers get a
// proper spinbutton and users can just type a value.

import { el, icon } from './util.js';

export class Dial {
  /** @param {{label,max,value,onChange}} opts */
  constructor({ label, max, value = 0, onChange }) {
    this.label = label;
    this.max = max;
    this.min = 0;
    this._value = clamp(value, 0, max);
    this.onChange = onChange || (() => {});
    this.el = this._build();
  }

  get value() { return this._value; }
  set value(v) { this._set(v); }

  _set(v, notify = true) {
    const nv = clamp(Math.round(v), this.min, this.max);
    if (nv === this._value && this.input.value === pad(nv)) return;
    this._value = nv;
    this.input.value = pad(nv);
    this.input.setAttribute('aria-valuenow', String(nv));
    if (notify) this.onChange(nv);
  }

  _step(delta) {
    // Wrap around for a dial feel.
    let v = this._value + delta;
    const span = this.max - this.min + 1;
    v = ((v - this.min) % span + span) % span + this.min;
    this._set(v);
  }

  _build() {
    const up = el('button', {
      class: 'dial__step', type: 'button', tabindex: '-1', 'aria-hidden': 'true',
      onClick: () => this._step(1),
    });
    up.append(icon('up', 22));

    const down = el('button', {
      class: 'dial__step', type: 'button', tabindex: '-1', 'aria-hidden': 'true',
      onClick: () => this._step(-1),
    });
    down.append(icon('down', 22));

    this.input = el('input', {
      class: 'dial__value',
      type: 'number',
      inputmode: 'numeric',
      min: '0',
      max: String(this.max),
      step: '1',
      value: pad(this._value),
      role: 'spinbutton',
      'aria-label': this.label,
      'aria-valuemin': '0',
      'aria-valuemax': String(this.max),
      'aria-valuenow': String(this._value),
    });

    this.input.addEventListener('input', () => {
      const raw = this.input.value.replace(/[^\d]/g, '');
      if (raw === '') return;
      this._set(parseInt(raw, 10));
    });
    this.input.addEventListener('blur', () => { this.input.value = pad(this._value); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); this._step(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this._step(-1); }
    });

    const wrap = el('div', {
      class: 'dial',
      onWheel: (e) => { e.preventDefault(); this._step(e.deltaY < 0 ? 1 : -1); },
    }, [
      up,
      this.input,
      el('span', { class: 'dial__label', 'aria-hidden': 'true' }, this.label),
      down,
    ]);

    this._attachDrag(wrap);
    return wrap;
  }

  _attachDrag(wrap) {
    let startY = 0, startVal = 0, dragging = false, pointerId = null;
    const PX_PER_STEP = 12;

    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === this.input) return; // let typing/focus work
      dragging = true;
      pointerId = e.pointerId;
      startY = e.clientY;
      startVal = this._value;
      wrap.setPointerCapture?.(pointerId);
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const delta = Math.round((startY - e.clientY) / PX_PER_STEP);
      if (delta !== 0) this._set(startVal + delta);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (pointerId != null) { try { wrap.releasePointerCapture(pointerId); } catch { /* */ } }
      pointerId = null;
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
  }
}

function clamp(n, lo, hi) { n = Number(n); if (!Number.isFinite(n)) return lo; return Math.min(hi, Math.max(lo, n)); }
function pad(n) { return String(n).padStart(2, '0'); }
