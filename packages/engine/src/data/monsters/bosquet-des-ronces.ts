import type { MonsterTemplate } from '../monsters.js';

/** Bosquet des Ronces (T1, Terre) : craignent surtout le Feu. */
export const BOSQUET_DES_RONCES_MONSTERS: MonsterTemplate[] = [
  {
    id: 'ronceau',
    name: 'Ronceau',
    hp: 40,
    pa: 6,
    pm: 3,
    weakness: 'fire',
    resistance: 'earth',
    color: '#8a5a2b',
    description: 'Fonce au corps à corps. Lent : gardez vos distances.',
    attacks: [
      { id: 'griffe', name: 'Griffe épineuse', element: 'earth', damage: 11, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
    ],
  },
  {
    id: 'guepe',
    name: 'Guêpe sylvestre',
    hp: 28,
    pa: 6,
    pm: 4,
    weakness: 'water',
    resistance: 'air',
    color: '#e8c23c',
    description: 'Pique à distance (2 à 4 cases). Un rocher entre vous la bloque.',
    attacks: [
      { id: 'dard', name: 'Dard', element: 'air', damage: 8, pa: 3, minRange: 2, maxRange: 4, los: true, maxPerTurn: 1 },
    ],
  },
  {
    id: 'gardien_racineux',
    name: 'Gardien racineux',
    hp: 170,
    pa: 7,
    pm: 2,
    weakness: 'fire',
    resistance: 'water',
    isBoss: true,
    color: '#7a2f2f',
    description: 'Boss lent : frappe fort au contact et crache de la sève jusqu’à 5 cases.',
    attacks: [
      { id: 'etreinte', name: 'Étreinte des racines', element: 'earth', damage: 15, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
      { id: 'crachat', name: 'Crachat de sève', element: 'water', damage: 9, pa: 3, minRange: 2, maxRange: 5, los: true, maxPerTurn: 1 },
    ],
  },
];
