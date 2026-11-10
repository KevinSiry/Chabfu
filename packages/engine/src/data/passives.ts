/**
 * Passifs de l'Archer (GDD sections 4 et 6). Ils modifient la façon de jouer plutôt que la puissance brute.
 * Chaque passif est décrit par des modificateurs déclaratifs que le moteur de combat lit (voir passives.ts).
 */

export interface PassiveMods {
  /** Concentration gagnée quand l'Archer tue un monstre. */
  killConcentration?: number;
  /** Sorts dont la perte de Concentration est annulée. */
  noConcentrationLoss?: string[];
  /** Tours de brûlure supplémentaires infligés par l'Archer. */
  burnExtraTurns?: number;
  /** Réduction du coût en Concentration, par sort. */
  concentrationCostReduction?: Record<string, number>;
  /** Portée maximale en plus pour les tirs à distance (sorts offensifs de portée max ≥ 2). */
  rangeBonus?: number;
  /** Concentration en plus au début du tour si l'Archer n'a pas bougé au tour précédent. */
  stillConcentrationBonus?: number;
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
    description: '+1 Concentration chaque fois que vous achevez un monstre.',
    mods: { killConcentration: 1 },
  },
  {
    id: 'reception_agile',
    name: 'Réception agile',
    level: 8,
    description: 'Bond arrière ne coûte plus de Concentration.',
    mods: { noConcentrationLoss: ['bond_arriere'] },
  },
  {
    id: 'patience',
    name: 'Patience',
    level: 11,
    description: 'Si vous n’avez pas bougé au tour précédent, vous gagnez 2 Concentration au lieu de 1.',
    mods: { stillConcentrationBonus: 1 },
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
    description: 'Tir concentré ne consomme que 3 Concentration.',
    mods: { concentrationCostReduction: { tir_concentre: 1 } },
  },
];

const BY_ID = new Map(PASSIVES.map((p) => [p.id, p]));

export function getPassive(id: string): PassiveDef {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Passif inconnu : ${id}`);
  return p;
}
