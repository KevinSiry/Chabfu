import {
  RARITIES,
  RARITY_ORDER,
  equipItem,
  equippedSlotOf,
  compareWithEquipped,
  getDungeon,
  getItem,
  getResource,
  instanceStats,
  itemRunes,
  parseRuneKey,
  runeEffectText,
  runeLabel,
  RUNE_GRADE_LABEL,
  type ItemInstance,
  type RunConfig,
} from '@chabfu/engine';
import { KIND_LABEL, bonusScore } from './item-view';
import { statCompareHtml } from './stat-view';
import { getInventory, setInventory } from './store';
import { runeGemHtml } from './rune-view';
import type { RunRewards } from '../craft/store';
import { itemIconImg, resourceIconImg, shardIconImg } from '../ui/assets';
import './stuff.css';
import './loot-row.css';

const TIER_LABEL: Record<string, string> = { common: 'Commune', rare: 'Rare', mythic: 'Mythique', ultimate: 'Ultime' };

/**
 * Bloc « Butin » de l'écran de fin de run : tout ce qui a été gagné (objets, runes, ressources, éclats)
 * sur une ligne d'icônes compactes. Les détails s'affichent au survol (ordinateur) ou au toucher (mobile).
 */
export function lootPanelHtml(loot: ItemInstance[], config: RunConfig, rewards: RunRewards | null): string {
  const trancheId = getDungeon(config.dungeonId).tranche;
  const inv = getInventory();
  const tiles: string[] = [];
  const items = [...loot].sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
  for (const item of items) {
    const def = getItem(item.itemId);
    const equipped = equippedSlotOf(inv, trancheId, item.uid);
    const delta = !equipped && def.tranche === trancheId ? compareWithEquipped(inv, trancheId, item.uid) : null;
    const up = delta && bonusScore(delta) > 0;
    tiles.push(
      `<button type="button" class="lr-tile rarity-${item.rarity}${equipped ? ' worn' : up ? ' up' : ''}" data-tip="item" data-uid="${item.uid}" aria-label="${def.name} (${RARITIES[item.rarity].label})">${itemIconImg(def.id)}</button>`,
    );
  }
  for (const key of rewards?.runes ?? []) {
    const { grade } = parseRuneKey(key);
    tiles.push(
      `<button type="button" class="lr-tile lr-rune grade-${grade}" data-tip="rune" data-key="${key}" aria-label="${runeLabel(key)}">${runeGemHtml(key, { size: 'md' }).replace(/ title="[^"]*"/, '')}</button>`,
    );
  }
  for (const [id, n] of Object.entries(rewards?.resources ?? {})) {
    const res = getResource(id);
    tiles.push(
      `<button type="button" class="lr-tile tier-${res.tier}" data-tip="res" data-id="${id}" data-n="${n}" aria-label="${res.name} ×${n}">${resourceIconImg(id)}<b class="lr-qty">×${n}</b></button>`,
    );
  }
  const shards = rewards?.shardsGained[rewards.trancheId] ?? 0;
  if (rewards && shards > 0) {
    tiles.push(
      `<button type="button" class="lr-tile lr-shards" data-tip="shards" aria-label="${shards} éclats">${shardIconImg()}<b class="lr-qty">+${shards}</b></button>`,
    );
  }
  for (const it of rewards?.autoRecycled ?? []) {
    tiles.push(
      `<button type="button" class="lr-tile rarity-${it.rarity} lr-recycled" data-tip="recycled" data-item="${it.itemId}" data-rarity="${it.rarity}" aria-label="${getItem(it.itemId).name}, recyclé">${itemIconImg(it.itemId)}<i class="lr-recycle" aria-hidden="true">♻</i></button>`,
    );
  }
  if (!tiles.length) return '';
  const count = tiles.length;
  return `
    <div class="loot loot-row-panel">
      <h3>Butin <span class="muted">${count} gain${count > 1 ? 's' : ''}</span></h3>
      <div class="lr-row">${tiles.map((t, i) => t.replace('class="lr-tile', `style="--k:${i}" class="lr-tile`)).join('')}</div>
      <p class="lr-hint muted"><span class="lr-hint-mouse">Survolez un gain pour voir le détail</span><span class="lr-hint-touch">Touchez un gain pour voir le détail</span></p>
    </div>`;
}

/** Emplacements de runes sur une ligne : pierres, puis noms des runes serties ou nombre d'emplacements libres. */
function runesLine(item: ItemInstance): string {
  const runes = itemRunes(item);
  if (!runes.length) return '';
  const set = runes.filter((k): k is NonNullable<typeof k> => !!k);
  const free = runes.length - set.length;
  const text = [...set.map((k) => `<b>${runeLabel(k)}</b>`), free ? `${free} emplacement${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  return `<div class="lr-tip-runes">${runes.map((k) => runeGemHtml(k, { size: 'sm' })).join('')}<span>${text}</span></div>`;
}

/** Contenu de l'infobulle d'une case de butin ; `pinned` ajoute le bouton « Équiper » pour un objet. */
function tipHtml(tile: HTMLElement, config: RunConfig, rewards: RunRewards | null, pinned: boolean): string {
  const trancheId = getDungeon(config.dungeonId).tranche;
  const inv = getInventory();
  switch (tile.dataset.tip) {
    case 'item': {
      const item = inv.items.find((i) => i.uid === tile.dataset.uid);
      if (!item) return '';
      const def = getItem(item.itemId);
      const r = RARITIES[item.rarity];
      const equipped = equippedSlotOf(inv, trancheId, item.uid);
      const delta = !equipped && def.tranche === trancheId ? compareWithEquipped(inv, trancheId, item.uid) : null;
      const up = delta && bonusScore(delta) > 0;
      return `<div class="lr-tip-item rarity-${item.rarity}">
        <div class="lr-tip-head">
          <span class="lr-tip-ico">${itemIconImg(def.id)}</span>
          <div><b>${def.name}</b><small><span class="rarity-label">${r.label}</span> · ${KIND_LABEL[def.kind]} · T${def.tranche}</small></div>
          ${equipped ? '<span class="tag tag-eq">Équipé</span>' : up ? '<span class="tag tag-up">▲ Mieux</span>' : ''}
        </div>
        ${runesLine(item)}
        ${delta ? '<p class="lr-tip-sub">Stats <small>et écart si vous l’équipez</small></p>' : ''}
        ${statCompareHtml(instanceStats(item), delta)}
        ${equipped ? '' : pinned ? '<button class="ui-btn ui-btn--primary ui-btn--sm lr-equip" data-action="loot-equip">Équiper</button>' : '<p class="lr-tip-foot">Cliquez pour l’équiper</p>'}
      </div>`;
    }
    case 'rune': {
      const key = tile.dataset.key as Parameters<typeof runeLabel>[0];
      const { grade } = parseRuneKey(key);
      return `<div class="lr-tip-simple">${runeGemHtml(key, { size: 'lg' })}<div><b>${runeLabel(key)}</b><small>Rune ${RUNE_GRADE_LABEL[grade].toLowerCase()}</small><p>${runeEffectText(key)}</p><p class="muted">À sertir sur un objet à l’Atelier.</p></div></div>`;
    }
    case 'res': {
      const res = getResource(tile.dataset.id!);
      return `<div class="lr-tip-simple tier-${res.tier}">${resourceIconImg(res.id)}<div><b>${res.name} ×${tile.dataset.n}</b><small class="lr-tier">Ressource ${TIER_LABEL[res.tier] ?? ''}</small><p class="muted">Sert à fabriquer des objets à l’Atelier.</p></div></div>`;
    }
    case 'shards': {
      const n = rewards?.shardsGained[rewards.trancheId] ?? 0;
      return `<div class="lr-tip-simple">${shardIconImg()}<div><b>+${n} éclats T${rewards?.trancheId}</b><small>Recyclage</small><p class="muted">Issus des objets recyclés d’office. Ils servent aux recettes de l’Atelier.</p></div></div>`;
    }
    case 'recycled': {
      const def = getItem(tile.dataset.item!);
      const r = RARITIES[tile.dataset.rarity as keyof typeof RARITIES];
      return `<div class="lr-tip-simple rarity-${tile.dataset.rarity}">${itemIconImg(def.id)}<div><b>${def.name}</b><small class="rarity-label">${r.label}</small><p class="muted">Recyclé d’office (rareté sous votre seuil) : transformé en éclats.</p></div></div>`;
    }
  }
  return '';
}

/**
 * Infobulles du bloc de butin : survol à la souris, toucher (ou clic) pour épingler.
 * Une infobulle épinglée d'objet porte le bouton « Équiper ».
 */
export function bindLootPanel(root: HTMLElement, loot: ItemInstance[], config: RunConfig, rewards: RunRewards | null): void {
  const panel = root.querySelector<HTMLElement>('.loot-row-panel');
  if (!panel) return;
  const trancheId = getDungeon(config.dungeonId).tranche;
  const tip = document.createElement('div');
  tip.className = 'lr-tip';
  tip.hidden = true;
  root.appendChild(tip);
  let pinned: HTMLElement | null = null;

  const place = (tile: HTMLElement) => {
    const r = tile.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const m = 8;
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(m, Math.min(window.innerWidth - t.width - m, left));
    // Au-dessus de la case si la place le permet, sinon en dessous, sinon calé en haut de l'écran.
    let top = r.top - t.height - 10;
    if (top < m) top = r.bottom + 10;
    if (top + t.height > window.innerHeight - m) {
      // Ni au-dessus ni en dessous : sur le côté de la case, centré verticalement.
      top = Math.max(m, Math.min(window.innerHeight - t.height - m, r.top + r.height / 2 - t.height / 2));
      left = r.right + 10 + t.width <= window.innerWidth - m ? r.right + 10 : Math.max(m, r.left - 10 - t.width);
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const show = (tile: HTMLElement, pin: boolean) => {
    const html = tipHtml(tile, config, rewards, pin);
    if (!html) return hide();
    tip.innerHTML = html;
    tip.classList.toggle('pinned', pin);
    tip.hidden = false;
    panel.querySelectorAll('.lr-tile.on').forEach((el) => el.classList.remove('on'));
    tile.classList.add('on');
    place(tile);
    tip.querySelector<HTMLButtonElement>('[data-action="loot-equip"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setInventory(equipItem(getInventory(), trancheId, tile.dataset.uid!));
      // Les repères « ▲ Mieux » et « Équipé » changent pour tous les objets : on redessine la ligne.
      const fresh = document.createElement('div');
      fresh.innerHTML = lootPanelHtml(loot, config, rewards);
      const next = fresh.firstElementChild as HTMLElement;
      next.classList.add('no-anim');
      panel.replaceWith(next);
      tip.remove();
      pinned = null;
      bindLootPanel(root, loot, config, rewards);
    });
  };
  const hide = () => {
    tip.hidden = true;
    pinned = null;
    panel.querySelectorAll('.lr-tile.on').forEach((el) => el.classList.remove('on'));
  };

  panel.querySelectorAll<HTMLElement>('.lr-tile').forEach((tile) => {
    tile.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || pinned) return;
      show(tile, false);
    });
    tile.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || pinned) return;
      hide();
    });
    tile.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinned === tile) return hide();
      pinned = tile;
      show(tile, true);
    });
  });
  tip.addEventListener('click', (e) => e.stopPropagation());
  root.addEventListener('click', () => pinned && hide());
}
