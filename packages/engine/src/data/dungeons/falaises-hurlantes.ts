import type { DungeonDef } from '../dungeons.js';

/**
 * Air. Harpies et bouquetins repoussent l'Archer : dos à un rocher, chaque poussée bloquée fait
 * des dégâts de collision. Les mêmes rochers servent à l'Archer pour écraser les monstres avec
 * la Flèche fracassante. Deck conseillé : Terre (Flèche fracassante, Coup de pied).
 */
export const FALAISES_HURLANTES: DungeonDef = {
  id: 'falaises_hurlantes',
  name: 'Falaises Hurlantes',
  tranche: 1,
  dominantElement: 'air',
  weakElement: 'earth',
  difficultyCurve: { mid: 0.06, high: -0.08 },
  description: 'Harpies et bouquetins qui vous repoussent contre les rochers, vautours à longue portée, puis la Harpie matriarche. Les monstres craignent la Terre.',
  rooms: [
    {
      name: 'Corniche',
      tiles: [
        '#...#.....',
        '..........',
        '...#...#..',
        '..........',
        '...#...#..',
        '..........',
        '#...#.....',
      ],
      playerSpawn: { x: 1, y: 3 },
      monsters: [
        { templateId: 'harpie', pos: { x: 8, y: 1 } },
        { templateId: 'vautour', pos: { x: 9, y: 3 } },
        { templateId: 'harpie', pos: { x: 8, y: 5 } },
      ],
    },
    {
      name: 'Col des Bourrasques',
      tiles: [
        '...........',
        '.##.....##.',
        '.....#.....',
        '...........',
        '...#...#...',
        '...........',
        '.....#.....',
        '.##.....##.',
      ],
      playerSpawn: { x: 1, y: 4 },
      monsters: [
        { templateId: 'vautour', pos: { x: 10, y: 0 } },
        { templateId: 'bouquetin', pos: { x: 6, y: 3 } },
        { templateId: 'bouquetin', pos: { x: 6, y: 5 } },
        { templateId: 'harpie', pos: { x: 10, y: 7 } },
      ],
    },
    {
      name: 'Nid de la Matriarche',
      tiles: [
        '...........',
        '.#...#...#.',
        '...........',
        '...#...#...',
        '...........',
        '.#.......#.',
        '...........',
        '...#...#...',
        '...........',
      ],
      playerSpawn: { x: 5, y: 8 },
      monsters: [
        { templateId: 'harpie', pos: { x: 2, y: 2 } },
        { templateId: 'harpie_matriarche', pos: { x: 5, y: 0 } },
        { templateId: 'harpie', pos: { x: 8, y: 2 } },
      ],
    },
  ],
};
