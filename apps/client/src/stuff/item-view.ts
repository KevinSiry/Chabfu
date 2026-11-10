import {
  RARITIES,
  compareWithEquipped,
  describeBonus,
  equippedSlotOf,
  getItem,
  itemStats,
  type Element,
  type EquipmentBonus,
  type Inventory,
  type ItemInstance,
} from '@chabfu/engine';
import { itemIconImg } from '../ui/assets';

export const ELEMENT_LABEL: Record<Element, string> = { fire: 'Feu', water: 'Eau', earth: 'Terre', air: 'Air', neutral: 'Neutre' };

export const KIND_LABEL: Record<string, string> = {
  arc: 'Arc',
  carquois: 'Carquois',
  coiffe: 'Coiffe',
  cape: 'Cape',
  plastron: 'Plastron',
  bottes: 'Bottes',
  amulette: 'Amulette',
  anneau: 'Anneau',
};

/** Somme pondérée grossière, juste pour signaler une amélioration (1 PV ≈ 0,5 % de maîtrise). */
export function bonusScore(b: EquipmentBonus): number {
  return b.hp * 0.5 + b.pa * 30 + b.pm * 20 + Object.values(b.masteries).reduce((s, v) => s + v, 0);
}

function deltaHtml(delta: EquipmentBonus): string {
  const lines = describeBonus(delta, ELEMENT_LABEL);
  if (!lines.length) return '<div class="delta same">Identique à l’équipé</div>';
  return `<div class="delta">${lines
    .map((l) => `<span class="${l.startsWith('-') ? 'down' : 'up'}">${l}</span>`)
    .join('')}</div>`;
}

export interface ItemCardOptions {
  inv: Inventory;
  trancheId: number;
  /** Affiche la comparaison avec l'équipement porté. */
  compare?: boolean;
  /** Bouton d'action (data-action sur le bouton). */
  action?: { label: string; name: string };
  extraClass?: string;
  style?: string;
}

export function itemCardHtml(item: ItemInstance, o: ItemCardOptions): string {
  const def = getItem(item.itemId);
  const r = RARITIES[item.rarity];
  const stats = describeBonus(itemStats(item.itemId, item.rarity), ELEMENT_LABEL);
  const equipped = equippedSlotOf(o.inv, o.trancheId, item.uid);
  const delta = o.compare && !equipped && def.tranche === o.trancheId ? compareWithEquipped(o.inv, o.trancheId, item.uid) : null;
  const upgrade = delta && bonusScore(delta) > 0;
  return `
    <div class="item-card rarity-${item.rarity} ${o.extraClass ?? ''}" data-uid="${item.uid}" ${o.style ? `style="${o.style}"` : ''}>
      <div class="item-head">
        <span class="item-icon kind-${def.kind}">${itemIconImg(def.kind)}</span>
        <span class="item-name">${def.name}</span>
        ${equipped ? '<span class="tag tag-eq">Équipé</span>' : upgrade ? '<span class="tag tag-up">▲ Mieux</span>' : ''}
      </div>
      <div class="item-meta"><span class="rarity-label">${r.label}</span> · ${KIND_LABEL[def.kind]} · T${def.tranche}${r.runeSlots ? ` · ${'◇'.repeat(r.runeSlots)} rune${r.runeSlots > 1 ? 's' : ''}` : ''}</div>
      <div class="item-stats">${stats.map((s) => `<span>${s}</span>`).join('')}</div>
      ${delta ? deltaHtml(delta) : ''}
      ${o.action && !equipped ? `<button class="secondary item-btn" data-action="${o.action.name}" data-uid="${item.uid}">${o.action.label}</button>` : ''}
    </div>`;
}
