import type { MonsterTemplate } from '../monsters.js';

/** Caldeira des Cendres (T1, Feu) : craignent l'Eau, brûlent le joueur, tirent en cloche. */
export const CALDEIRA_DES_CENDRES_MONSTERS: MonsterTemplate[] = [
  {
    id: 'brasero_vivant',
    name: 'Brasero vivant',
    hp: 18,
    pa: 6,
    pm: 0,
    weakness: 'water',
    resistance: 'fire',
    behavior: 'sentinel',
    color: '#c4501f',
    description: 'Immobile. Lance des braises en cloche (par-dessus les rochers) de 2 à 8 cases et brûle.',
    attacks: [
      { id: 'braises', name: 'Braises', element: 'fire', damage: 10, pa: 4, minRange: 2, maxRange: 8, los: false, maxPerTurn: 1, burn: { damage: 3, turns: 2 } },
    ],
  },
  {
    id: 'salamandre',
    name: 'Salamandre',
    hp: 16,
    pa: 6,
    pm: 6,
    weakness: 'water',
    resistance: 'fire',
    color: '#e0782c',
    description: 'Rapide, mord au contact et brûle. Une Flèche givrée la ralentit.',
    attacks: [
      { id: 'morsure_ardente', name: 'Morsure ardente', element: 'fire', damage: 13, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1, burn: { damage: 3, turns: 2 } },
    ],
  },
  {
    id: 'golem_scorie',
    name: 'Golem de scorie',
    hp: 24,
    pa: 6,
    pm: 4,
    weakness: 'water',
    resistance: 'earth',
    color: '#5a5048',
    description: 'Lent et robuste, cogne fort. Bon bouclier : il bloque la ligne de vue des braseros.',
    attacks: [
      { id: 'coup_de_scorie', name: 'Coup de scorie', element: 'earth', damage: 20, pa: 5, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
    ],
  },
  {
    id: 'golem_magma',
    name: 'Golem de magma',
    hp: 83,
    pa: 8,
    pm: 4,
    weakness: 'water',
    resistance: 'fire',
    isBoss: true,
    color: '#8e1f0f',
    description: 'Boss lent : poing de lave au contact, bombes en cloche jusqu’à 5 cases. Tout brûle.',
    attacks: [
      { id: 'poing_de_lave', name: 'Poing de lave', element: 'fire', damage: 21, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1, burn: { damage: 4, turns: 2 } },
      { id: 'bombe_de_magma', name: 'Bombe de magma', element: 'fire', damage: 13, pa: 4, minRange: 2, maxRange: 5, los: false, maxPerTurn: 1 },
    ],
  },
];
