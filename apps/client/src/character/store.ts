import { parseCharacter, type Character } from '@chabfu/engine';

/** Sauvegarde locale du personnage, séparée de celle des réglages et des scores. */
const KEY = 'chabfu.character.v1';

let current: Character | null = load();

function load(): Character | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseCharacter(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function getCharacter(): Character | null {
  return current;
}

export function saveCharacter(c: Character): void {
  current = c;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* stockage indisponible : la partie continue sans sauvegarde */
  }
}

export function deleteCharacter(): void {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien */
  }
}
