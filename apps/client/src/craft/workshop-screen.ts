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
  getItem,
  getResource,
  isEquipped,
  masteryLevel,
  missingForRecipe,
  recipesForTranche,
  recycleItems,
  setAutoRecycle,
  sortItems,
  type CraftRarity,
  type Rarity,
} from '@chabfu/engine';
import { getInventory, setInventory } from '../stuff/store';
import '../stuff/stuff.css';
import './craft.css';
import { getCrafting, setCrafting } from './store';

export interface WorkshopScreenOptions {
  trancheId: number;
  dungeonId: string;
  onBack: () => void;
}

let rarityFilter: CraftRarity | 'all' = 'all';
let flash = '';

/** Atelier : ressources et éclats, recettes de craft à rareté fixe, recyclage manuel et automatique. */
export function renderWorkshopScreen(app: HTMLElement, o: WorkshopScreenOptions): void {
  const inv = getInventory();
  const st = getCrafting();
  const shards = st.shards[o.trancheId] ?? 0;
  const resources = dungeonResources(o.dungeonId);
  const recipes = recipesForTranche(o.trancheId).filter((r) => rarityFilter === 'all' || r.rarity === rarityFilter);
  const bag = sortItems(inv.items.filter((i) => getItem(i.itemId).tranche === o.trancheId));
  const masteries = Object.entries(st.recycled)
    .filter(([id]) => getItem(id).tranche === o.trancheId)
    .sort((a, b) => b[1] - a[1]);

  app.innerHTML = `
    <div class="setup stuff">
      <header><h1>Atelier</h1><p>Tranche T${o.trancheId} · craft et recyclage</p>
        <button class="secondary" id="craft-back" style="margin-left:auto">← Retour</button></header>
      <div class="craft-grid">
        <div class="side">
          <div class="card">
            <h3>Éclats T${o.trancheId}</h3>
            <div class="shards">${shards}</div>
            <p class="muted">Obtenus en recyclant les objets de la tranche. Ils servent au craft.</p>
          </div>
          <div class="card">
            <h3>Ressources</h3>
            <div class="res-list">
              ${resources
                .map((r) => {
                  const n = st.resources[r.id] ?? 0;
                  return `<div class="res-row tier-${r.tier}${n ? '' : ' none'}">
                    <span>${r.name}<small>${RESOURCE_TIERS[r.tier].label} · dès difficulté ${r.refDifficulty}</small></span><b>${n}</b>
                  </div>`;
                })
                .join('')}
            </div>
            <p class="muted">Tombent à la fin de chaque donjon gagné. Plus la difficulté est haute, plus elles tombent.</p>
          </div>
        </div>

        <div class="card">
          <h3>Recettes</h3>
          <div class="chips">
            ${(['all', ...CRAFT_RARITIES] as const)
              .map((r) => `<button class="chip${rarityFilter === r ? ' on' : ''}" data-rfilter="${r}">${r === 'all' ? 'Toutes' : RARITIES[r].label}</button>`)
              .join('')}
          </div>
          <p class="craft-flash" id="craft-flash">${flash}</p>
          <div class="recipe-list">
            ${recipes
              .map((r) => {
                const miss = missingForRecipe(st, r);
                const ok = canCraft(st, r);
                const def = getItem(r.itemId);
                return `<div class="recipe rarity-${r.rarity}">
                  <div><b>${def.name}</b><br><span class="rarity-label">${RARITIES[r.rarity].label}</span></div>
                  ${Object.entries(r.resources)
                    .map(
                      ([id, n]) =>
                        `<div class="ing${miss.resources[id] ? ' miss' : ''}"><span>${getResource(id).name}</span><span>${st.resources[id] ?? 0}/${n}</span></div>`,
                    )
                    .join('')}
                  ${r.shards ? `<div class="ing${miss.shards ? ' miss' : ''}"><span>Éclats T${r.tranche}</span><span>${shards}/${r.shards}</span></div>` : ''}
                  <button class="${ok ? 'primary' : 'secondary'}" data-craft="${r.id}" ${ok ? '' : 'disabled'}>Fabriquer</button>
                </div>`;
              })
              .join('')}
          </div>
        </div>

        <div class="side">
          <div class="card">
            <h3>Recyclage automatique</h3>
            <p class="muted">Le butin sous cette rareté est recyclé en éclats dès la fin du run.</p>
            <select id="auto-recycle">
              <option value="">Désactivé</option>
              ${RARITY_ORDER.slice(1)
                .map((r) => `<option value="${r}" ${st.autoRecycleBelow === r ? 'selected' : ''}>Sous ${RARITIES[r].label}</option>`)
                .join('')}
            </select>
          </div>
          <div class="card">
            <h3>Sac <span class="muted">${bag.length}</span></h3>
            <div class="bulk">
              Recycler tout sous
              <select id="bulk-rarity">${RARITY_ORDER.slice(1)
                .map((r) => `<option value="${r}">${RARITIES[r].label}</option>`)
                .join('')}</select>
              <button class="secondary" id="bulk-recycle">Recycler</button>
            </div>
            <div class="bag-list">
              ${
                bag.length
                  ? bag
                      .map((it) => {
                        const eq = isEquipped(inv, it.uid);
                        return `<div class="bag-row rarity-${it.rarity}">
                          <span>${getItem(it.itemId).name}<br><span class="rarity-label">${RARITIES[it.rarity].label}</span></span>
                          ${eq ? '<span class="eq-note">Équipé</span>' : `<button class="secondary" data-recycle="${it.uid}">+${SHARDS_BY_RARITY[it.rarity]} éclats</button>`}
                        </div>`;
                      })
                      .join('')
                  : '<p class="muted">Sac vide.</p>'
              }
            </div>
            <p class="muted">Les objets équipés ne sont jamais recyclés.</p>
          </div>
          <div class="card">
            <h3>Maîtrise d'objet</h3>
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
            }
          </div>
        </div>
      </div>
    </div>`;

  const rerender = () => renderWorkshopScreen(app, o);
  app.querySelector('#craft-back')!.addEventListener('click', () => {
    flash = '';
    o.onBack();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-rfilter]').forEach((b) =>
    b.addEventListener('click', () => {
      rarityFilter = b.dataset.rfilter as CraftRarity | 'all';
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach((b) =>
    b.addEventListener('click', () => {
      const res = craft(getInventory(), getCrafting(), b.dataset.craft!);
      setInventory(res.inventory);
      setCrafting(res.crafting);
      flash = `✓ ${getItem(res.item.itemId).name} (${RARITIES[res.item.rarity].label}) ajouté au sac.`;
      rerender();
    }),
  );
  const recycle = (uids: string[]) => {
    const res = recycleItems(getInventory(), getCrafting(), uids);
    setInventory(res.inventory);
    setCrafting(res.crafting);
    const gained = res.shardsGained[o.trancheId] ?? 0;
    flash = res.recycled.length ? `♻ ${res.recycled.length} objet${res.recycled.length > 1 ? 's' : ''} recyclé${res.recycled.length > 1 ? 's' : ''} : +${gained} éclats.` : '';
    rerender();
  };
  app.querySelectorAll<HTMLButtonElement>('[data-recycle]').forEach((b) => b.addEventListener('click', () => recycle([b.dataset.recycle!])));
  app.querySelector('#bulk-recycle')!.addEventListener('click', () => {
    const below = (app.querySelector('#bulk-rarity') as HTMLSelectElement).value as Rarity;
    const rank = RARITY_ORDER.indexOf(below);
    recycle(bag.filter((it) => RARITY_ORDER.indexOf(it.rarity) < rank).map((it) => it.uid));
  });
  app.querySelector('#auto-recycle')!.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    setCrafting(setAutoRecycle(getCrafting(), v ? (v as Rarity) : null));
  });
}
