import type { DungeonDef } from '../dungeons.js';

export const BOSQUET_DES_RONCES: DungeonDef = {
  id: 'bosquet_des_ronces',
  name: 'Bosquet des Ronces',
  tranche: 1,
  dominantElement: 'earth',
  weakElement: 'fire',
  description: 'Deux salles de ronces et de guêpes, puis le Gardien racineux. Les monstres craignent le feu.',
  rooms: [
    {
      name: 'Lisière',
      tiles: [
        '..........',
        '...#......',
        '......#...',
        '..........',
        '.#....#...',
        '..........',
        '...#......',
        '..........',
      ],
      playerSpawn: { x: 1, y: 3 },
      monsters: [
        { templateId: 'ronceau', pos: { x: 8, y: 1 } },
        { templateId: 'guepe', pos: { x: 9, y: 4 } },
        { templateId: 'ronceau', pos: { x: 8, y: 6 } },
      ],
    },
    {
      name: 'Clairière',
      tiles: [
        '..........',
        '....##....',
        '..........',
        '..#....#..',
        '..........',
        '..#....#..',
        '..........',
        '....##....',
        '..........',
      ],
      playerSpawn: { x: 1, y: 4 },
      monsters: [
        { templateId: 'guepe', pos: { x: 7, y: 1 } },
        { templateId: 'ronceau', pos: { x: 5, y: 4 } },
        { templateId: 'ronceau', pos: { x: 8, y: 4 } },
        { templateId: 'guepe', pos: { x: 7, y: 7 } },
      ],
    },
    {
      name: 'Cœur du Bosquet',
      tiles: [
        '...........',
        '...#...#...',
        '...........',
        '.#.......#.',
        '...........',
        '.#.......#.',
        '...........',
        '...#...#...',
        '...........',
      ],
      playerSpawn: { x: 5, y: 8 },
      monsters: [
        { templateId: 'ronceau', pos: { x: 2, y: 2 } },
        { templateId: 'gardien_racineux', pos: { x: 5, y: 1 } },
        { templateId: 'ronceau', pos: { x: 8, y: 2 } },
      ],
    },
  ],
};
