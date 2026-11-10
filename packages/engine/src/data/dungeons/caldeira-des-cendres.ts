import type { DungeonDef } from '../dungeons.js';

/**
 * Feu. Les braseros sont immobiles et tirent en cloche : la couverture ne protège pas d'eux,
 * seule la distance (plus de 8 cases) ou leur mort. Les golems, eux, bloquent les lignes de vue.
 * Deck conseillé : Eau (Flèche givrée), la Flèche ardente est résistée.
 */
export const CALDEIRA_DES_CENDRES: DungeonDef = {
  id: 'caldeira_des_cendres',
  name: 'Caldeira des Cendres',
  tranche: 1,
  dominantElement: 'fire',
  weakElement: 'water',
  description: 'Braseros immobiles qui tirent par-dessus les rochers, salamandres brûlantes, puis le Golem de magma. Les monstres craignent l’Eau.',
  rooms: [
    {
      name: 'Coulée refroidie',
      tiles: [
        '..........',
        '..##......',
        '......#...',
        '...#......',
        '......#...',
        '..##......',
        '.......#..',
        '..........',
      ],
      playerSpawn: { x: 1, y: 3 },
      monsters: [
        { templateId: 'brasero_vivant', pos: { x: 8, y: 1 } },
        { templateId: 'salamandre', pos: { x: 7, y: 3 } },
        { templateId: 'salamandre', pos: { x: 7, y: 5 } },
      ],
    },
    {
      name: 'Fournaise',
      tiles: [
        '..........',
        '....#.....',
        '.#.....#..',
        '....#.....',
        '..........',
        '....#.....',
        '.#.....#..',
        '....#.....',
        '..........',
      ],
      playerSpawn: { x: 1, y: 4 },
      monsters: [
        { templateId: 'brasero_vivant', pos: { x: 9, y: 1 } },
        { templateId: 'golem_scorie', pos: { x: 6, y: 4 } },
        { templateId: 'salamandre', pos: { x: 8, y: 4 } },
        { templateId: 'brasero_vivant', pos: { x: 9, y: 7 } },
      ],
    },
    {
      name: 'Cœur de la Caldeira',
      tiles: [
        '...........',
        '...#...#...',
        '...........',
        '.#..#.#..#.',
        '...........',
        '...........',
        '.#.......#.',
        '...#...#...',
        '...........',
      ],
      playerSpawn: { x: 5, y: 8 },
      monsters: [
        { templateId: 'brasero_vivant', pos: { x: 1, y: 1 } },
        { templateId: 'golem_magma', pos: { x: 5, y: 1 } },
        { templateId: 'brasero_vivant', pos: { x: 9, y: 1 } },
      ],
    },
  ],
};
