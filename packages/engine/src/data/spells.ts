import type { Element } from '../types.js';

/**
 * single : la case visée. cross : croix de 5 cases. square : carré de 9 cases.
 * line : `zoneLength` cases en ligne à partir de la case visée, à l'opposé du lanceur.
 * pierce : toute la ligne, du lanceur jusqu'à la portée maximale (arrêtée par les rochers).
 */
export type Zone = 'single' | 'cross' | 'square' | 'line' | 'pierce';

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
  /** Le lanceur saute sur la case ciblée. */
  jump?: boolean;
  /** Le prochain sort de dégâts double son bonus de distance. */
  buffNextShot?: boolean;
  /** Longueur d'une zone en ligne (zone 'line'). */
  zoneLength?: number;
  /** Après le tir, l'Archer recule de N cases à l'opposé de la cible (si les cases sont libres). */
  recoil?: number;
  /** Déclenche d'un coup la brûlure restante de la cible, multipliée par ce facteur, et l'éteint. */
  detonateBurn?: number;
  /** Multiplicateur de dégâts sur une cible ralentie (PM retirés en attente). */
  bonusVsSlowed?: number;
  /** Multiplicateur de dégâts si la case derrière la cible (dans l'axe du tir) est un rocher ou une unité. */
  bonusVsObstacle?: number;
  /** Rôle du sort dans son élément, affiché dans le grimoire. */
  role: SpellRole;
  description: string;
}

export type SpellRole = 'Base' | 'Zone' | 'Gros coup' | 'Rapide' | 'Contrôle' | 'Mobilité' | 'Contact' | 'Renfort' | 'Fuite';

/** Identité de chaque élément pour l'Archer. */
export const ELEMENT_IDENTITY: Record<Element, { name: string; text: string }> = {
  fire: { name: 'Brûlure', text: 'Dégâts sur la durée, qu’on fait éclater d’un coup.' },
  water: { name: 'Ralenti', text: 'Retire des PM ; une cible ralentie devient vulnérable.' },
  earth: { name: 'Poussée', text: 'Pousse, collisions, frappe plus fort contre un obstacle.' },
  air: { name: 'Distance', text: 'Longue portée, tirs en cloche et recul après le tir.' },
  neutral: { name: 'Utilitaires', text: 'Se dégager et préparer ses tirs.' },
};

/** Catalogue de l'Archer, sorts jusqu'au niveau 20 (tranche T1). Valeurs indicatives du GDD. */
export const SPELLS: SpellDef[] = [
  // --- Niveau 1 ---------------------------------------------------------------------------
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
    role: 'Base',
    description: 'Dégâts Feu + brûlure 2 tours.',
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
    role: 'Fuite',
    description: 'Bondit de 2 cases en ligne droite, par-dessus les obstacles.',
  },
  {
    id: 'tir_de_recul',
    name: 'Tir de recul',
    element: 'air',
    level: 2,
    pa: 3,
    minRange: 1,
    maxRange: 5,
    los: true,
    inLine: true,
    maxPerTurn: 1,
    target: 'unit',
    damage: 8,
    recoil: 1,
    role: 'Mobilité',
    description: 'Dégâts Air en ligne droite, puis l’Archer recule d’une case à l’opposé de la cible.',
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
    role: 'Base',
    description: 'Dégâts Terre + pousse de 2 cases. Dégâts de collision contre un rocher ou un monstre.',
  },
  {
    id: 'ressac',
    name: 'Ressac',
    element: 'water',
    level: 4,
    pa: 3,
    minRange: 1,
    maxRange: 4,
    los: true,
    inLine: true,
    maxPerTurn: 1,
    target: 'cell',
    zone: 'line',
    zoneLength: 3,
    damage: 5,
    pmRemoval: 1,
    role: 'Zone',
    description: 'Vague de 3 cases en ligne : faibles dégâts Eau et -1 PM à chaque ennemi touché.',
  },
  {
    id: 'tison',
    name: 'Tison',
    element: 'fire',
    level: 5,
    pa: 2,
    minRange: 1,
    maxRange: 4,
    los: true,
    maxPerTurn: 2,
    target: 'unit',
    damage: 4,
    burn: { damage: 3, turns: 2 },
    role: 'Rapide',
    description: 'Petit tir Feu rapide qui enflamme la cible 2 tours. 2 fois par tour.',
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
    role: 'Base',
    description: 'Dégâts Eau + retire 1 PM à la cible pour son prochain tour.',
  },
  {
    id: 'roulade',
    name: 'Roulade',
    element: 'neutral',
    level: 7,
    pa: 1,
    minRange: 1,
    maxRange: 1,
    los: false,
    maxPerTurn: 1,
    target: 'emptyCell',
    jump: true,
    role: 'Mobilité',
    description: 'Roule sur une case voisine libre, sans dépenser de PM.',
  },
  {
    id: 'fleche_rocheuse',
    name: 'Flèche rocheuse',
    element: 'earth',
    level: 8,
    pa: 4,
    minRange: 1,
    maxRange: 4,
    los: true,
    inLine: true,
    maxPerTurn: 1,
    target: 'unit',
    damage: 12,
    bonusVsObstacle: 2,
    role: 'Gros coup',
    description: 'Gros dégâts Terre en ligne droite, doublés si un rocher ou une unité se trouve juste derrière la cible.',
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
    role: 'Rapide',
    description: 'Faibles dégâts Air, portée maximale +2.',
  },
  {
    id: 'fleche_explosive',
    name: 'Flèche explosive',
    element: 'fire',
    level: 10,
    pa: 5,
    minRange: 3,
    maxRange: 6,
    los: true,
    maxPerTurn: 1,
    target: 'cell',
    zone: 'square',
    damage: 9,
    role: 'Zone',
    description: 'Explosion Feu sur un carré de 9 cases autour de la case visée.',
  },
  {
    id: 'brume',
    name: 'Brume',
    element: 'water',
    level: 11,
    pa: 4,
    minRange: 2,
    maxRange: 5,
    los: true,
    maxPerTurn: 1,
    target: 'cell',
    zone: 'cross',
    damage: 4,
    pmRemoval: 2,
    role: 'Contrôle',
    description: 'Brume glacée en croix : faibles dégâts Eau et -2 PM à chaque ennemi touché.',
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
    buffNextShot: true,
    role: 'Renfort',
    description: 'Le prochain tir double son bonus de distance (jusqu’à +60 % à 8 cases).',
  },
  {
    id: 'tir_perforant',
    name: 'Tir perforant',
    element: 'earth',
    level: 13,
    pa: 4,
    minRange: 1,
    maxRange: 6,
    los: false,
    inLine: true,
    maxPerTurn: 1,
    target: 'unit',
    zone: 'pierce',
    damage: 9,
    role: 'Zone',
    description: 'Traverse la ligne : dégâts Terre à tous les ennemis alignés, jusqu’au premier rocher.',
  },
  {
    id: 'pluie_de_fleches',
    name: 'Pluie de flèches',
    element: 'air',
    level: 14,
    pa: 4,
    minRange: 3,
    maxRange: 6,
    los: true,
    maxPerTurn: 1,
    target: 'cell',
    zone: 'cross',
    damage: 7,
    role: 'Zone',
    description: 'Dégâts Air en croix autour de la case ciblée.',
  },
  {
    id: 'embrasement',
    name: 'Embrasement',
    element: 'fire',
    level: 15,
    pa: 3,
    minRange: 2,
    maxRange: 6,
    los: true,
    maxPerTurn: 1,
    target: 'unit',
    damage: 6,
    detonateBurn: 1.5,
    role: 'Gros coup',
    description: 'Dégâts Feu, puis toute la brûlure restante de la cible éclate d’un coup, +50 %.',
  },
  {
    id: 'pic_de_glace',
    name: 'Pic de glace',
    element: 'water',
    level: 16,
    pa: 4,
    minRange: 2,
    maxRange: 5,
    los: true,
    maxPerTurn: 1,
    target: 'unit',
    damage: 13,
    bonusVsSlowed: 1.5,
    role: 'Gros coup',
    description: 'Gros dégâts Eau, +50 % sur une cible ralentie.',
  },
  {
    id: 'coup_de_pied',
    name: 'Coup de pied',
    element: 'earth',
    level: 17,
    pa: 2,
    minRange: 1,
    maxRange: 1,
    los: true,
    maxPerTurn: 1,
    target: 'unit',
    damage: 5,
    push: 1,
    gainPm: 1,
    role: 'Contact',
    description: 'Corps à corps : dégâts Terre, pousse de 1 case et rend 1 PM.',
  },
  {
    id: 'fleche_du_zenith',
    name: 'Flèche du zénith',
    element: 'air',
    level: 18,
    pa: 5,
    minRange: 4,
    maxRange: 9,
    los: false,
    maxPerTurn: 1,
    target: 'unit',
    damage: 12,
    role: 'Gros coup',
    description: 'Tir en cloche à très longue portée, sans ligne de vue : gros dégâts Air.',
  },
];

const BY_ID = new Map(SPELLS.map((s) => [s.id, s]));

export function getSpell(id: string): SpellDef {
  const spell = BY_ID.get(id);
  if (!spell) throw new Error(`Sort inconnu : ${id}`);
  return spell;
}
