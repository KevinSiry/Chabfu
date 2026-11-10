import type { MonsterTemplate } from '../monsters.js';

/** Tourbière des Noyés (T1, Eau) : craignent l'Air, ralentissent le joueur. */
export const TOURBIERE_DES_NOYES_MONSTERS: MonsterTemplate[] = [
  {
    id: 'crapaud_vaseux',
    name: 'Crapaud vaseux',
    hp: 34,
    pa: 6,
    pm: 3,
    weakness: 'air',
    resistance: 'water',
    behavior: 'kiter',
    color: '#5b7d3a',
    description: 'Garde ses distances et englue (−1 PM). Coupez sa ligne de vue derrière un rocher.',
    attacks: [
      { id: 'langue_gluante', name: 'Langue gluante', element: 'water', damage: 7, pa: 3, minRange: 2, maxRange: 4, los: true, maxPerTurn: 1, pmRemoval: 1 },
    ],
  },
  {
    id: 'sangsue_geante',
    name: 'Sangsue géante',
    hp: 46,
    pa: 6,
    pm: 3,
    weakness: 'air',
    resistance: 'water',
    color: '#4a3b52',
    description: 'Fonce au corps à corps et mord fort. Lente : repoussez-la ou fuyez.',
    attacks: [
      { id: 'succion', name: 'Succion', element: 'water', damage: 11, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
    ],
  },
  {
    id: 'nuee_moustiques',
    name: 'Nuée de moustiques',
    hp: 22,
    pa: 6,
    pm: 5,
    weakness: 'fire',
    resistance: 'air',
    color: '#9aa39a',
    description: 'Très mobile mais fragile. Résiste à l’Air : prévoyez un autre élément pour elle.',
    attacks: [
      { id: 'piqures', name: 'Piqûres', element: 'air', damage: 5, pa: 2, minRange: 1, maxRange: 2, los: true, maxPerTurn: 2 },
    ],
  },
  {
    id: 'reine_batracienne',
    name: 'Reine Batracienne',
    hp: 180,
    pa: 7,
    pm: 3,
    weakness: 'air',
    resistance: 'water',
    isBoss: true,
    behavior: 'kiter',
    color: '#2f6b5e',
    description: 'Boss qui recule pour cracher de la vase de loin (−1 PM). Collez-la ou cachez-vous.',
    attacks: [
      { id: 'coup_de_langue', name: 'Coup de langue', element: 'water', damage: 14, pa: 4, minRange: 1, maxRange: 2, los: true, maxPerTurn: 1 },
      { id: 'jet_de_vase', name: 'Jet de vase', element: 'water', damage: 9, pa: 3, minRange: 3, maxRange: 6, los: true, maxPerTurn: 1, pmRemoval: 1 },
    ],
  },
];
