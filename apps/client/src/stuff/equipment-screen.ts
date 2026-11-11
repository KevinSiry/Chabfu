import {
  RARITIES,
  RARITY_ORDER,
  SLOTS,
  bossDropRates,
  compareWithEquipped,
  equipItem,
  equipmentBonus,
  findItem,
  getItem,
  getLoadout,
  rarityChances,
  sortItems,
  unequipSlot,
  type ItemKind,
} from '@chabfu/engine';
import { KIND_LABEL, bonusScore, itemCardHtml } from './item-view';
import { characterStatsHtml, statRowsHtml } from './stat-view';
import { getInventory, setInventory } from './store';
import { openRuneSlotSheet } from './rune-sheet';
import { runeDropChances, RUNE_GRADES, RUNE_GRADE_LABEL } from '@chabfu/engine';
import { assetUrl, itemIconImg, kindIconImg } from '../ui/assets';
import { bindSegmented, openSheet, segmented } from '../ui/components';
import { pageAll, pagerHtml } from '../ui/pager';
import { icon } from '../ui/icons';
import './stuff.css';

export interface EquipmentScreenOptions {
  trancheId: number;
  dungeonId: string;
  difficulty: number;
  onBack: () => void;
}

let filter: ItemKind | 'all' = 'all';
/** Volet de droite : sac ou caractéristiques. */
let view: 'bag' | 'stats' = 'bag';

/** Écran d'équipement : loadout de la tranche (9 emplacements), sac, total des bonus et table de butin. */
export function renderEquipmentScreen(app: HTMLElement, o: EquipmentScreenOptions): void {
  const inv = getInventory();
  const loadout = getLoadout(inv, o.trancheId);
  const totalBonus = equipmentBonus(inv, o.trancheId);
  // Le sac ne montre que les objets non portés : les objets équipés se voient sur le personnage.
  const wornUids = new Set(Object.values(loadout).filter(Boolean));
  const unworn = inv.items.filter((i) => getItem(i.itemId).tranche === o.trancheId && !wornUids.has(i.uid));
  const bag = sortItems(unworn).filter((i) => filter === 'all' || getItem(i.itemId).kind === filter);
  const kinds = [...new Set(SLOTS.map((s) => s.kind))];
  const chances = rarityChances(o.difficulty);
  const rates = bossDropRates(o.dungeonId, o.difficulty);
  const pct = (v: number) => (v === 0 ? '—' : v < 0.01 ? `${(v * 100).toFixed(2)} %` : `${Math.round(v * 100)} %`);

  const tile = (uid: string, itemId: string, rarity: string, kind: string, extra = '') =>
    `<button class="eq-tile rarity-${rarity} ${extra}" data-item="${uid}" aria-label="${getItem(itemId).name}">${itemIconImg(itemId)}</button>`;
  const slotHtml = (s: (typeof SLOTS)[number]) => {
    const item = loadout[s.id] ? findItem(inv, loadout[s.id]!) : undefined;
    return item
      ? `<div class="eq-slot" title="${s.label}">${tile(item.uid, item.itemId, item.rarity, s.kind, 'worn')}<span>${s.label}</span></div>`
      : `<div class="eq-slot empty" title="${s.label}"><span class="eq-tile empty">${kindIconImg(s.kind)}</span><span>${s.label}</span></div>`;
  };
  const worn = Object.values(loadout).filter(Boolean).length;
  const bagCount = unworn.length;

  app.innerHTML = `
    <div class="setup stuff eq" data-pager-scope>
      <section class="ui-panel eq-hero">
        <div class="eq-hero-head"><span>Porté</span> <b>${worn} / ${SLOTS.length}</b></div>
        <div class="eq-doll">
          <div class="eq-col">${SLOTS.slice(0, 3).map(slotHtml).join('')}</div>
          <div class="eq-archer"><img src="${assetUrl('units/archer.png')}" alt="" draggable="false"></div>
          <div class="eq-col">${SLOTS.slice(3, 6).map(slotHtml).join('')}</div>
          <div class="eq-row">${SLOTS.slice(6).map(slotHtml).join('')}</div>
        </div>
      </section>
      <section class="ui-panel eq-bag">
        <div class="eq-bar">
          ${segmented('eq-view', [{ value: 'bag', label: `${icon('bag')} Sac <b>${bagCount}</b>` }, { value: 'stats', label: `${icon('info')} Stats` }], view)}
          <button class="ui-btn ui-btn--gold ui-btn--sm eq-loot-btn" id="eq-loot" aria-label="Butin du boss">${icon('trophy')}<span>Butin du boss</span></button>
          ${view === 'bag' && bag.length ? pagerHtml(`eq-bag-${o.trancheId}-${filter}`) : ''}
        </div>
        ${
          view === 'stats'
            ? `<div class="eq-stats">${characterStatsHtml(totalBonus)}</div>`
            : `<div class="chips eq-kinds">
          <button class="chip ${filter === 'all' ? 'on' : ''}" data-filter="all">Tout</button>
          ${kinds.map((k) => `<button class="chip ${filter === k ? 'on' : ''}" data-filter="${k}" title="${KIND_LABEL[k]}" aria-label="${KIND_LABEL[k]}">${kindIconImg(k)}<span>${KIND_LABEL[k]}</span></button>`).join('')}
        </div>
        ${
          bag.length
            ? `<div class="eq-grid" data-paged="eq-bag-${o.trancheId}-${filter}">${bag
                .map((i) => {
                  const def = getItem(i.itemId);
                  const up = bonusScore(compareWithEquipped(inv, o.trancheId, i.uid)) > 0;
                  return tile(i.uid, i.itemId, i.rarity, def.kind, up ? 'up' : '');
                })
                .join('')}</div>`
            : unworn.length
              ? `<div class="ui-empty eq-empty">${icon('bag')}<b>Rien de ce type dans le sac</b><p>Les objets portés se voient sur le personnage.</p></div>`
              : worn
                ? `<div class="ui-empty eq-empty">${icon('bag')}<b>Sac vide</b><p>Tout est porté. Battez le boss d’un donjon pour obtenir d’autres objets.</p></div>`
                : `<div class="ui-empty eq-empty">${icon('bag')}<b>Sac vide</b><p>Battez le boss d’un donjon pour obtenir du butin.</p></div>`
        }`
        }
      </section>
    </div>`;
  pageAll(app);
  bindSegmented(app, 'eq-view', (v) => {
    view = v as 'bag' | 'stats';
    renderEquipmentScreen(app, o);
  });

  const rerender = () => renderEquipmentScreen(app, o);
  const openItem = (uid: string) => {
    const cur = getInventory();
    const item = findItem(cur, uid);
    if (!item) return;
    const slot = (Object.entries(getLoadout(cur, o.trancheId)) as [string, string | undefined][]).find(([, u]) => u === uid)?.[0];
    const action = slot
      ? `<button class="ui-btn ui-btn--danger ui-btn--block" id="eq-act">Retirer</button>`
      : `<button class="ui-btn ui-btn--primary ui-btn--block" id="eq-act">Équiper</button>`;
    const sheet = openSheet({
      title: 'Objet',
      html: `${itemCardHtml(item, { inv: cur, trancheId: o.trancheId, compare: true, runeButtons: true })}<div class="gr-sheet-action">${action}</div>`,
    });
    sheet.el.querySelector('#eq-act')!.addEventListener('click', () => {
      const now = getInventory();
      setInventory(slot ? unequipSlot(now, o.trancheId, slot as (typeof SLOTS)[number]['id']) : equipItem(now, o.trancheId, uid));
      sheet.close();
      rerender();
    });
    sheet.el.querySelectorAll<HTMLButtonElement>('[data-rslot]').forEach((b) =>
      b.addEventListener('click', () =>
        openRuneSlotSheet(uid, Number(b.dataset.rslot), () => {
          rerender();
          openItem(uid);
        }),
      ),
    );
  };
  app.querySelectorAll<HTMLElement>('[data-item]').forEach((el) => el.addEventListener('click', () => openItem(el.dataset.item!)));
  app.querySelector('#eq-loot')!.addEventListener('click', () =>
    openSheet({
      title: `Butin du boss · difficulté ${o.difficulty}`,
      html: `
        <table class="scores">${rates.map((r) => `<tr><td><span class="drop-name">${itemIconImg(r.item.id, 'asset-res')}${r.item.name}</span></td><td>${pct(r.rate)}</td></tr>`).join('')}</table>
        <h3 class="ui-section-title">Rareté de chaque drop</h3>
        <table class="scores">${RARITY_ORDER.map((r) => `<tr><td class="rarity-${r}"><span class="rarity-label">${RARITIES[r].label}</span></td><td>${pct(chances[r])}</td></tr>`).join('')}</table>
        <h3 class="ui-section-title">Runes</h3>
        <table class="scores">${RUNE_GRADES.map((g) => `<tr><td>Rune ${RUNE_GRADE_LABEL[g]}</td><td>${pct(runeDropChances(o.difficulty)[g])}</td></tr>`).join('')}</table>
        <p class="muted">Au moins un objet par victoire. Plus la difficulté est haute, plus il y a de drops et de raretés hautes. Légendaire à partir de la difficulté 6.</p>`,
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.filter as ItemKind | 'all';
      rerender();
    }),
  );
}

/** Petite carte récapitulative pour l'écran de préparation. */
export function equipmentSummaryHtml(trancheId: number): string {
  const inv = getInventory();
  const worn = Object.values(getLoadout(inv, trancheId)).filter(Boolean).length;
  const bonus = equipmentBonus(inv, trancheId);
  return `
    <div class="card">
      <h3>Équipement <span class="muted">${worn} / ${SLOTS.length}</span></h3>
      ${worn ? statRowsHtml(bonus, { compact: true }) : '<p class="muted">Rien d’équipé.</p>'}
      <button class="secondary" id="open-equipment" style="width:100%;margin-top:8px">Inventaire et équipement</button>
    </div>`;
}
