/**
 * Passifs de l'Archer (GDD sections 4 et 6). Ils modifient la façon de jouer plutôt que la puissance brute.
 * Chaque passif est décrit par des modificateurs déclaratifs que le moteur de combat lit (voir passives.ts).
 */

export interface PassiveMods {
  /** PM rendus quand l'Archer achève un monstre. */
  killPm?: number;
  /** Tours de brûlure supplémentaires infligés par l'Archer. */
  burnExtraTurns?: number;
  /** Réduction du coût en PA, par sort (1 PA minimum). */
  paCostReduction?: Record<string, number>;
  /** Portée maximale en plus pour les tirs à distance (sorts offensifs de portée max ≥ 2). */
  rangeBonus?: number;
  /** Bonus de distance en plus par case comptée (fraction : 0,02 = +2 % par case). */
  distanceBonusPerCell?: number;
}

export interface PassiveDef {
  id: string;
  name: string;
  /** Niveau de déblocage. */
  level: number;
  description: string;
  mods: PassiveMods;
}

export const PASSIVES: PassiveDef[] = [
  {
    id: 'instinct_du_chasseur',
    name: 'Instinct du chasseur',
    level: 4,
    description: 'Achever un monstre pendant votre tour vous rend 1 PM.',
    mods: { killPm: 1 },
  },
  {
    id: 'reception_agile',
    name: 'Réception agile',
    level: 8,
    description: 'Bond arrière coûte 1 PA au lieu de 2.',
    mods: { paCostReduction: { bond_arriere: 1 } },
  },
  {
    id: 'patience',
    name: 'Longue-vue',
    level: 11,
    description: 'Bonus de distance porté à +8 % par case (jusqu’à +40 % à 8 cases).',
    mods: { distanceBonusPerCell: 0.02 },
  },
  {
    id: 'pointes_incendiaires',
    name: 'Pointes incendiaires',
    level: 14,
    description: 'Vos brûlures durent 1 tour de plus.',
    mods: { burnExtraTurns: 1 },
  },
  {
    id: 'oeil_percant',
    name: 'Œil perçant',
    level: 17,
    description: '+1 portée maximale à vos tirs à distance.',
    mods: { rangeBonus: 1 },
  },
  {
    id: 'sang_froid',
    name: 'Sang-froid',
    level: 20,
    description: 'Tir concentré coûte 1 PA au lieu de 2.',
    mods: { paCostReduction: { tir_concentre: 1 } },
  },
];

const BY_ID = new Map(PASSIVES.map((p) => [p.id, p]));

export function getPassive(id: string): PassiveDef {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Passif inconnu : ${id}`);
  return p;
}
