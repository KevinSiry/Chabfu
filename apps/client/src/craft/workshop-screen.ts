import {
  CRAFT_RARITIES,
  MASTERY_THRESHOLDS,
  RARITIES,
  RARITY_ORDER,
  RESOURCE_TIERS,
  SHARDS_BY_RARITY,
  canCraft,
  craft,
  dungeonResources,
  dungeonsForTranche,
  getItem,
  getResource,
  compareWithEquipped,
  isEquipped,
  itemStats,
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
import { itemIconImg } from '../ui/assets';
import { getCrafting, setCrafting } from './store';
import { icon } from '../ui/icons';
import { bindSegmented, openSheet, segmented } from '../ui/components';
import { bonusScore, itemCardHtml } from '../stuff/item-view';
import { statRowsHtml } from '../stuff/stat-view';

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

let rarityFilter: CraftRarity | 'all' = 'all';
let dungeonFilter: string | null = null;
let flash = '';
let mode: 'craft' | 'recycle' = 'craft';

/** Atelier : ressources et éclats, recettes de craft à rareté fixe, recyclage manuel et automatique. */
export function renderWorkshopScreen(app: HTMLElement, o: WorkshopScreenOptions): void {
  const inv = getInventory();
  const st = getCrafting();
  const shards = st.shards[o.trancheId] ?? 0;
  // Donjon sélectionné en premier : ses ressources sont celles du prochain run.
  const dungeons = dungeonsForTranche(o.trancheId).sort((a, b) => Number(b.id === o.dungeonId) - Number(a.id === o.dungeonId));
  const dungeonId = dungeons.some((d) => d.id === dungeonFilter) ? dungeonFilter! : o.dungeonId;
  const recipes = recipesForTranche(o.trancheId).filter((r) => r.dungeonId === dungeonId && (rarityFilter === 'all' || r.rarity === rarityFilter));
  const bag = sortItems(inv.items.filter((i) => getItem(i.itemId).tranche === o.trancheId));
  const masteries = Object.entries(st.recycled)
    .filter(([id]) => getItem(id).tranche === o.trancheId)
    .sort((a, b) => b[1] - a[1]);

  const res = dungeonResources(dungeonId);
  const craftPane = `
      <div class="ws-res">
        <span class="ws-shards">${icon('shard')}<b>${shards}</b><small>Éclats T${o.trancheId}</small></span>
        ${res
          .map((r) => {
            const n = st.resources[r.id] ?? 0;
            return `<span class="ws-pill tier-${r.tier}${n ? '' : ' none'}" title="${RESOURCE_TIERS[r.tier].label} · dès difficulté ${r.refDifficulty}"><b>${n}</b>${r.name}</span>`;
          })
          .join('')}
      </div>
      <div class="chips">
        ${dungeons.map((d) => `<button class="chip${d.id === dungeonId ? ' on' : ''}" data-dfilter="${d.id}">${d.name}</button>`).join('')}
      </div>
      <div class="chips">
        ${(['all', ...CRAFT_RARITIES] as const)
          .map((r) => `<button class="chip${rarityFilter === r ? ' on' : ''}" data-rfilter="${r}">${r === 'all' ? 'Toutes' : RARITIES[r].label}</button>`)
          .join('')}
      </div>
      <div class="ws-recipes">
        ${recipes
          .map((r) => {
            const miss = missingForRecipe(st, r);
            const ok = canCraft(st, r);
            const def = getItem(r.itemId);
            const pv = previewInventory(inv, r.itemId, r.rarity);
            const upgrade = bonusScore(compareWithEquipped(pv.inv, o.trancheId, PREVIEW_UID)) > 0;
            const ing = (name: string, have: number, need: number, missing: boolean) =>
              `<div class="ws-ing${missing ? ' miss' : ''}"><span>${name}</span><b>${have}/${need}</b><i style="width:${Math.min(100, (100 * have) / need)}%"></i></div>`;
            return `<div class="ws-recipe rarity-${r.rarity}">
              <button type="button" class="ws-recipe-head" data-rdetail="${r.id}" aria-label="Voir les stats de ${def.name}"><span class="eq-tile rarity-${r.rarity}">${itemIconImg(def.kind)}</span><div><b>${def.name}</b><span class="rarity-label">${RARITIES[r.rarity].label}</span>${upgrade ? '<span class="tag tag-up">▲ Mieux</span>' : ''}</div></button>
              ${statRowsHtml(itemStats(r.itemId, r.rarity), { compact: true })}
              ${Object.entries(r.resources)
                .map(([id, n]) => ing(getResource(id).name, st.resources[id] ?? 0, n, !!miss.resources[id]))
                .join('')}
              ${r.shards ? ing(`Éclats T${r.tranche}`, shards, r.shards, !!miss.shards) : ''}
              <button class="ui-btn ${ok ? 'ui-btn--primary' : ''} ui-btn--sm ui-btn--block" data-craft="${r.id}" ${ok ? '' : 'disabled'}>${icon('hammer')} Fabriquer</button>
            </div>`;
          })
          .join('')}
      </div>`;
  const recyclePane = `
      <div class="ws-recycle-top">
        <span class="ws-shards">${icon('shard')}<b>${shards}</b><small>Éclats T${o.trancheId}</small></span>
        <label class="ws-field">Recyclage auto après chaque run
          <select id="auto-recycle">
            <option value="">Désactivé</option>
            ${RARITY_ORDER.slice(1)
              .map((r) => `<option value="${r}" ${st.autoRecycleBelow === r ? 'selected' : ''}>Sous ${RARITIES[r].label}</option>`)
              .join('')}
          </select></label>
        <div class="ws-field ws-bulk">Tout recycler sous
          <select id="bulk-rarity">${RARITY_ORDER.slice(1)
            .map((r) => `<option value="${r}">${RARITIES[r].label}</option>`)
            .join('')}</select>
          <button class="ui-btn ui-btn--gold ui-btn--sm" id="bulk-recycle">${icon('recycle')} Recycler</button>
        </div>
      </div>
      ${
        bag.length
          ? `<div class="eq-grid ws-bag">${bag
              .map((it) => {
                const eq = isEquipped(inv, it.uid);
                return `<button class="eq-tile rarity-${it.rarity} ${eq ? 'worn' : ''}" data-ritem="${it.uid}" aria-label="${getItem(it.itemId).name}">${itemIconImg(getItem(it.itemId).kind)}</button>`;
              })
              .join('')}</div><p class="muted">Touchez un objet pour le recycler. Les objets équipés ne sont jamais recyclés.</p>`
          : `<div class="ui-empty eq-empty">${icon('bag')}<b>Sac vide</b><p>Le butin des boss arrive ici.</p></div>`
      }
      <h3 class="ws-sub">Maîtrise d'objet</h3>
      ${
        masteries.length
          ? masteries
              .map(([id, n]) => {
                const lvl = masteryLevel(n);
                const next = MASTERY_THRESHOLDS[lvl];
                return `<div class="mastery-row"><span>${getItem(id).name}</span><span>Palier ${lvl} · ${n}${next ? `/${next}` : ''}</span></div>`;
              })
              .join('')
          : '<p class="muted">Recyclez plusieurs exemplaires d’un objet pour progresser dans sa maîtrise.</p>'
      }`;

  app.innerHTML = `
    <div class="setup stuff ws">
      ${segmented('ws-mode', [{ value: 'craft', label: `${icon('hammer')} Fabriquer` }, { value: 'recycle', label: `${icon('recycle')} Recycler` }], mode)}
      <p class="craft-flash" id="craft-flash">${flash}</p>
      <section class="ui-panel ws-pane">${mode === 'craft' ? craftPane : recyclePane}</section>
    </div>`;

  const rerender = () => renderWorkshopScreen(app, o);
  bindSegmented(app, 'ws-mode', (v) => {
    mode = v as 'craft' | 'recycle';
    flash = '';
    rerender();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-ritem]').forEach((b) =>
    b.addEventListener('click', () => {
      const cur = getInventory();
      const it = cur.items.find((x) => x.uid === b.dataset.ritem);
      if (!it) return;
      const eq = isEquipped(cur, it.uid);
      const sheet = openSheet({
        title: 'Recycler',
        html: `${itemCardHtml(it, { inv: cur, trancheId: o.trancheId })}<div class="gr-sheet-action">${
          eq
            ? '<button class="ui-btn ui-btn--block" disabled>Équipé : retirez-le d’abord</button>'
            : `<button class="ui-btn ui-btn--gold ui-btn--block" id="ws-recycle">${icon('recycle')} Recycler : +${SHARDS_BY_RARITY[it.rarity]} éclats</button>`
        }</div>`,
      });
      sheet.el.querySelector('#ws-recycle')?.addEventListener('click', () => {
        sheet.close();
        recycle([it.uid]);
      });
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-rfilter]').forEach((b) =>
    b.addEventListener('click', () => {
      rarityFilter = b.dataset.rfilter as CraftRarity | 'all';
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-dfilter]').forEach((b) =>
    b.addEventListener('click', () => {
      dungeonFilter = b.dataset.dfilter!;
      rerender();
    }),
  );
  const doCraft = (recipeId: string) => {
    const res = craft(getInventory(), getCrafting(), recipeId);
    setInventory(res.inventory);
    setCrafting(res.crafting);
    flash = `${icon('check')} ${getItem(res.item.itemId).name} (${RARITIES[res.item.rarity].label}) ajouté au sac.`;
    rerender();
  };
  app.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach((b) => b.addEventListener('click', () => doCraft(b.dataset.craft!)));
  // Fiche détaillée de l'objet à fabriquer : stats complètes et comparaison avec l'objet porté.
  app.querySelectorAll<HTMLButtonElement>('[data-rdetail]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = recipes.find((x) => x.id === b.dataset.rdetail);
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
  const recycle = (uids: string[]) => {
    const res = recycleItems(getInventory(), getCrafting(), uids);
    setInventory(res.inventory);
    setCrafting(res.crafting);
    const gained = res.shardsGained[o.trancheId] ?? 0;
    flash = res.recycled.length ? `${icon('recycle')} ${res.recycled.length} objet${res.recycled.length > 1 ? 's' : ''} recyclé${res.recycled.length > 1 ? 's' : ''} : +${gained} éclats.` : '';
    rerender();
  };
  app.querySelectorAll<HTMLButtonElement>('[data-recycle]').forEach((b) => b.addEventListener('click', () => recycle([b.dataset.recycle!])));
  app.querySelector('#bulk-recycle')?.addEventListener('click', () => {
    const below = (app.querySelector('#bulk-rarity') as HTMLSelectElement).value as Rarity;
    const rank = RARITY_ORDER.indexOf(below);
    recycle(bag.filter((it) => RARITY_ORDER.indexOf(it.rarity) < rank).map((it) => it.uid));
  });
  app.querySelector('#auto-recycle')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    setCrafting(setAutoRecycle(getCrafting(), v ? (v as Rarity) : null));
  });
}
