/**
 * Effets sonores synthétisés (Web Audio) : aucun fichier à charger, sons courts et ronds façon jeu mobile.
 * Le volume suit les paramètres (général × effets). Le contexte audio démarre au premier geste du joueur.
 */
import { getSettings } from './settings';

export type Sfx = 'tap' | 'select' | 'cancel' | 'cast' | 'hit' | 'hurt' | 'kill' | 'step' | 'turn' | 'room' | 'boss' | 'victory' | 'defeat' | 'error' | 'coin';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** À appeler une fois : débloque l'audio au premier geste (exigence des navigateurs mobiles). */
export function unlockAudio(): void {
  const resume = () => {
    const a = audio();
    if (a?.state === 'suspended') void a.resume();
  };
  window.addEventListener('pointerdown', resume, { capture: true });
  window.addEventListener('keydown', resume, { capture: true });
}

interface Tone {
  f: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  at?: number;
}

function tone(a: AudioContext, t: Tone): void {
  const o = a.createOscillator();
  const g = a.createGain();
  const start = a.currentTime + (t.at ?? 0);
  o.type = t.type ?? 'triangle';
  o.frequency.setValueAtTime(t.f, start);
  if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
  const v = t.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(v, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
  o.connect(g).connect(master!);
  o.start(start);
  o.stop(start + t.dur + 0.02);
}

function noise(a: AudioContext, dur: number, vol: number, freq: number, at = 0): void {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filt = a.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(filt).connect(g).connect(master!);
  src.start(a.currentTime + at);
}

export function sfx(name: Sfx): void {
  const s = getSettings();
  const vol = s.master * s.sfx;
  if (vol <= 0.001) return;
  const a = audio();
  if (!a || !master || a.state !== 'running') return;
  master.gain.value = vol;
  switch (name) {
    case 'tap':
      tone(a, { f: 660, to: 880, dur: 0.06, vol: 0.18 });
      break;
    case 'select':
      tone(a, { f: 520, to: 1040, dur: 0.09, vol: 0.22 });
      break;
    case 'cancel':
      tone(a, { f: 520, to: 300, dur: 0.09, vol: 0.18 });
      break;
    case 'cast':
      noise(a, 0.16, 0.35, 2400);
      tone(a, { f: 900, to: 400, dur: 0.14, type: 'sine', vol: 0.15 });
      break;
    case 'hit':
      noise(a, 0.09, 0.5, 900);
      tone(a, { f: 220, to: 90, dur: 0.12, type: 'square', vol: 0.12 });
      break;
    case 'hurt':
      noise(a, 0.14, 0.6, 500);
      tone(a, { f: 160, to: 60, dur: 0.2, type: 'sawtooth', vol: 0.16 });
      break;
    case 'kill':
      tone(a, { f: 440, to: 880, dur: 0.1, vol: 0.2 });
      tone(a, { f: 660, to: 1320, dur: 0.14, vol: 0.18, at: 0.08 });
      break;
    case 'step':
      tone(a, { f: 180, to: 120, dur: 0.05, type: 'sine', vol: 0.12 });
      break;
    case 'turn':
      tone(a, { f: 587, dur: 0.1, vol: 0.18 });
      tone(a, { f: 880, dur: 0.16, vol: 0.18, at: 0.09 });
      break;
    case 'room':
      [523, 659, 784].forEach((f, i) => tone(a, { f, dur: 0.18, vol: 0.18, at: i * 0.08 }));
      break;
    case 'boss':
      tone(a, { f: 110, to: 82, dur: 0.6, type: 'sawtooth', vol: 0.2 });
      tone(a, { f: 165, to: 123, dur: 0.6, type: 'square', vol: 0.08 });
      noise(a, 0.4, 0.3, 200);
      break;
    case 'victory':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, { f, dur: i === 3 ? 0.5 : 0.16, vol: 0.2, at: i * 0.11 }));
      break;
    case 'defeat':
      [392, 330, 262].forEach((f, i) => tone(a, { f, dur: i === 2 ? 0.6 : 0.22, type: 'sine', vol: 0.22, at: i * 0.2 }));
      break;
    case 'error':
      tone(a, { f: 200, dur: 0.12, type: 'square', vol: 0.1 });
      break;
    case 'coin':
      tone(a, { f: 988, dur: 0.07, vol: 0.18 });
      tone(a, { f: 1319, dur: 0.18, vol: 0.18, at: 0.06 });
      break;
  }
}
