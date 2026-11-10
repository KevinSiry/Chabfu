import type { Element } from '../types.js';

export interface MonsterAttack {
  id: string;
  name: string;
  element: Element;
  damage: number;
  pa: number;
  minRange: number;
  maxRange: number;
  los: boolean;
  maxPerTurn: number;
}

export interface MonsterTemplate {
  id: string;
  name: string;
  hp: number;
  pa: number;
  pm: number;
  weakness: Element;
  resistance: Element;
  isBoss?: boolean;
  attacks: MonsterAttack[];
}

export const MONSTERS: MonsterTemplate[] = [
  {
    id: 'ronceau',
    name: 'Ronceau',
    hp: 40,
    pa: 6,
    pm: 3,
    weakness: 'fire',
    resistance: 'earth',
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
    attacks: [
      { id: 'etreinte', name: 'Étreinte des racines', element: 'earth', damage: 15, pa: 4, minRange: 1, maxRange: 1, los: true, maxPerTurn: 1 },
      { id: 'crachat', name: 'Crachat de sève', element: 'water', damage: 9, pa: 3, minRange: 2, maxRange: 5, los: true, maxPerTurn: 1 },
    ],
  },
];

const BY_ID = new Map(MONSTERS.map((m) => [m.id, m]));

export function getMonster(id: string): MonsterTemplate {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Monstre inconnu : ${id}`);
  return m;
}
