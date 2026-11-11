import type { DungeonDef } from '../dungeons.js';

/**
 * Eau. Les crapauds reculent pour tirer et engluent (−1 PM) : les rochers en quinconce servent
 * à couper leurs lignes de vue pendant qu'on avance. Deck conseillé : Air (Flèche du vent, Pluie de flèches).
 */
export const TOURBIERE_DES_NOYES: DungeonDef = {
  id: 'tourbiere_des_noyes',
  name: 'Tourbière des Noyés',
  tranche: 1,
  dominantElement: 'water',
  weakElement: 'air',
  difficultyCurve: { mid: 0, high: 0.25, highDamage: 0 },
  description: 'Crapauds qui engluent de loin, sangsues voraces, puis la Reine Batracienne. Les monstres craignent l’Air.',
  rooms: [
    {
      name: 'Roselière',
      tiles: [
        '..........',
        '.....#....',
        '..#.......',
        '.......#..',
        '....#.....',
        '.......#..',
        '..#.......',
        '.....#....',
      ],
      playerSpawn: { x: 1, y: 4 },
      monsters: [
        { templateId: 'crapaud_vaseux', pos: { x: 8, y: 1 } },
        { templateId: 'sangsue_geante', pos: { x: 7, y: 4 } },
        { templateId: 'crapaud_vaseux', pos: { x: 8, y: 7 } },
      ],
    },
    {
      name: 'Mare stagnante',
      tiles: [
        '..........',
        '...#..#...',
        '..........',
        '.#..##..#.',
        '..........',
        '.#..##..#.',
        '..........',
        '...#..#...',
        '..........',
      ],
      playerSpawn: { x: 1, y: 4 },
      monsters: [
        { templateId: 'nuee_moustiques', pos: { x: 8, y: 0 } },
        { templateId: 'sangsue_geante', pos: { x: 6, y: 4 } },
        { templateId: 'crapaud_vaseux', pos: { x: 9, y: 4 } },
        { templateId: 'nuee_moustiques', pos: { x: 8, y: 8 } },
      ],
    },
    {
      name: 'Trône de vase',
      tiles: [
        '...........',
        '..#.....#..',
        '...........',
        '....#.#....',
        '.#.......#.',
        '....#.#....',
        '...........',
        '..#.....#..',
        '...........',
      ],
      playerSpawn: { x: 5, y: 8 },
      monsters: [
        { templateId: 'crapaud_vaseux', pos: { x: 1, y: 2 } },
        { templateId: 'reine_batracienne', pos: { x: 5, y: 1 } },
        { templateId: 'crapaud_vaseux', pos: { x: 9, y: 2 } },
      ],
    },
  ],
};
