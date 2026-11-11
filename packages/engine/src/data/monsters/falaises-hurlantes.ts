import type { MonsterTemplate } from '../monsters.js';

/** Falaises Hurlantes (T1, Air) : craignent la Terre, repoussent le joueur contre les rochers. */
export const FALAISES_HURLANTES_MONSTERS: MonsterTemplate[] = [
  {
    id: 'harpie',
    name: 'Harpie des cimes',
    hp: 18,
    pa: 6,
    pm: 6,
    weakness: 'earth',
    resistance: 'air',
    color: '#b9a3d6',
    description: 'Très mobile. Sa rafale vous repousse de 2 cases : ne restez pas dos à un rocher.',
    attacks: [
      { id: 'rafale', name: 'Rafale', element: 'air', damage: 8, pa: 3, minRange: 1, maxRange: 3, los: true, maxPerTurn: 1, push: 2 },
    ],
  },
  {
    id: 'bouquetin',
    name: 'Bouquetin des crêtes',
    hp: 29,
    pa: 6,
    pm: 5,
    weakness: 'fire',
    resistance: 'earth',
    color: '#c8b48a',
    description: 'Charge au contact et repousse d’une case. Résiste à la Terre.',
    attacks: [
      { id: 'coup_de_cornes', name: 'Coup de cornes', element: 'earth', damage: 14, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1, push: 1 },
    ],
  },
  {
    id: 'vautour',
    name: 'Vautour charognard',
    hp: 16,
    pa: 6,
    pm: 5,
    weakness: 'earth',
    resistance: 'air',
    behavior: 'kiter',
    trait: 'finisher',
    color: '#4b4038',
    description: 'Reste loin et tire de 3 à 6 cases, +50 % de dégâts si vous êtes sous la moitié de vos PV. Approchez-le à couvert.',
    attacks: [
      { id: 'serres_lointaines', name: 'Plongeon', element: 'air', damage: 10, pa: 3, minRange: 3, maxRange: 6, los: true, maxPerTurn: 1 },
    ],
  },
  {
    id: 'harpie_matriarche',
    name: 'Harpie matriarche',
    hp: 82,
    pa: 8,
    pm: 5,
    weakness: 'earth',
    resistance: 'air',
    isBoss: true,
    mechanic: 'gale',
    color: '#6d4f9c',
    description: 'Boss mobile : serres, bourrasque, et un tour sur deux un grand vent annoncé qui pousse tout le monde de 2 cases.',
    attacks: [
      { id: 'serres', name: 'Serres', element: 'air', damage: 16, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
      { id: 'bourrasque', name: 'Bourrasque', element: 'air', damage: 10, pa: 4, minRange: 2, maxRange: 5, los: true, maxPerTurn: 1, push: 2 },
    ],
  },
];
