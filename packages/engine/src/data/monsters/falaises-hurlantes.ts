import type { MonsterTemplate } from '../monsters.js';

/** Falaises Hurlantes (T1, Air) : craignent la Terre, repoussent le joueur contre les rochers. */
export const FALAISES_HURLANTES_MONSTERS: MonsterTemplate[] = [
  {
    id: 'harpie',
    name: 'Harpie des cimes',
    hp: 30,
    pa: 6,
    pm: 5,
    weakness: 'earth',
    resistance: 'air',
    color: '#b9a3d6',
    description: 'Très mobile. Sa rafale vous repousse de 2 cases : ne restez pas dos à un rocher.',
    attacks: [
      { id: 'rafale', name: 'Rafale', element: 'air', damage: 7, pa: 3, minRange: 1, maxRange: 3, los: true, maxPerTurn: 1, push: 2 },
    ],
  },
  {
    id: 'bouquetin',
    name: 'Bouquetin des crêtes',
    hp: 48,
    pa: 6,
    pm: 4,
    weakness: 'fire',
    resistance: 'earth',
    color: '#c8b48a',
    description: 'Charge au contact et repousse d’une case. Résiste à la Terre.',
    attacks: [
      { id: 'coup_de_cornes', name: 'Coup de cornes', element: 'earth', damage: 12, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1, push: 1 },
    ],
  },
  {
    id: 'vautour',
    name: 'Vautour charognard',
    hp: 26,
    pa: 6,
    pm: 4,
    weakness: 'earth',
    resistance: 'air',
    behavior: 'kiter',
    color: '#4b4038',
    description: 'Reste loin et tire de 3 à 6 cases. Approchez-le à couvert.',
    attacks: [
      { id: 'serres_lointaines', name: 'Plongeon', element: 'air', damage: 9, pa: 3, minRange: 3, maxRange: 6, los: true, maxPerTurn: 1 },
    ],
  },
  {
    id: 'harpie_matriarche',
    name: 'Harpie matriarche',
    hp: 170,
    pa: 8,
    pm: 4,
    weakness: 'earth',
    resistance: 'air',
    isBoss: true,
    color: '#6d4f9c',
    description: 'Boss mobile : bourrasque qui repousse de 2 cases, serres au contact.',
    attacks: [
      { id: 'serres', name: 'Serres', element: 'air', damage: 14, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
      { id: 'bourrasque', name: 'Bourrasque', element: 'air', damage: 9, pa: 4, minRange: 2, maxRange: 5, los: true, maxPerTurn: 1, push: 2 },
    ],
  },
];
