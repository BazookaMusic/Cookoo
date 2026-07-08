// Built-in alarm sounds, fully synthesised with Web Audio (FR-23) — no audio
// files to ship or precache, so everything works offline and the bundle stays
// tiny (NFR-2). Each sound is a short, distinct, loopable pattern.

export const SOUNDS = [
  { id: 'bell',    name: 'Bell' },
  { id: 'beep',    name: 'Beep' },
  { id: 'marimba', name: 'Marimba' },
  { id: 'chime',   name: 'Chime' },
  { id: 'radar',   name: 'Radar' },
];
export const SOUND_IDS = SOUNDS.map((s) => s.id);
export const DEFAULT_SOUND = 'bell';

export function soundName(id) {
  return (SOUNDS.find((s) => s.id === id) || SOUNDS[0]).name;
}

let ctx = null;
let masterGain = null;

/** Create/resume the AudioContext. Must be called from a user gesture (FR-24). */
export async function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* ignore */ }
  }
  // Prime the pipeline with a silent blip so the first real alarm is instant.
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(masterGain);
    o.start();
    o.stop(ctx.currentTime + 0.02);
  } catch { /* ignore */ }
  return ctx.state === 'running';
}

export function audioAvailable() {
  return !!ctx && ctx.state === 'running';
}

// ---- one "hit" per sound: schedules notes at time t, returns loop period ----

function tone(dest, t, freq, dur, type, peak, decay = dur) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const HITS = {
  bell(dest, t) {
    // Struck bell: fundamental + inharmonic partials with long decay.
    tone(dest, t, 660, 1.6, 'sine', 0.5, 1.6);
    tone(dest, t, 1320, 1.2, 'sine', 0.22, 1.2);
    tone(dest, t, 1980, 0.8, 'sine', 0.12, 0.8);
    tone(dest, t, 2640, 0.5, 'sine', 0.06, 0.5);
    return 1.9;
  },
  beep(dest, t) {
    // Digital double-beep.
    tone(dest, t, 1000, 0.12, 'square', 0.22, 0.12);
    tone(dest, t + 0.18, 1000, 0.12, 'square', 0.22, 0.12);
    return 1.0;
  },
  marimba(dest, t) {
    // Woody mallet: two quick ascending notes.
    tone(dest, t, 523.25, 0.4, 'sine', 0.5, 0.35);
    tone(dest, t, 1046.5, 0.3, 'sine', 0.12, 0.25);
    tone(dest, t + 0.16, 783.99, 0.4, 'sine', 0.5, 0.35);
    tone(dest, t + 0.16, 1567.98, 0.3, 'sine', 0.1, 0.25);
    return 1.1;
  },
  chime(dest, t) {
    // Gentle three-note ascending chime (major triad).
    tone(dest, t, 587.33, 1.2, 'triangle', 0.4, 1.2);
    tone(dest, t + 0.22, 739.99, 1.2, 'triangle', 0.4, 1.2);
    tone(dest, t + 0.44, 880, 1.4, 'triangle', 0.4, 1.4);
    return 1.9;
  },
  radar(dest, t) {
    // Rising "radar" sweep pings, four in a row.
    for (let i = 0; i < 4; i++) {
      tone(dest, t + i * 0.16, 880, 0.14, 'sawtooth', 0.16, 0.14);
    }
    return 1.2;
  },
};

/**
 * An Alarm loops a sound until stopped. Volume fades in over ~1s (FR-25).
 */
export class Alarm {
  constructor(soundId, volume = 0.9) {
    this.soundId = HITS[soundId] ? soundId : DEFAULT_SOUND;
    this.volume = volume;
    this.gain = null;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (!ctx || ctx.state !== 'running' || this.running) return false;
    this.running = true;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(
      Math.max(0.01, this.volume), ctx.currentTime + 1.0,
    );
    this.gain.connect(masterGain);

    const hit = HITS[this.soundId];
    const play = () => {
      if (!this.running) return;
      // Hits route through this alarm's fade-in gain node.
      const period = hit(this.gain, ctx.currentTime + 0.02);
      this.timer = setTimeout(play, Math.max(400, period * 1000));
    };
    play();
    return true;
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.gain && ctx) {
      const g = this.gain;
      try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
        setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 300);
      } catch { try { g.disconnect(); } catch { /* */ } }
      this.gain = null;
    }
  }
}

/** Preview a single hit of a sound (for the sound selector, FR-9). */
export function previewSound(soundId, volume = 0.9) {
  if (!ctx || ctx.state !== 'running') return;
  const g = ctx.createGain();
  g.gain.value = Math.min(1, Math.max(0, volume));
  g.connect(masterGain);
  (HITS[soundId] || HITS[DEFAULT_SOUND])(g, ctx.currentTime + 0.02);
  setTimeout(() => { try { g.disconnect(); } catch { /* */ } }, 2500);
}

export function setMasterVolume(v) {
  if (masterGain && ctx) masterGain.gain.setValueAtTime(Math.min(1, Math.max(0, v)), ctx.currentTime);
}
