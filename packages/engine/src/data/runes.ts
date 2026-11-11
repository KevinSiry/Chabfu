/**
 * Runes (GDD section 8, système validé par Kevin le 2026-11-11).
 * Une rune se sertit dans un emplacement d'objet et ajoute une petite stat fixe (pas de jet).
 * Trois niveaux : Brute, Taillée, Parfaite. Pas de rune PA ni PM, trop fortes.
 */
import type { Element } from '../types.js';

export type RuneType = 'braise' | 'maree' | 'racine' | 'rafale' | 'seve' | 'rempart' | 'pointe' | 'mire' | 'horizon';
export type RuneGrade = 'brute' | 'taillee' | 'parfaite';

export const RUNE_GRADES: RuneGrade[] = ['brute', 'taillee', 'parfaite'];
export const RUNE_GRADE_LABEL: Record<RuneGrade, string> = { brute: 'Brute', taillee: 'Taillée', parfaite: 'Parfaite' };

export type RuneEffect =
  | { stat: 'mastery'; element: Element }
  | { stat: 'hp' }
  | { stat: 'resistanceAll' }
  | { stat: 'damage' }
  | { stat: 'range' }
  /** Sans effet : rune de Focus neutralisée depuis le retrait de la Concentration (gardée pour les sauvegardes). */
  | { stat: 'horizon' };

export interface RuneDef {
  type: RuneType;
  name: string;
  effect: RuneEffect;
  /** Valeur par niveau ; null = ce niveau n'existe pas pour ce type. */
  values: Record<RuneGrade, number | null>;
  /** Une seule rune de ce type compte sur tout l'équipement porté. */
  unique?: boolean;
  /** Poids dans le tirage du type d'une rune trouvée sur le boss. */
  dropWeight: number;
}

export const RUNES: RuneDef[] = [
  { type: 'braise', name: 'Rune de Braise', effect: { stat: 'mastery', element: 'fire' }, values: { brute: 1, taillee: 2, parfaite: 3 }, dropWeight: 1 },
  { type: 'maree', name: 'Rune de Marée', effect: { stat: 'mastery', element: 'water' }, values: { brute: 1, taillee: 2, parfaite: 3 }, dropWeight: 1 },
  { type: 'racine', name: 'Rune de Racine', effect: { stat: 'mastery', element: 'earth' }, values: { brute: 1, taillee: 2, parfaite: 3 }, dropWeight: 1 },
  { type: 'rafale', name: 'Rune de Rafale', effect: { stat: 'mastery', element: 'air' }, values: { brute: 1, taillee: 2, parfaite: 3 }, dropWeight: 1 },
  { type: 'seve', name: 'Rune de Sève', effect: { stat: 'hp' }, values: { brute: 4, taillee: 8, parfaite: 12 }, dropWeight: 1 },
  { type: 'rempart', name: 'Rune de Rempart', effect: { stat: 'resistanceAll' }, values: { brute: 1, taillee: 1, parfaite: 2 }, dropWeight: 1 },
  { type: 'pointe', name: 'Rune de Pointe', effect: { stat: 'damage' }, values: { brute: null, taillee: 1, parfaite: 2 }, dropWeight: 0.6 },
  { type: 'mire', name: 'Rune de Mire', effect: { stat: 'range' }, values: { brute: null, taillee: null, parfaite: 1 }, unique: true, dropWeight: 0.5 },
  // Horizon (choix de Kevin, 2026-11-11) : le bonus de distance démarre une case plus tôt et va une case plus loin.
  { type: 'horizon', name: 'Rune d’Horizon', effect: { stat: 'horizon' }, values: { brute: null, taillee: null, parfaite: 1 }, unique: true, dropWeight: 0.5 },
];

const BY_TYPE = new Map<string, RuneDef>(RUNES.map((r) => [r.type, r]));
/** Anciens types renommés : la rune de Focus (Concentration, retirée) est devenue la rune d'Horizon. */
export const RUNE_TYPE_ALIASES: Record<string, RuneType> = { focus: 'horizon' };
for (const [old, now] of Object.entries(RUNE_TYPE_ALIASES)) BY_TYPE.set(old, BY_TYPE.get(now)!);

export function getRune(type: RuneType): RuneDef {
  const r = BY_TYPE.get(type);
  if (!r) throw new Error(`Rune inconnue : ${type}`);
  return r;
}

/** Clé d'une rune précise, stockée dans l'inventaire et dans les emplacements d'objet : « braise:taillee ». */
export type RuneKey = `${RuneType}:${RuneGrade}`;

export function runeKey(type: RuneType, grade: RuneGrade): RuneKey {
  return `${type}:${grade}`;
}

export function parseRuneKey(key: string): { type: RuneType; grade: RuneGrade; def: RuneDef; value: number } {
  const [type, grade] = key.split(':') as [RuneType, RuneGrade];
  const def = getRune(type);
  const value = def.values[grade];
  if (value === null || value === undefined) throw new Error(`Rune inexistante : ${key}`);
  return { type: def.type, grade, def, value };
}

/** Clé d'une rune avec son type à jour (« focus:parfaite » → « horizon:parfaite »). */
export function canonicalRuneKey(key: string): RuneKey {
  const [type, grade] = key.split(':');
  return `${RUNE_TYPE_ALIASES[type] ?? type}:${grade}` as RuneKey;
}

export function runeExists(type: RuneType, grade: RuneGrade): boolean {
  return getRune(type).values[grade] !== null;
}

/** Toutes les runes qui existent, dans l'ordre d'affichage. */
export const ALL_RUNE_KEYS: RuneKey[] = RUNES.flatMap((r) => RUNE_GRADES.filter((g) => r.values[g] !== null).map((g) => runeKey(r.type, g)));

/**
 * Runes trouvées sur le boss : une chance par niveau, branchée sur la difficulté avec `dropRate`
 * (difficulté de référence : Brute 4, Taillée 6, Parfaite 9 ; taux / 10 un palier en dessous).
 */
export const RUNE_DROPS: Record<RuneGrade, { refDifficulty: number; baseRate: number }> = {
  brute: { refDifficulty: 4, baseRate: 0.05 },
  taillee: { refDifficulty: 6, baseRate: 0.04 },
  parfaite: { refDifficulty: 9, baseRate: 0.03 },
};

/** Fusion : 3 runes identiques + éclats de la tranche + ressources de palier donnent le niveau au-dessus. */
export const RUNE_FUSION: Record<Exclude<RuneGrade, 'brute'>, { count: number; shards: number; tier: 'mythic' | 'ultimate'; resources: number }> = {
  taillee: { count: 3, shards: 8, tier: 'mythic', resources: 1 },
  parfaite: { count: 3, shards: 25, tier: 'ultimate', resources: 2 },
};

/** Éclats pour extraire une rune sertie sans la détruire. */
export const RUNE_EXTRACT_COST: Record<RuneGrade, number> = { brute: 5, taillee: 15, parfaite: 40 };
