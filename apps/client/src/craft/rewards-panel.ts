import { RARITIES, getItem, getResource, runeLabel } from '@chabfu/engine';
import { runeGemHtml } from '../stuff/rune-view';
import type { RunRewards } from './store';
import { resourceIconImg, shardIconImg } from '../ui/assets';
import './craft.css';

/** Bloc « Ressources » de l'écran de fin de run, sous le butin du boss. */
export function rewardsPanelHtml(r: RunRewards): string {
  const res = Object.entries(r.resources);
  const shards = r.shardsGained[r.trancheId] ?? 0;
  if (!res.length && !r.autoRecycled.length && !r.runes?.length) return '';
  return `
    <div class="rewards">
      <h3>Ressources</h3>
      <div class="res-chips">
        ${(r.runes ?? []).map((k) => `<span class="res-chip res-rune">${runeGemHtml(k, { size: 'sm' })}${runeLabel(k)}</span>`).join('')}
        ${res.map(([id, n]) => `<span class="res-chip tier-${getResource(id).tier}">${resourceIconImg(id)}${getResource(id).name} <b>×${n}</b></span>`).join('')}
      </div>
      ${
        r.autoRecycled.length
          ? `<p class="muted">Recyclé d'office : ${r.autoRecycled
              .map((it) => `<span class="rarity-${it.rarity}"><span class="rarity-label">${getItem(it.itemId).name} (${RARITIES[it.rarity].label})</span></span>`)
              .join(', ')} → ${shardIconImg()}<b>+${shards} éclats T${r.trancheId}</b></p>`
          : ''
      }
    </div>`;
}
