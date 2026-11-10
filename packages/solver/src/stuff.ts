/** Équipements de référence pour l'équilibrage : une panoplie complète de la tranche dans une rareté donnée. */
import { ITEMS, SLOTS, addBonus, emptyBonus, itemStats, type EquipmentBonus, type Rarity } from '@chabfu/engine';

export const STUFF_LEVELS: Record<string, Rarity | null> = {
  aucun: null,
  commun: 'common',
  inhabituel: 'uncommon',
  rare: 'rare',
  mythique: 'mythic',
  legendaire: 'legendary',
};

function score(b: EquipmentBonus): number {
  return b.hp + Object.values(b.masteries).reduce((s, v) => s + v, 0) + 50 * (b.pa + b.pm);
}

/**
 * Panoplie complète de la tranche : pour chaque emplacement, l'objet de la tranche le plus fort
 * (deux anneaux différents si possible), tous dans la même rareté.
 */
export function fullSetBonus(trancheId: number, level: string): EquipmentBonus {
  if (!(level in STUFF_LEVELS)) throw new Error(`Stuff inconnu : ${level} (choix : ${Object.keys(STUFF_LEVELS).join(', ')})`);
  const rarity = STUFF_LEVELS[level];
  let total = emptyBonus();
  if (!rarity) return total;
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
