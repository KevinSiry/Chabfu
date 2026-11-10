import type { Element } from '../types.js';

/** Familles d'objets (GDD section 8). Les anneaux vont dans l'un des deux emplacements d'anneau. */
export type ItemKind = 'arc' | 'carquois' | 'coiffe' | 'cape' | 'plastron' | 'bottes' | 'amulette' | 'anneau';

/** Caractéristiques d'un objet. PV et maîtrises (en %) suivent la puissance de la rareté ; PA et PM restent entiers. */
export interface ItemStats {
  hp?: number;
  pa?: number;
  pm?: number;
  masteries?: Partial<Record<Element, number>>;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  tranche: number;
  /** Caractéristiques en rareté Commune (100 %). */
  stats: ItemStats;
  flavor: string;
}

export interface DropEntry {
  itemId: string;
  /** Taux de drop à la difficulté de référence. */
  baseRate: number;
  /** Difficulté de référence : taux / 10 un palier en dessous, rien plus bas (voir `dropRate`). */
  refDifficulty: number;
}

export const ITEMS: ItemDef[] = [
  // --- T1 : panoplie du Gardien racineux (Bosquet des Ronces) ---
  { id: 'arc_racineux', name: 'Arc racineux', kind: 'arc', tranche: 1, stats: { masteries: { fire: 10, earth: 6 } }, flavor: 'Taillé dans une racine du Gardien, il brûle encore un peu.' },
  { id: 'carquois_epines', name: 'Carquois d’épines', kind: 'carquois', tranche: 1, stats: { hp: 6, masteries: { air: 8, water: 4 } }, flavor: 'Chaque flèche en sort hérissée.' },
  { id: 'coiffe_lierre', name: 'Coiffe de lierre', kind: 'coiffe', tranche: 1, stats: { hp: 15, masteries: { water: 5 } }, flavor: 'Elle repousse d’elle-même quand on la taille.' },
  { id: 'cape_feuilles', name: 'Cape de feuilles mortes', kind: 'cape', tranche: 1, stats: { hp: 10, masteries: { air: 6 } }, flavor: 'Bruisse au moindre pas, mais tient chaud.' },
  { id: 'plastron_ecorce', name: 'Plastron d’écorce', kind: 'plastron', tranche: 1, stats: { hp: 25 }, flavor: 'Épais comme le tronc dont il vient.' },
  { id: 'bottes_mousse', name: 'Bottes de mousse', kind: 'bottes', tranche: 1, stats: { hp: 10, masteries: { earth: 6 } }, flavor: 'On n’entend jamais l’archer arriver.' },
  { id: 'amulette_seve', name: 'Amulette de sève', kind: 'amulette', tranche: 1, stats: { hp: 8, masteries: { fire: 4, water: 4, earth: 4, air: 4 } }, flavor: 'Une goutte de sève figée, tiède au toucher.' },
  { id: 'anneau_ronce', name: 'Anneau de ronce', kind: 'anneau', tranche: 1, stats: { hp: 4, masteries: { fire: 6 } }, flavor: 'Pique le doigt, aiguise le tir.' },
  { id: 'anneau_gardien', name: 'Anneau du Gardien', kind: 'anneau', tranche: 1, stats: { hp: 8, masteries: { fire: 5, water: 5, earth: 5, air: 5 } }, flavor: 'Le cœur du Gardien, resserré en un anneau.' },
];

/** Table de drop du boss de chaque donjon. Chaque entrée est tirée indépendamment. */
export const BOSS_DROP_TABLES: Record<string, DropEntry[]> = {
  bosquet_des_ronces: [
    { itemId: 'arc_racineux', baseRate: 0.2, refDifficulty: 1 },
    { itemId: 'carquois_epines', baseRate: 0.22, refDifficulty: 1 },
    { itemId: 'coiffe_lierre', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'cape_feuilles', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'plastron_ecorce', baseRate: 0.22, refDifficulty: 1 },
    { itemId: 'bottes_mousse', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'amulette_seve', baseRate: 0.15, refDifficulty: 2 },
    { itemId: 'anneau_ronce', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'anneau_gardien', baseRate: 0.1, refDifficulty: 3 },
  ],
};

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ItemDef {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`Objet inconnu : ${id}`);
  return item;
}

export function getBossDropTable(dungeonId: string): DropEntry[] {
  return BOSS_DROP_TABLES[dungeonId] ?? [];
}
