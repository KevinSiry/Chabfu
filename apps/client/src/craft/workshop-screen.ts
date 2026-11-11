import {
  MASTERY_THRESHOLDS,
  RARITIES,
  RARITY_ORDER,
  SHARDS_BY_RARITY,
  canCraft,
  craft,
  dungeonsForTranche,
  getItem,
  getResource,
  compareWithEquipped,
  isEquipped,
  itemStats,
  breakItems,
  breakResult,
  canBreak,
  runeLabel,
  type RuneKey,
  masteryLevel,
  missingForRecipe,
  recipesForTranche,
  recycleItems,
  setAutoRecycle,
  sortItems,
  type CraftRarity,
  type Inventory,
  type ItemInstance,
  type Rarity,
} from '@chabfu/engine';
import { getInventory, setInventory } from '../stuff/store';
import '../stuff/stuff.css';
import './craft.css';
import { itemIconImg, resourceIconImg, shardIconImg } from '../ui/assets';
import { getCrafting, setCrafting } from './store';
import { icon } from '../ui/icons';
import { bindSegmented, openSheet, segmented, toast } from '../ui/components';
import { pageAll, pagerHtml } from '../ui/pager';
import { KIND_LABEL, bonusScore, itemCardHtml } from '../stuff/item-view';
import { statCompareHtml } from '../stuff/stat-view';
import { runeGemHtml } from '../stuff/rune-view';
import { bindRunesPanel, runesPanelHtml } from './runes-panel';

const PREVIEW_UID = '__craft-preview__';

/** Objet fictif (pas encore fabriqué) ajouté à l'inventaire pour le comparer à l'équipement porté. */
function previewInventory(inv: Inventory, itemId: string, rarity: Rarity): { inv: Inventory; item: ItemInstance } {
  const item: ItemInstance = { uid: PREVIEW_UID, itemId, rarity };
  return { inv: { ...inv, items: [...inv.items, item] }, item };
}

export interface WorkshopScreenOptions {
  trancheId: number;
  dungeonId: string;
  onBack: () => void;
}

const RARITY_SHORT: Record<Rarity, string> = { common: 'Commune', uncommon: 'Inhab.', rare: 'Rare', mythic: 'Mythique', legendary: 'Légend.' };

let dungeonFilter: string | null = null;
let selectedItem: string | null = null;
let selectedRarity: CraftRarity | null = null;
/** Rareté choisie par le joueur : elle reste la même quand il passe d'un objet à l'autre. */
let preferredRarity: CraftRarity | null = null;
let flash = '';
let mode: 'craft' | 'recycle' | 'runes' = 'craft';
/** Objets cochés pour le recyclage (uids). */
const picked = new Set<string>();
let lastPicked: string | null = null;

/**
 * Atelier, même mise en page sur ordinateur et téléphone en paysage :
 * - Fabriquer : objets du donjon à gauche, fiche de l'objet choisi à droite (rareté, stats comparées, coût, bouton).
 * - Recycler : panneau de sélection à gauche, sac à cocher à droite.
 */
export function renderWorkshopScreen(app: HTMLElement, o: WorkshopScreenOptions): void {
  const inv = getInventory();
  const st = getCrafting();
  const shards = st.shards[o.trancheId] ?? 0;
  // Donjon sélectionné en premier : ses ressources sont celles du prochain run.
  const dungeons = dungeonsForTranche(o.trancheId).sort((a, b) => Number(b.id === o.dungeonId) - Number(a.id === o.dungeonId));
  const dungeonId = dungeons.some((d) => d.id === dungeonFilter) ? dungeonFilter! : o.dungeonId;
  const di = dungeons.findIndex((d) => d.id === dungeonId);
  const allRecipes = recipesForTranche(o.trancheId).filter((r) => r.dungeonId === dungeonId);
  const itemIds = [...new Set(allRecipes.map((r) => r.itemId))];
  const shardsHtml = `<span class="ws-shards" title="Éclats de la tranche ${o.trancheId}">${shardIconImg()}<b>${shards}</b><small>Éclats</small></span>`;
  const modeSeg = segmented('ws-mode', [
      { value: 'craft', label: `${icon('hammer')} Fabriquer` },
      { value: 'recycle', label: `${icon('recycle')} Recycler` },
      { value: 'runes', label: `${icon('sparkle')} Runes` },
    ], mode);

  /** Écart de stats si l'on équipait cet objet (fabriqué dans cette rareté). */
  const deltaOf = (itemId: string, rarity: Rarity) => {
    const pv = previewInventory(inv, itemId, rarity);
    return compareWithEquipped(pv.inv, o.trancheId, PREVIEW_UID);
  };

  let body = '';
  if (mode === 'craft') {
    if (!selectedItem || !itemIds.includes(selectedItem)) {
      selectedItem = itemIds[0] ?? null;
    }
    const recipesOf = (id: string) => allRecipes.filter((r) => r.itemId === id);
    const tiles = itemIds
      .map((id) => {
        const def = getItem(id);
        const rs = recipesOf(id);
        const ready = rs.filter((r) => canCraft(st, r));
        const best = ready[ready.length - 1];
        const up = rs.some((r) => bonusScore(deltaOf(id, r.rarity)) > 0 && canCraft(st, r));
        return `<button type="button" class="ws-item${id === selectedItem ? ' on' : ''}" data-item="${id}" aria-label="${def.name}">
          <span class="eq-tile rarity-${best?.rarity ?? 'common'}${up ? ' up' : ''}${ready.length ? '' : ' locked'}">${itemIconImg(def.id)}</span>
          <span class="ws-item-name">${def.name}</span>
        </button>`;
      })
      .join('');

    let detail = '<div class="ui-empty">Aucune recette pour ce donjon.</div>';
    if (selectedItem) {
      const def = getItem(selectedItem);
      const rs = recipesOf(selectedItem);
      if (preferredRarity) {
        // Garde la rareté choisie ; si l'objet ne l'a pas, prend la plus proche.
        const want = RARITY_ORDER.indexOf(preferredRarity);
        selectedRarity = rs.reduce((a, b) =>
          Math.abs(RARITY_ORDER.indexOf(b.rarity) - want) < Math.abs(RARITY_ORDER.indexOf(a.rarity) - want) ? b : a,
        ).rarity;
      } else if (!selectedRarity || !rs.some((r) => r.rarity === selectedRarity)) {
        const ready = rs.filter((r) => canCraft(st, r));
        selectedRarity = (ready[ready.length - 1] ?? rs[0]).rarity;
      }
      const r = rs.find((x) => x.rarity === selectedRarity)!;
      const ok = canCraft(st, r);
      const miss = missingForRecipe(st, r);
      const delta = deltaOf(r.itemId, r.rarity);
      const upgrade = bonusScore(delta) > 0;
      const ing = (name: string, have: number, need: number, missing: boolean, tier: string, img: string) =>
        `<li class="ws-cost${missing ? ' miss' : ''} tier-${tier}">${img}<span class="ws-cost-name">${name}</span><b>${have}<small>/${need}</small></b><i style="width:${Math.min(100, (100 * have) / need)}%"></i></li>`;
      detail = `
        <div class="ws-d-head rarity-${r.rarity}">
          <button type="button" class="eq-tile rarity-${r.rarity}" data-rdetail="${r.id}" aria-label="Fiche de ${def.name}">${itemIconImg(def.id)}</button>
          <div class="ws-d-title">
            <b>${def.name}</b>
            <span><span class="rarity-label">${RARITIES[r.rarity].label}</span> · ${KIND_LABEL[def.kind]} · T${def.tranche}</span>
          </div>
          ${upgrade ? '<span class="tag tag-up">▲ Mieux</span>' : ''}
          <button type="button" class="ui-icon-btn ui-icon-btn--sm ws-d-info" data-rdetail="${r.id}" aria-label="Fiche de comparaison">${icon('info')}</button>
        </div>
        <div class="ws-rar" role="group" aria-label="Rareté">
          ${rs
            .map(
              (x) =>
                `<button type="button" class="rarity-${x.rarity}${x.rarity === r.rarity ? ' on' : ''}${canCraft(st, x) ? ' ready' : ''}" data-rar="${x.rarity}" aria-pressed="${x.rarity === r.rarity}">${RARITY_SHORT[x.rarity]}</button>`,
            )
            .join('')}
        </div>
        <div class="ws-d-body">
          <section class="ws-d-stats"><h4>Stats <small>si équipé</small></h4>${statCompareHtml(itemStats(r.itemId, r.rarity), delta)}</section>
          <section class="ws-d-cost"><h4>Coût</h4><ul>
            ${Object.entries(r.resources)
              .map(([id, n]) => {
                const res = getResource(id);
                return ing(res.name, st.resources[id] ?? 0, n, !!miss.resources[id], res.tier, resourceIconImg(id));
              })
              .join('')}
            ${r.shards ? ing('Éclats', shards, r.shards, !!miss.shards, 'shard', shardIconImg()) : ''}
          </ul></section>
        </div>
        <button class="ui-btn ${ok ? 'ui-btn--primary' : ''} ui-btn--block ws-go" data-craft="${r.id}" ${ok ? '' : 'disabled'}>${icon('hammer')} ${ok ? 'Fabriquer' : 'Ressources insuffisantes'}</button>`;
    }

    body = `
      <aside class="ui-panel ws-list">
        ${modeSeg}
        <div class="ws-dungeon">
          <button class="ui-icon-btn ui-icon-btn--sm" data-dstep="-1" aria-label="Donjon précédent">${icon('back')}</button>
          <b>${dungeons[di]?.name ?? ''}</b>
          <button class="ui-icon-btn ui-icon-btn--sm" data-dstep="1" aria-label="Donjon suivant">${icon('chevronRight')}</button>
        </div>
        <div class="ws-items" data-paged="ws-items-${dungeonId}">${tiles}</div>
        ${pagerHtml(`ws-items-${dungeonId}`)}
      </aside>
      <section class="ui-panel ws-detail">${shardsHtml}${detail}</section>`;
  } else if (mode === 'runes') {
    body = runesPanelHtml(st, o.trancheId, modeSeg, shardsHtml);
  } else {
    const all = inv.items.filter((i) => getItem(i.itemId).tranche === o.trancheId);
    // Raretés basses d'abord : ce sont elles qu'on recycle.
    const byRarityUp = (a: ItemInstance, b: ItemInstance) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    const free = sortItems(all.filter((it) => !isEquipped(inv, it.uid))).sort(byRarityUp);
    const worn = sortItems(all.filter((it) => isEquipped(inv, it.uid)));
    for (const uid of [...picked]) if (!free.some((it) => it.uid === uid)) picked.delete(uid);
    const sel = free.filter((it) => picked.has(it.uid));
    const gain = sel.reduce((s, it) => s + SHARDS_BY_RARITY[it.rarity], 0);
    const byRarity = RARITY_ORDER.map((r) => ({ r, items: free.filter((it) => it.rarity === r) })).filter((g) => g.items.length);
    // Briser : seulement si toute la sélection est Rare ou mieux.
    const breakable = sel.length > 0 && sel.every((it) => canBreak(inv, it));
    const last = lastPicked ? all.find((it) => it.uid === lastPicked) : undefined;

    const grid = all.length
      ? `<div class="eq-grid ws-bag" data-paged="ws-bag-${o.trancheId}">${[...free, ...worn]
          .map((it) => {
            const eq = isEquipped(inv, it.uid);
            const on = picked.has(it.uid);
            return `<button type="button" class="ws-bag-item${on ? ' on' : ''}${eq ? ' is-worn' : ''}" data-ritem="${it.uid}" aria-pressed="${on}" aria-label="${getItem(it.itemId).name}${eq ? ' (équipé)' : ''}">
              <span class="eq-tile rarity-${it.rarity}">${itemIconImg(it.itemId)}</span>
              ${eq ? `<i class="ws-lock">${icon('lock')}</i>` : `<i class="ws-check">${icon('check')}</i>`}
            </button>`;
          })
          .join('')}</div>${pagerHtml(`ws-bag-${o.trancheId}`)}`
      : `<div class="ui-empty eq-empty">${icon('bag')}<b>Sac vide</b><p>Le butin des boss arrive ici.</p></div>`;

    body = `
      <aside class="ui-panel ws-list ws-rec">
        ${modeSeg}
        <div class="ws-rec-sum">
          <span class="ws-rec-count"><b>${sel.length}</b> objet${sel.length > 1 ? 's' : ''} sélectionné${sel.length > 1 ? 's' : ''}</span>
          <span class="ws-rec-gain">${shardIconImg()}<b>+${gain}</b></span>
        </div>
        <div class="ws-quick">
          ${byRarity
            .map(({ r, items }) => {
              const allOn = items.every((it) => picked.has(it.uid));
              return `<button type="button" class="ws-q rarity-${r}${allOn ? ' on' : ''}" data-pick="${r}" aria-pressed="${allOn}"><span>${RARITY_SHORT[r]}</span><b>${items.length}</b></button>`;
            })
            .join('')}
        </div>
        <div class="ws-rec-go">
          <button class="ui-btn ui-btn--gold ws-go" id="ws-recycle-go" ${sel.length ? '' : 'disabled'}>${icon('recycle')} Recycler</button>
          <button class="ui-btn ui-btn--blue ws-go" id="ws-break-go" ${breakable ? '' : 'disabled'} title="Objets Rares ou mieux : une rune chacun, pas d’éclats">${icon('sparkle')} Briser</button>
        </div>
        <div class="ws-rec-foot">
          <select id="auto-recycle" aria-label="Recyclage automatique après chaque run">
            <option value="">Auto : non</option>
            ${RARITY_ORDER.slice(1)
              .map((r) => `<option value="${r}" ${st.autoRecycleBelow === r ? 'selected' : ''}>Auto : sous ${RARITY_SHORT[r]}</option>`)
              .join('')}
          </select>
          <button class="ui-icon-btn ui-icon-btn--sm" id="ws-mastery" aria-label="Maîtrise d’objet" title="Maîtrise d’objet">${icon('trophy')}</button>
        </div>
      </aside>
      <section class="ui-panel ws-detail ws-bag-panel">
        <div class="ws-bag-bar">
          ${shardsHtml}
          <span class="ws-bag-hint">${
            last
              ? `<b class="rarity-${last.rarity}">${getItem(last.itemId).name}</b> <span class="rarity-label rarity-${last.rarity}">${RARITY_SHORT[last.rarity]}</span> · +${SHARDS_BY_RARITY[last.rarity]} éclats${
                  breakResult(last) ? ` ou ${runeGemHtml(breakResult(last), { size: 'sm' })} ${runeLabel(breakResult(last)!)}` : ''
                }`
              : 'Touchez les objets à recycler ou à briser. Les objets équipés sont protégés.'
          }</span>
          ${last ? `<button class="ui-icon-btn ui-icon-btn--sm" id="ws-last-info" aria-label="Fiche de l’objet">${icon('info')}</button>` : ''}
        </div>
        ${grid}
      </section>`;
  }

  const masteries = Object.entries(st.recycled)
    .filter(([id]) => getItem(id).tranche === o.trancheId)
    .sort((a, b) => b[1] - a[1]);
  const masteryHtml = masteries.length
    ? `<div class="ws-mastery" data-paged="ws-mastery">${masteries
        .map(([id, n]) => {
          const lvl = masteryLevel(n);
          const next = MASTERY_THRESHOLDS[lvl];
          return `<div class="mastery-row"><span>${getItem(id).name}</span><span>Palier ${lvl} · ${n}${next ? `/${next}` : ''}</span></div>`;
        })
        .join('')}</div>${pagerHtml('ws-mastery')}`
    : '<p class="muted">Recyclez plusieurs exemplaires d’un objet pour progresser dans sa maîtrise.</p>';

  app.innerHTML = `<div class="setup stuff ws ws--${mode}" data-pager-scope>${body}</div>`;
  pageAll(app);
  if (flash) toast(flash, 'success');
  flash = '';

  const rerender = () => renderWorkshopScreen(app, o);
  bindSegmented(app, 'ws-mode', (v) => {
    mode = v as 'craft' | 'recycle' | 'runes';
    rerender();
  });
  if (mode === 'runes')
    bindRunesPanel(app, o.trancheId, (msg) => {
      if (msg) flash = msg;
      rerender();
    });

  // ----- Fabriquer -----
  app.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) =>
    b.addEventListener('click', () => {
      selectedItem = b.dataset.item!;
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-rar]').forEach((b) =>
    b.addEventListener('click', () => {
      selectedRarity = b.dataset.rar as CraftRarity;
      preferredRarity = selectedRarity;
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-dstep]').forEach((b) =>
    b.addEventListener('click', () => {
      dungeonFilter = dungeons[(di + Number(b.dataset.dstep) + dungeons.length) % dungeons.length].id;
      selectedItem = null;
      rerender();
    }),
  );
  const doCraft = (recipeId: string) => {
    const res = craft(getInventory(), getCrafting(), recipeId);
    setInventory(res.inventory);
    setCrafting(res.crafting);
    flash = `${getItem(res.item.itemId).name} (${RARITIES[res.item.rarity].label}) ajouté au sac.`;
    rerender();
  };
  app.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach((b) => b.addEventListener('click', () => doCraft(b.dataset.craft!)));
  // Fiche détaillée de l'objet à fabriquer : stats complètes et comparaison avec l'objet porté.
  app.querySelectorAll<HTMLButtonElement>('[data-rdetail]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = allRecipes.find((x) => x.id === b.dataset.rdetail);
      if (!r) return;
      const pv = previewInventory(getInventory(), r.itemId, r.rarity);
      const ok = canCraft(getCrafting(), r);
      const sheet = openSheet({
        title: 'Fabriquer',
        html: `${itemCardHtml(pv.item, { inv: pv.inv, trancheId: o.trancheId, compare: true })}<div class="gr-sheet-action"><button class="ui-btn ${ok ? 'ui-btn--primary' : ''} ui-btn--block" id="ws-sheet-craft" ${ok ? '' : 'disabled'}>${icon('hammer')} ${ok ? 'Fabriquer' : 'Ressources insuffisantes'}</button></div>`,
      });
      sheet.el.querySelector('#ws-sheet-craft')?.addEventListener('click', () => {
        sheet.close();
        doCraft(r.id);
      });
    }),
  );

  // ----- Recycler -----
  app.querySelectorAll<HTMLButtonElement>('[data-ritem]').forEach((b) =>
    b.addEventListener('click', () => {
      const uid = b.dataset.ritem!;
      lastPicked = uid;
      if (!isEquipped(getInventory(), uid)) {
        if (picked.has(uid)) picked.delete(uid);
        else picked.add(uid);
      }
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = b.dataset.pick as Rarity;
      const cur = getInventory();
      const items = cur.items.filter((it) => it.rarity === r && getItem(it.itemId).tranche === o.trancheId && !isEquipped(cur, it.uid));
      const allOn = items.every((it) => picked.has(it.uid));
      items.forEach((it) => (allOn ? picked.delete(it.uid) : picked.add(it.uid)));
      rerender();
    }),
  );
  app.querySelector('#ws-last-info')?.addEventListener('click', () => {
    const cur = getInventory();
    const it = cur.items.find((x) => x.uid === lastPicked);
    if (it) openSheet({ title: 'Objet', html: itemCardHtml(it, { inv: cur, trancheId: o.trancheId, compare: true }) });
  });
  const recycle = (uids: string[]) => {
    const res = recycleItems(getInventory(), getCrafting(), uids);
    setInventory(res.inventory);
    setCrafting(res.crafting);
    const gained = res.shardsGained[o.trancheId] ?? 0;
    picked.clear();
    lastPicked = null;
    flash = res.recycled.length ? `${res.recycled.length} objet${res.recycled.length > 1 ? 's' : ''} recyclé${res.recycled.length > 1 ? 's' : ''} : +${gained} éclats.` : '';
    rerender();
  };
  app.querySelector('#ws-recycle-go')?.addEventListener('click', () => {
    const cur = getInventory();
    const sel = cur.items.filter((it) => picked.has(it.uid));
    const precious = sel.filter((it) => RARITY_ORDER.indexOf(it.rarity) >= RARITY_ORDER.indexOf('rare') || (it.runes ?? []).some(Boolean));
    const lostRunes = sel.reduce((n, it) => n + (it.runes ?? []).filter(Boolean).length, 0);
    if (!precious.length) return recycle(sel.map((it) => it.uid));
    // Objets rares ou mieux dans la sélection : on confirme avant de les détruire.
    const gain = sel.reduce((s, it) => s + SHARDS_BY_RARITY[it.rarity], 0);
    const sheet = openSheet({
      title: 'Recycler ?',
      html: `<p class="ws-confirm">${sel.length} objet${sel.length > 1 ? 's' : ''}, dont <b>${precious.length} rare${precious.length > 1 ? 's' : ''} ou mieux</b>, contre <b>+${gain} éclats</b>.${lostRunes ? ` <b>${lostRunes} rune${lostRunes > 1 ? 's' : ''} sertie${lostRunes > 1 ? 's' : ''} sera détruite${lostRunes > 1 ? 's' : ''}.</b>` : ''} C’est définitif.</p>
        <div class="ws-confirm-items">${precious
          .slice(0, 12)
          .map((it) => `<span class="eq-tile rarity-${it.rarity}">${itemIconImg(it.itemId)}</span>`)
          .join('')}</div>
        <div class="gr-sheet-action"><button class="ui-btn ui-btn--gold ui-btn--block" id="ws-confirm">${icon('recycle')} Recycler : +${gain} éclats</button></div>`,
    });
    sheet.el.querySelector('#ws-confirm')?.addEventListener('click', () => {
      sheet.close();
      recycle(sel.map((it) => it.uid));
    });
  });
  app.querySelector('#ws-break-go')?.addEventListener('click', () => {
    const cur = getInventory();
    const sel = cur.items.filter((it) => picked.has(it.uid) && canBreak(cur, it));
    if (!sel.length) return;
    const runes = sel.map((it) => breakResult(it)!) as RuneKey[];
    const lost = sel.reduce((n, it) => n + (it.runes ?? []).filter(Boolean).length, 0);
    const sheet = openSheet({
      title: 'Briser ?',
      html: `<p class="ws-confirm">${sel.length} objet${sel.length > 1 ? 's' : ''} détruit${sel.length > 1 ? 's' : ''} contre ${runes.length} rune${runes.length > 1 ? 's' : ''}, sans éclats.${lost ? ` <b>${lost} rune${lost > 1 ? 's' : ''} sertie${lost > 1 ? 's' : ''} sera détruite${lost > 1 ? 's' : ''}.</b>` : ''} C’est définitif.</p>
        <div class="ws-confirm-items">${runes.slice(0, 12).map((k) => runeGemHtml(k, { size: 'md' })).join('')}</div>
        <div class="gr-sheet-action"><button class="ui-btn ui-btn--blue ui-btn--block" id="ws-break-confirm">${icon('sparkle')} Briser</button></div>`,
    });
    sheet.el.querySelector('#ws-break-confirm')?.addEventListener('click', () => {
      sheet.close();
      const res = breakItems(getInventory(), getCrafting(), sel.map((it) => it.uid));
      setInventory(res.inventory);
      setCrafting(res.crafting);
      picked.clear();
      lastPicked = null;
      flash = `${res.gained.length} rune${res.gained.length > 1 ? 's' : ''} obtenue${res.gained.length > 1 ? 's' : ''} : ${res.gained.map(runeLabel).join(', ')}.`;
      rerender();
    });
  });
  app.querySelector('#auto-recycle')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    setCrafting(setAutoRecycle(getCrafting(), v ? (v as Rarity) : null));
  });
  app.querySelector('#ws-mastery')?.addEventListener('click', () => {
    const sheet = openSheet({ title: 'Maîtrise d’objet', html: `<div class="ws-mastery-sheet">${masteryHtml}</div>`, cls: 'ws-mastery-panel' });
    pageAll(sheet.body);
  });
}
