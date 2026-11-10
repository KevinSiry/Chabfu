import type { MonsterTemplate } from '../monsters.js';

/** Bosquet des Ronces (T1, Terre) : craignent surtout le Feu. */
export const BOSQUET_DES_RONCES_MONSTERS: MonsterTemplate[] = [
  {
    id: 'ronceau',
    name: 'Ronceau',
    hp: 24,
    pa: 6,
    pm: 5,
    weakness: 'fire',
    resistance: 'earth',
    trait: 'thornGuard',
    color: '#8a5a2b',
    description: 'Fonce au corps à corps et vous rattrape vite. Ses épines protègent les monstres collés à lui : séparez-les ou tuez-le d’abord.',
    attacks: [
      { id: 'griffe', name: 'Griffe épineuse', element: 'earth', damage: 11, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
    ],
  },
  {
    id: 'guepe',
    name: 'Guêpe sylvestre',
    hp: 17,
    pa: 6,
    pm: 6,
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
    hp: 102,
    pa: 7,
    pm: 4,
    weakness: 'fire',
    resistance: 'water',
    isBoss: true,
    mechanic: 'roots',
    color: '#7a2f2f',
    description: 'Boss : frappe fort au contact, crache de la sève jusqu’à 5 cases et fait jaillir des racines sous vos pieds un tour sur deux.',
    attacks: [
      { id: 'etreinte', name: 'Étreinte des racines', element: 'earth', damage: 15, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
      { id: 'crachat', name: 'Crachat de sève', element: 'water', damage: 9, pa: 3, minRange: 2, maxRange: 5, los: true, maxPerTurn: 1 },
    ],
  },
];
