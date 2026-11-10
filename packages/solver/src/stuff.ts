/**
 * Équipements de référence pour l'équilibrage.
 *
 * Les cibles se raisonnent sur les totaux de stats du personnage, pas sur la rareté (consigne de Kevin,
 * 2026-11-10) : les profils `faible`, `moyen` et `fort` sont des totaux de stats fixes, indépendants des
 * objets. Les noms `panoplie-<rareté>` calculent au contraire la panoplie réelle des objets de la tranche,
 * pour vérifier où tombent les objets par rapport aux profils.
 */
import { ITEMS, SLOTS, addBonus, emptyBonus, itemStats, type EquipmentBonus, type Rarity } from '@chabfu/engine';

export const STUFF_LEVELS: Record<string, Rarity | null> = {
  'panoplie-commun': 'common',
  'panoplie-inhabituel': 'uncommon',
  'panoplie-rare': 'rare',
  'panoplie-mythique': 'mythic',
  'panoplie-legendaire': 'legendary',
};

/**
 * Totaux de stats de référence pour la tranche T1. Ils comptent toutes les stats d'objets (résistances,
 * dommages, PM, Concentration par salle), pas seulement PV et maîtrises : un profil sans elles sous-estime
 * beaucoup un vrai stuff. `faible` ≈ panoplie T1 complète en Commune, `fort` ≈ panoplie complète en Mythique
 * (fil « Ajouter des stats aux items », 2026-11-10).
 */
export interface StatProfile {
  hp: number;
  /** Maîtrise identique dans les quatre éléments. */
  mastery: number;
  /** Résistance identique dans les quatre éléments. */
  resistance?: number;
  damage?: number;
  pm?: number;
  range?: number;
  concentration?: number;
}

export const STAT_PROFILES: Record<string, StatProfile> = {
  aucun: { hp: 0, mastery: 0 },
  /** Début d'équipement : D10 doit rester hors de portée. */
  faible: { hp: 93, mastery: 19, resistance: 11, damage: 4, pm: 1, concentration: 1 },
  moyen: { hp: 110, mastery: 24, resistance: 14, damage: 4, pm: 1, concentration: 1 },
  /** Équipement presque parfait : D10 doit passer, de justesse. */
  fort: { hp: 126, mastery: 25, resistance: 15, damage: 6, pm: 1, concentration: 1 },
};

export function statProfileBonus(name: string): EquipmentBonus {
  const p = STAT_PROFILES[name];
  const b = emptyBonus();
  b.hp = p.hp;
  b.damage = p.damage ?? 0;
  b.pm = p.pm ?? 0;
  b.range = p.range ?? 0;
  b.concentration = p.concentration ?? 0;
  for (const e of ['fire', 'water', 'earth', 'air'] as const) {
    b.masteries[e] = p.mastery;
    b.resistances[e] = p.resistance ?? 0;
  }
  return b;
}

/** Bonus d'un nom de stuff : profil de stats ou panoplie réelle. */
export function stuffBonus(trancheId: number, name: string): EquipmentBonus {
  if (name in STAT_PROFILES) return statProfileBonus(name);
  return fullSetBonus(trancheId, name);
}

function score(b: EquipmentBonus): number {
  const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);
  return b.hp + sum(b.masteries) + 0.8 * sum(b.resistances) + 8 * b.damage + 15 * (b.range + b.concentration) + 50 * (b.pa + b.pm);
}

/**
 * Panoplie complète de la tranche : pour chaque emplacement, l'objet de la tranche le plus fort
 * (deux anneaux différents si possible), tous dans la même rareté.
 */
export function fullSetBonus(trancheId: number, level: string): EquipmentBonus {
  if (!(level in STUFF_LEVELS)) {
    throw new Error(`Stuff inconnu : ${level} (choix : ${[...Object.keys(STAT_PROFILES), ...Object.keys(STUFF_LEVELS)].join(', ')})`);
  }
  const rarity = STUFF_LEVELS[level]!;
  let total = emptyBonus();
  const used = new Set<string>();
  for (const slot of SLOTS) {
    const candidates = ITEMS.filter((i) => i.tranche === trancheId && i.kind === slot.kind && !used.has(i.id))
      .map((i) => ({ id: i.id, bonus: itemStats(i.id, rarity) }))
      .sort((a, b) => score(b.bonus) - score(a.bonus));
    const pick = candidates[0];
    if (!pick) continue;
    used.add(pick.id);
    total = addBonus(total, pick.bonus);
  }
  return total;
}
