/**
 * Totaux de stats du personnage (base de l'Archer + équipement).
 * C'est la référence de l'équilibrage : la rareté d'un objet n'agit que par les stats qu'il donne.
 */
import { BASE_PA, BASE_PM, PLAYER_HP } from './combat.js';
import { MAX_RESISTANCE, emptyBonus, normalizeBonus, type EquipmentBonus, type EquipmentConfig } from './equipment.js';
import type { Element } from './types.js';

export interface CombatStats extends EquipmentBonus {
  /** Ce que donne l'équipement seul, pour afficher « (+n) ». */
  fromEquipment: EquipmentBonus;
}

const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air', 'neutral'];

/**
 * Stats effectives en combat. Les résistances sont plafonnées à MAX_RESISTANCE comme dans le combat ;
 * les maîtrises du personnage (hors équipement) s'ajoutent si elles sont fournies.
 */
export function combatStats(equipment?: EquipmentConfig, masteries?: Partial<Record<Element, number>>): CombatStats {
  const eq = normalizeBonus(equipment);
  const base = emptyBonus();
  base.hp = PLAYER_HP + eq.hp;
  base.pa = BASE_PA + eq.pa;
  base.pm = BASE_PM + eq.pm;
  base.damage = eq.damage;
  base.range = eq.range;
  base.horizon = eq.horizon;
  for (const e of ELEMENTS) {
    base.masteries[e] = (masteries?.[e] ?? 0) + eq.masteries[e];
    base.resistances[e] = Math.min(MAX_RESISTANCE, Math.max(0, eq.resistances[e]));
  }
  return { ...base, fromEquipment: eq };
}
