import { SPELLS, type SpellDef } from './data/spells.js';

export interface Tranche {
  id: number;
  minLevel: number;
  maxLevel: number;
  /** Niveau auquel le personnage est ramené quand il se redéfinit sur la tranche. */
  redefinitionLevel: number;
  deckSize: number;
  passiveSlots: number;
}

export const MAX_LEVEL = 100;

export const TRANCHES: Tranche[] = [
  { id: 1, minLevel: 1, maxLevel: 20, redefinitionLevel: 20, deckSize: 5, passiveSlots: 1 },
  { id: 2, minLevel: 21, maxLevel: 40, redefinitionLevel: 40, deckSize: 6, passiveSlots: 2 },
  { id: 3, minLevel: 41, maxLevel: 60, redefinitionLevel: 60, deckSize: 7, passiveSlots: 3 },
  { id: 4, minLevel: 61, maxLevel: 80, redefinitionLevel: 80, deckSize: 8, passiveSlots: 4 },
  { id: 5, minLevel: 81, maxLevel: 100, redefinitionLevel: 100, deckSize: 8, passiveSlots: 5 },
];

export function getTranche(id: number): Tranche {
  const t = TRANCHES.find((tr) => tr.id === id);
  if (!t) throw new Error(`Tranche inconnue : ${id}`);
  return t;
}

export function trancheForLevel(level: number): Tranche {
  const t = TRANCHES.find((tr) => level >= tr.minLevel && level <= tr.maxLevel);
  if (!t) throw new Error(`Niveau hors limites : ${level}`);
  return t;
}

/** Tranches sur lesquelles un personnage de ce niveau peut se redéfinir. */
export function availableTranches(level: number): Tranche[] {
  return TRANCHES.filter((t) => t.minLevel <= level);
}

/**
 * Niveau effectif d'un personnage redéfini sur une tranche : le niveau de redéfinition,
 * ou son vrai niveau s'il est encore en cours de tranche.
 */
export function effectiveLevel(level: number, trancheId: number): number {
  const t = getTranche(trancheId);
  if (t.minLevel > level) throw new Error(`Niveau ${level} insuffisant pour la tranche T${trancheId}`);
  return Math.min(level, t.redefinitionLevel);
}

export function availableSpells(effectiveLvl: number): SpellDef[] {
  return SPELLS.filter((s) => s.level <= effectiveLvl);
}

/** Retourne un message d'erreur si le deck est invalide pour ce niveau effectif et cette tranche, sinon null. */
export function validateDeck(deck: string[], trancheId: number, effectiveLvl: number): string | null {
  const t = getTranche(trancheId);
  if (deck.length === 0) return 'Le deck est vide.';
  if (deck.length > t.deckSize) return `Le deck de la tranche T${t.id} est limité à ${t.deckSize} sorts.`;
  if (new Set(deck).size !== deck.length) return 'Un sort ne peut figurer qu’une fois dans le deck.';
  const allowed = new Set(availableSpells(effectiveLvl).map((s) => s.id));
  for (const id of deck) {
    if (!allowed.has(id)) return `Sort indisponible au niveau ${effectiveLvl} : ${id}`;
  }
  return null;
}
