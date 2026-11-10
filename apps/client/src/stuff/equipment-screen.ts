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
import { assetUrl, itemIconImg } from '../ui/assets';
import { openSheet } from '../ui/components';
import { icon } from '../ui/icons';
import './stuff.css';

export interface EquipmentScreenOptions {
  trancheId: number;
  dungeonId: string;
  difficulty: number;
  onBack: () => void;
}

let filter: ItemKind | 'all' = 'all';

/** Écran d'équipement : loadout de la tranche (9 emplacements), sac, total des bonus et table de butin. */
export function renderEquipmentScreen(app: HTMLElement, o: EquipmentScreenOptions): void {
  const inv = getInventory();
  const loadout = getLoadout(inv, o.trancheId);
  const totalBonus = equipmentBonus(inv, o.trancheId);
  const bag = sortItems(inv.items.filter((i) => getItem(i.itemId).tranche === o.trancheId)).filter(
    (i) => filter === 'all' || getItem(i.itemId).kind === filter,
  );
  const kinds = [...new Set(SLOTS.map((s) => s.kind))];
  const chances = rarityChances(o.difficulty);
  const rates = bossDropRates(o.dungeonId, o.difficulty);
  const pct = (v: number) => (v === 0 ? '—' : v < 0.01 ? `${(v * 100).toFixed(2)} %` : `${Math.round(v * 100)} %`);

  const tile = (uid: string, itemId: string, rarity: string, kind: string, extra = '') =>
    `<button class="eq-tile rarity-${rarity} ${extra}" data-item="${uid}" aria-label="${getItem(itemId).name}">${itemIconImg(kind)}</button>`;
  const slotHtml = (s: (typeof SLOTS)[number]) => {
    const item = loadout[s.id] ? findItem(inv, loadout[s.id]!) : undefined;
    return item
      ? `<div class="eq-slot">${tile(item.uid, item.itemId, item.rarity, s.kind, 'worn')}<span>${s.label}</span></div>`
      : `<div class="eq-slot empty"><span class="eq-tile empty">${itemIconImg(s.kind)}</span><span>${s.label}</span></div>`;
  };
  const half = Math.ceil(SLOTS.length / 2);
  const worn = Object.values(loadout).filter(Boolean).length;

  app.innerHTML = `
    <div class="setup stuff eq">
      <section class="ui-panel eq-hero">
        <div class="eq-hero-head"><span>Porté</span> <b>${worn} / ${SLOTS.length}</b></div>
        <div class="eq-doll">
          <div class="eq-col">${SLOTS.slice(0, half).map(slotHtml).join('')}</div>
          <div class="eq-archer"><img src="${assetUrl('units/archer.png')}" alt="" draggable="false"></div>
          <div class="eq-col">${SLOTS.slice(half).map(slotHtml).join('')}</div>
        </div>
        <div class="eq-stats">${characterStatsHtml(totalBonus)}</div>
      </section>
      <section class="ui-panel eq-bag">
        <div class="eq-hero-head"><span>Sac</span> <b>${bag.length}</b>
          <button class="ui-btn ui-btn--gold ui-btn--sm eq-loot-btn" id="eq-loot">${icon('bag')} Butin du boss</button></div>
        <div class="chips">
          <button class="chip ${filter === 'all' ? 'on' : ''}" data-filter="all">Tout</button>
          ${kinds.map((k) => `<button class="chip ${filter === k ? 'on' : ''}" data-filter="${k}">${KIND_LABEL[k]}</button>`).join('')}
        </div>
        ${
          bag.length
            ? `<div class="eq-grid">${bag
                .map((i) => {
                  const eq = Object.values(loadout).includes(i.uid);
                  const def = getItem(i.itemId);
                  const up = !eq && bonusScore(compareWithEquipped(inv, o.trancheId, i.uid)) > 0;
                  return tile(i.uid, i.itemId, i.rarity, def.kind, `${eq ? 'worn' : ''} ${up ? 'up' : ''}`);
                })
                .join('')}</div>`
            : `<div class="ui-empty eq-empty">${icon('bag')}<b>Sac vide</b><p>Battez le boss d’un donjon pour obtenir du butin.</p></div>`
        }
      </section>
    </div>`;

  const rerender = () => renderEquipmentScreen(app, o);
  app.querySelectorAll<HTMLElement>('[data-item]').forEach((el) =>
    el.addEventListener('click', () => {
      const uid = el.dataset.item!;
      const cur = getInventory();
      const item = findItem(cur, uid);
      if (!item) return;
      const slot = (Object.entries(getLoadout(cur, o.trancheId)) as [string, string | undefined][]).find(([, u]) => u === uid)?.[0];
      const action = slot
        ? `<button class="ui-btn ui-btn--danger ui-btn--block" id="eq-act">Retirer</button>`
        : `<button class="ui-btn ui-btn--primary ui-btn--block" id="eq-act">Équiper</button>`;
      const sheet = openSheet({
        title: 'Objet',
        html: `${itemCardHtml(item, { inv: cur, trancheId: o.trancheId, compare: true })}<div class="gr-sheet-action">${action}</div>`,
      });
      sheet.el.querySelector('#eq-act')!.addEventListener('click', () => {
        const now = getInventory();
        setInventory(slot ? unequipSlot(now, o.trancheId, slot as (typeof SLOTS)[number]['id']) : equipItem(now, o.trancheId, uid));
        sheet.close();
        rerender();
      });
    }),
  );
  app.querySelector('#eq-loot')!.addEventListener('click', () =>
    openSheet({
      title: `Butin du boss · difficulté ${o.difficulty}`,
      html: `
        <table class="scores">${rates.map((r) => `<tr><td>${r.item.name}</td><td>${pct(r.rate)}</td></tr>`).join('')}</table>
        <h3 class="ui-section-title">Rareté de chaque drop</h3>
        <table class="scores">${RARITY_ORDER.map((r) => `<tr><td class="rarity-${r}"><span class="rarity-label">${RARITIES[r].label}</span></td><td>${pct(chances[r])}</td></tr>`).join('')}</table>
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
