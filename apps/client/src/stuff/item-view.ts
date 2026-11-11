import {
  RARITIES,
  compareWithEquipped,
  equippedSlotOf,
  getItem,
  instanceStats,
  itemRunes,
  runeEffectText,
  runeLabel,
  type Element,
  type EquipmentBonus,
  type Inventory,
  type ItemInstance,
} from '@chabfu/engine';
import { itemIconImg } from '../ui/assets';
import { statDeltaHtml, statRowsHtml } from './stat-view';
import { runeGemHtml } from './rune-view';

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

/**
 * Somme pondérée grossière, juste pour signaler une amélioration « ▲ Mieux ».
 * Repères : 1 PV ≈ 0,5 % de maîtrise, 1 Dommage ≈ 8 %, 1 % de résistance ≈ 0,8 %.
 */
export function bonusScore(b: EquipmentBonus): number {
  const sum = (r: Record<string, number> | undefined) => Object.values(r ?? {}).reduce((s, v) => s + v, 0);
  return (
    b.hp * 0.5 + b.pa * 30 + b.pm * 20 + sum(b.masteries) + (b.damage ?? 0) * 8 + (b.range ?? 0) * 15 + sum(b.resistances) * 0.8
  );
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
  /** Emplacements de runes cliquables (data-rslot sur chaque emplacement). */
  runeButtons?: boolean;
}

/** Emplacements de runes d'un objet : pierre sertie ou case vide. */
export function itemRunesHtml(item: ItemInstance, buttons = false): string {
  const runes = itemRunes(item);
  if (!runes.length) return '';
  const tag = buttons ? 'button' : 'span';
  return `<div class="item-runes">${runes
    .map(
      (k, i) =>
        `<${tag} ${buttons ? `type="button" data-rslot="${i}"` : ''} class="rune-slot">${runeGemHtml(k, { size: 'sm' })}<span>${
          k ? `<b>${runeLabel(k)}</b><small>${runeEffectText(k)}</small>` : `<b>Emplacement libre</b>${buttons ? '<small>Toucher pour sertir</small>' : ''}`
        }</span></${tag}>`,
    )
    .join('')}</div>`;
}

export function itemCardHtml(item: ItemInstance, o: ItemCardOptions): string {
  const def = getItem(item.itemId);
  const r = RARITIES[item.rarity];
  const stats = instanceStats(item);
  const equipped = equippedSlotOf(o.inv, o.trancheId, item.uid);
  const delta = o.compare && !equipped && def.tranche === o.trancheId ? compareWithEquipped(o.inv, o.trancheId, item.uid) : null;
  const upgrade = delta && bonusScore(delta) > 0;
  return `
    <div class="item-card rarity-${item.rarity} ${o.extraClass ?? ''}" data-uid="${item.uid}" ${o.style ? `style="${o.style}"` : ''}>
      <div class="item-head">
        <span class="item-icon kind-${def.kind}">${itemIconImg(def.id)}</span>
        <span class="item-name">${def.name}</span>
        ${equipped ? '<span class="tag tag-eq">Équipé</span>' : upgrade ? '<span class="tag tag-up">▲ Mieux</span>' : ''}
      </div>
      <div class="item-meta"><span class="rarity-label">${r.label}</span> · ${KIND_LABEL[def.kind]} · T${def.tranche}${r.runeSlots ? ` · ${r.runeSlots} rune${r.runeSlots > 1 ? 's' : ''}` : ''}</div>
      ${itemRunesHtml(item, o.runeButtons)}
      ${statRowsHtml(stats)}
      ${delta ? statDeltaHtml(delta) : ''}
      ${o.action && !equipped ? `<button class="secondary item-btn" data-action="${o.action.name}" data-uid="${item.uid}">${o.action.label}</button>` : ''}
    </div>`;
}
