import type { Element } from '../types.js';

/** Familles d'objets (GDD section 8). Les anneaux vont dans l'un des deux emplacements d'anneau. */
export type ItemKind = 'arc' | 'carquois' | 'coiffe' | 'cape' | 'plastron' | 'bottes' | 'amulette' | 'anneau';

/**
 * Caractéristiques d'un objet, données en rareté Mythique (100 %).
 * Toutes suivent la puissance de la rareté (Commune 40 % … Légendaire 120 %), arrondie à l'entier :
 * les +1 (PA, PM, portée, Concentration) n'apparaissent donc qu'à partir d'Inhabituelle.
 */
export interface ItemStats {
  hp?: number;
  pa?: number;
  pm?: number;
  /** +% de dégâts infligés dans l'élément. */
  masteries?: Partial<Record<Element, number>>;
  /** -% de dégâts reçus dans l'élément (total plafonné, voir MAX_RESISTANCE). */
  resistances?: Partial<Record<Element, number>>;
  /** Dégâts fixes ajoutés à chaque coup de sort, avant les multiplicateurs. */
  damage?: number;
  /** Portée maximale en plus pour les tirs à distance. */
  range?: number;
  /** Concentration gagnée au début de chaque salle. */
  concentration?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  tranche: number;
  /** Caractéristiques en rareté Mythique (référence, 100 %). */
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
  { id: 'arc_racineux', name: 'Arc racineux', kind: 'arc', tranche: 1, stats: { masteries: { fire: 14, earth: 5 }, damage: 2 }, flavor: 'Taillé dans une racine du Gardien, il brûle encore un peu.' },
  { id: 'carquois_epines', name: 'Carquois d’épines', kind: 'carquois', tranche: 1, stats: { hp: 10, masteries: { fire: 10, air: 5 }, concentration: 1 }, flavor: 'Chaque flèche en sort hérissée.' },
  { id: 'coiffe_lierre', name: 'Coiffe de lierre', kind: 'coiffe', tranche: 1, stats: { hp: 24, masteries: { air: 8, earth: 5 }, resistances: { earth: 10, water: 6 } }, flavor: 'Elle repousse d’elle-même quand on la taille.' },
  { id: 'cape_feuilles', name: 'Cape de feuilles mortes', kind: 'cape', tranche: 1, stats: { hp: 16, masteries: { earth: 8, fire: 5 }, resistances: { air: 10 } }, flavor: 'Bruisse au moindre pas, mais tient chaud.' },
  { id: 'plastron_ecorce', name: 'Plastron d’écorce', kind: 'plastron', tranche: 1, stats: { hp: 40, resistances: { earth: 8, water: 8 } }, flavor: 'Épais comme le tronc dont il vient.' },
  { id: 'bottes_mousse', name: 'Bottes de mousse', kind: 'bottes', tranche: 1, stats: { hp: 16, masteries: { fire: 6, earth: 5 }, resistances: { earth: 6 } }, flavor: 'On n’entend jamais l’archer arriver.' },
  { id: 'amulette_seve', name: 'Amulette de sève', kind: 'amulette', tranche: 1, stats: { hp: 13, masteries: { fire: 5, water: 5, earth: 5, air: 5 }, concentration: 1 }, flavor: 'Une goutte de sève figée, tiède au toucher.' },
  { id: 'anneau_ronce', name: 'Anneau de ronce', kind: 'anneau', tranche: 1, stats: { hp: 6, masteries: { fire: 8 }, damage: 2 }, flavor: 'Pique le doigt, aiguise le tir.' },
  { id: 'anneau_gardien', name: 'Anneau du Gardien', kind: 'anneau', tranche: 1, stats: { hp: 13, masteries: { fire: 5, water: 5, earth: 5, air: 5 }, resistances: { fire: 5, water: 5, earth: 5, air: 5 } }, flavor: 'Le cœur du Gardien, resserré en un anneau.' },
  // --- T1 : butin de la Reine Batracienne (Tourbière des Noyés) ---
  { id: 'arc_roseau', name: 'Arc de roseau', kind: 'arc', tranche: 1, stats: { masteries: { air: 14, water: 5 }, range: 1 }, flavor: 'Léger comme un brin de roseau, il siffle à chaque tir.' },
  { id: 'cape_vase', name: 'Cape de vase séchée', kind: 'cape', tranche: 1, stats: { hp: 19, masteries: { water: 8, air: 3 }, resistances: { water: 10 } }, flavor: 'Elle craquelle, mais rien ne la traverse.' },
  { id: 'bottes_batracien', name: 'Bottes de batracien', kind: 'bottes', tranche: 1, stats: { hp: 13, masteries: { water: 6, air: 5 }, pm: 1 }, flavor: 'Pour ne plus jamais s’enliser.' },
  { id: 'anneau_nenuphar', name: 'Anneau de nénuphar', kind: 'anneau', tranche: 1, stats: { hp: 10, masteries: { water: 8, air: 5 }, resistances: { water: 6, air: 6 } }, flavor: 'Une fleur de la mare, figée dans l’ambre.' },
  // --- T1 : butin du Golem de magma (Caldeira des Cendres) ---
  { id: 'arc_obsidienne', name: 'Arc d’obsidienne', kind: 'arc', tranche: 1, stats: { masteries: { water: 14, fire: 5 }, damage: 2 }, flavor: 'Du verre volcanique trempé dans l’eau glacée.' },
  { id: 'plastron_scorie', name: 'Plastron de scorie', kind: 'plastron', tranche: 1, stats: { hp: 48, resistances: { fire: 13 } }, flavor: 'Lourd, mais la lave glisse dessus.' },
  { id: 'coiffe_cendres', name: 'Coiffe de cendres', kind: 'coiffe', tranche: 1, stats: { hp: 19, masteries: { water: 8, fire: 5 }, resistances: { fire: 10 } }, flavor: 'Elle sent encore le feu de bois.' },
  { id: 'amulette_braise', name: 'Amulette de braise', kind: 'amulette', tranche: 1, stats: { hp: 10, masteries: { fire: 8, water: 5 }, concentration: 1, resistances: { fire: 6 } }, flavor: 'Une braise du Golem qui refuse de s’éteindre.' },
  // --- T1 : butin de la Harpie matriarche (Falaises Hurlantes) ---
  { id: 'arc_plumes', name: 'Arc des cimes', kind: 'arc', tranche: 1, stats: { masteries: { earth: 14, air: 5 }, range: 1 }, flavor: 'Bois noueux des crêtes, tendu de crin de bouquetin.' },
  { id: 'carquois_serres', name: 'Carquois de serres', kind: 'carquois', tranche: 1, stats: { hp: 10, masteries: { earth: 10, water: 5 }, damage: 2 }, flavor: 'Les flèches y sont tenues par des griffes.' },
  { id: 'cape_plumes', name: 'Cape de plumes', kind: 'cape', tranche: 1, stats: { hp: 16, masteries: { air: 8, earth: 3 }, resistances: { air: 10 } }, flavor: 'Le vent la gonfle sans jamais vous emporter.' },
  { id: 'anneau_vent', name: 'Anneau du vent', kind: 'anneau', tranche: 1, stats: { hp: 10, masteries: { air: 8, earth: 5 }, resistances: { air: 6, earth: 5 } }, flavor: 'On l’entend siffler quand on tend l’arc.' },
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
  tourbiere_des_noyes: [
    { itemId: 'arc_roseau', baseRate: 0.2, refDifficulty: 1 },
    { itemId: 'cape_vase', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'bottes_batracien', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'anneau_nenuphar', baseRate: 0.12, refDifficulty: 3 },
  ],
  caldeira_des_cendres: [
    { itemId: 'arc_obsidienne', baseRate: 0.2, refDifficulty: 1 },
    { itemId: 'plastron_scorie', baseRate: 0.22, refDifficulty: 1 },
    { itemId: 'coiffe_cendres', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'amulette_braise', baseRate: 0.15, refDifficulty: 2 },
  ],
  falaises_hurlantes: [
    { itemId: 'arc_plumes', baseRate: 0.2, refDifficulty: 1 },
    { itemId: 'carquois_serres', baseRate: 0.22, refDifficulty: 1 },
    { itemId: 'cape_plumes', baseRate: 0.25, refDifficulty: 1 },
    { itemId: 'anneau_vent', baseRate: 0.12, refDifficulty: 3 },
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
