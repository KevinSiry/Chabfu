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

/** Totaux de stats de référence pour la tranche T1 (maîtrise identique dans les quatre éléments). */
export const STAT_PROFILES: Record<string, { hp: number; mastery: number }> = {
  aucun: { hp: 0, mastery: 0 },
  /** Début d'équipement : D10 doit rester hors de portée. */
  faible: { hp: 90, mastery: 40 },
  moyen: { hp: 120, mastery: 52 },
  /** Équipement presque parfait : D10 doit passer, de justesse. */
  fort: { hp: 150, mastery: 65 },
};

export function statProfileBonus(name: string): EquipmentBonus {
  const p = STAT_PROFILES[name];
  const b = emptyBonus();
  b.hp = p.hp;
  for (const e of ['fire', 'water', 'earth', 'air'] as const) b.masteries[e] = p.mastery;
  return b;
}

/** Bonus d'un nom de stuff : profil de stats ou panoplie réelle. */
export function stuffBonus(trancheId: number, name: string): EquipmentBonus {
  if (name in STAT_PROFILES) return statProfileBonus(name);
  return fullSetBonus(trancheId, name);
}

function score(b: EquipmentBonus): number {
  return b.hp + Object.values(b.masteries).reduce((s, v) => s + v, 0) + 50 * (b.pa + b.pm);
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
