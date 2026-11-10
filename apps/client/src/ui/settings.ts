/**
 * Paramètres du joueur (son, vibrations, vitesse, accessibilité), sauvegardés à part de la partie.
 */
export interface Settings {
  /** Volumes de 0 à 1. */
  master: number;
  music: number;
  sfx: number;
  vibrate: boolean;
  /** Vitesse des animations de combat. */
  speed: 1 | 1.5 | 2;
  /** 'auto' suit la préférence du système. */
  motion: 'auto' | 'full' | 'reduced';
  text: 'md' | 'lg' | 'xl';
  cvd: boolean;
  /** Bulles d'aide déjà vues, tutoriel terminé ou passé. */
  seenTips: string[];
  tutorialDone: boolean;
}

const KEY = 'chabfu.settings.v1';
const DEFAULTS: Settings = { master: 0.8, music: 0.5, sfx: 0.9, vibrate: true, speed: 1, motion: 'auto', text: 'md', cvd: false, seenTips: [], tutorialDone: false };

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* stockage indisponible : réglages valables pour la session */
  }
  applySettings();
  listeners.forEach((l) => l(current));
}

export function onSettingsChange(l: (s: Settings) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Pose les réglages visuels sur <html> (lus par tokens.css). */
export function applySettings(): void {
  const root = document.documentElement;
  if (current.motion === 'auto') delete root.dataset.motion;
  else root.dataset.motion = current.motion;
  if (current.text === 'md') delete root.dataset.text;
  else root.dataset.text = current.text;
  if (current.cvd) root.dataset.cvd = 'on';
  else delete root.dataset.cvd;
}

/** Mouvements réduits effectifs (réglage ou préférence du système). */
export function reducedMotion(): boolean {
  if (current.motion === 'reduced') return true;
  if (current.motion === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function markTipSeen(id: string): boolean {
  if (current.seenTips.includes(id)) return false;
  updateSettings({ seenTips: [...current.seenTips, id] });
  return true;
}
