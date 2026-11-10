import type { Element } from '../types.js';

export type Zone = 'single' | 'cross' | 'square';

export interface SpellDef {
  id: string;
  name: string;
  element: Element;
  /** Niveau de déblocage. */
  level: number;
  pa: number;
  minRange: number;
  maxRange: number;
  /** Ligne de vue requise. */
  los: boolean;
  /** Ciblage en ligne droite uniquement. */
  inLine?: boolean;
  maxPerTurn?: number;
  /**
   * unit : une unité ennemie doit occuper la case ciblée.
   * cell : n'importe quelle case de sol.
   * emptyCell : une case de sol libre (déplacements).
   * self : le lanceur.
   */
  target: 'unit' | 'cell' | 'emptyCell' | 'self';
  zone?: Zone;
  damage?: number;
  burn?: { damage: number; turns: number };
  push?: number;
  pmRemoval?: number;
  gainPm?: number;
  /** Concentration requise et consommée. */
  concentrationCost?: number;
  /** Concentration perdue (sans prérequis). */
  concentrationLoss?: number;
  concentrationGain?: number;
  /** Distance minimale lanceur → cible pour gagner la Concentration. */
  concentrationGainMinDistance?: number;
  /** Le lanceur saute sur la case ciblée. */
  jump?: boolean;
  buffNextShot?: boolean;
  description: string;
}

/** Catalogue de l'Archer, sorts jusqu'au niveau 20 (tranche T1). Valeurs indicatives du GDD. */
export const SPELLS: SpellDef[] = [
  {
    id: 'fleche_ardente',
    name: 'Flèche ardente',
    element: 'fire',
    level: 1,
    pa: 3,
    minRange: 2,
    maxRange: 6,
    los: true,
    maxPerTurn: 2,
    target: 'unit',
    damage: 12,
    burn: { damage: 4, turns: 2 },
    concentrationGain: 1,
    concentrationGainMinDistance: 5,
    description: 'Dégâts Feu + brûlure 2 tours. +1 Concentration si la cible est à 5 cases ou plus.',
  },
  {
    id: 'bond_arriere',
    name: 'Bond arrière',
    element: 'neutral',
    level: 1,
    pa: 2,
    minRange: 2,
    maxRange: 2,
    los: false,
    inLine: true,
    maxPerTurn: 1,
    target: 'emptyCell',
    jump: true,
    concentrationLoss: 1,
    description: 'Bondit de 2 cases en ligne droite, par-dessus les obstacles. -1 Concentration.',
  },
  {
    id: 'fleche_fracassante',
    name: 'Flèche fracassante',
    element: 'earth',
    level: 3,
    pa: 4,
    minRange: 1,
    maxRange: 5,
    los: true,
    inLine: true,
    maxPerTurn: 1,
    target: 'unit',
    damage: 10,
    push: 2,
    description: 'Dégâts Terre + pousse de 2 cases. Dégâts de collision contre un rocher ou un monstre.',
  },
  {
    id: 'fleche_givree',
    name: 'Flèche givrée',
    element: 'water',
    level: 6,
    pa: 3,
    minRange: 2,
    maxRange: 6,
    los: true,
    maxPerTurn: 2,
    target: 'unit',
    damage: 9,
    pmRemoval: 1,
    description: 'Dégâts Eau + retire 1 PM à la cible pour son prochain tour.',
  },
  {
    id: 'fleche_du_vent',
    name: 'Flèche du vent',
    element: 'air',
    level: 9,
    pa: 2,
    minRange: 2,
    maxRange: 8,
    los: true,
    maxPerTurn: 3,
    target: 'unit',
    damage: 6,
    description: 'Faibles dégâts Air, portée maximale +2.',
  },
  {
    id: 'tir_concentre',
    name: 'Tir concentré',
    element: 'neutral',
    level: 12,
    pa: 2,
    minRange: 0,
    maxRange: 0,
    los: false,
    maxPerTurn: 1,
    target: 'self',
    concentrationCost: 4,
    buffNextShot: true,
    description: 'Consomme 4 Concentration : le prochain tir inflige le double de dégâts.',
  },
  {
    id: 'pluie_de_fleches',
    name: 'Pluie de flèches',
    element: 'air',
    level: 15,
    pa: 4,
    minRange: 3,
    maxRange: 6,
    los: true,
    maxPerTurn: 1,
    target: 'cell',
    zone: 'cross',
    damage: 7,
    description: 'Dégâts Air en croix autour de la case ciblée.',
  },
  {
    id: 'coup_de_pied',
    name: 'Coup de pied',
    element: 'earth',
    level: 18,
    pa: 2,
    minRange: 1,
    maxRange: 1,
    los: true,
    maxPerTurn: 1,
    target: 'unit',
    damage: 5,
    push: 1,
    gainPm: 1,
    description: 'Corps à corps : dégâts Terre, pousse de 1 case et rend 1 PM.',
  },
];

const BY_ID = new Map(SPELLS.map((s) => [s.id, s]));

export function getSpell(id: string): SpellDef {
  const spell = BY_ID.get(id);
  if (!spell) throw new Error(`Sort inconnu : ${id}`);
  return spell;
}
