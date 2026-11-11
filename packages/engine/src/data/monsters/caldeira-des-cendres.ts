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
    description: 'Immobile. Lance des braises en cloche (par-dessus les rochers) de 2 à 10 cases et brûle.',
    attacks: [
      { id: 'braises', name: 'Braises', element: 'fire', damage: 8, pa: 4, minRange: 2, maxRange: 10, los: false, maxPerTurn: 1, burn: { damage: 3, turns: 2 } },
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
    trait: 'deathBlast',
    color: '#e0782c',
    description: 'Rapide, mord au contact et brûle. Explose à sa mort : tuez-la de loin, ou au milieu de ses alliés.',
    attacks: [
      { id: 'morsure_ardente', name: 'Morsure ardente', element: 'fire', damage: 10, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1, burn: { damage: 3, turns: 2 } },
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
    description: 'Robuste, cogne fort. Bon bouclier : il bloque la ligne de vue des braseros.',
    attacks: [
      { id: 'coup_de_scorie', name: 'Coup de scorie', element: 'earth', damage: 15, pa: 5, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
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
    mechanic: 'overheat',
    color: '#8e1f0f',
    description: 'Boss : poing de lave, bombes en cloche, et il explose quand sa chaleur atteint 4. Refroidi, il prend +50 % de dégâts.',
    attacks: [
      { id: 'poing_de_lave', name: 'Poing de lave', element: 'fire', damage: 16, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1, burn: { damage: 4, turns: 2 } },
      { id: 'bombe_de_magma', name: 'Bombe de magma', element: 'fire', damage: 10, pa: 4, minRange: 2, maxRange: 5, los: false, maxPerTurn: 1 },
    ],
  },
];
