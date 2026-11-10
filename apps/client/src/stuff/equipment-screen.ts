import {
  RARITIES,
  RARITY_ORDER,
  SLOTS,
  bossDropRates,
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
import { KIND_LABEL, itemCardHtml } from './item-view';
import { characterStatsHtml, statRowsHtml } from './stat-view';
import { getInventory, setInventory } from './store';
import { itemIconImg } from '../ui/assets';
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

  app.innerHTML = `
    <div class="setup stuff">
      <header><h1>Équipement</h1><p>Tranche T${o.trancheId} · ${inv.items.length} objet${inv.items.length > 1 ? 's' : ''} au total</p>
        <button class="secondary" id="stuff-back" style="margin-left:auto">← Retour</button></header>
      <div class="stuff-grid">
        <div class="card">
          <h3>Porté</h3>
          <div class="slots">
            ${SLOTS.map((s) => {
              const item = loadout[s.id] ? findItem(inv, loadout[s.id]!) : undefined;
              if (!item) return `<div class="slot empty"><span class="item-icon kind-${s.kind}">${itemIconImg(s.kind)}</span><span class="slot-label">${s.label}</span><span class="muted">vide</span></div>`;
              return `<div class="slot rarity-${item.rarity}" data-slot="${s.id}" tabindex="0" aria-label="${getItem(item.itemId).name}, cliquer pour retirer">
                  <div class="item-tip">${itemCardHtml(item, { inv, trancheId: o.trancheId })}</div>
                  <span class="item-icon kind-${s.kind}">${itemIconImg(s.kind)}</span>
                  <span class="slot-label">${s.label}</span>
                  <span class="item-name">${getItem(item.itemId).name}</span>
                  <span class="rarity-label">${RARITIES[item.rarity].label}</span>
                </div>`;
            }).join('')}
          </div>
          <h3 style="margin-top:16px">Stats du personnage</h3>
          ${characterStatsHtml(totalBonus)}
          <p class="muted">Base de l’Archer + objets portés. Elles s’appliquent à chaque run de la tranche T${o.trancheId}.</p>
        </div>
        <div class="card">
          <h3>Sac</h3>
          <div class="chips">
            <button class="chip ${filter === 'all' ? 'on' : ''}" data-filter="all">Tout</button>
            ${kinds.map((k) => `<button class="chip ${filter === k ? 'on' : ''}" data-filter="${k}">${KIND_LABEL[k]}</button>`).join('')}
          </div>
          <div class="bag">
            ${
              bag.length
                ? bag
                    .map((i) => {
                      const eq = Object.values(loadout).includes(i.uid);
                      return itemCardHtml(i, { inv, trancheId: o.trancheId, compare: true, action: eq ? undefined : { label: 'Équiper', name: 'equip' } });
                    })
                    .join('')
                : '<p class="muted">Rien ici pour l’instant. Battez le boss du donjon pour obtenir du butin.</p>'
            }
          </div>
        </div>
        <div class="card drop-card">
          <h3>Butin du boss · difficulté ${o.difficulty}</h3>
          <table class="scores">
            ${rates.map((r) => `<tr><td>${r.item.name}</td><td>${pct(r.rate)}</td></tr>`).join('')}
          </table>
          <h3 style="margin-top:12px">Rareté de chaque drop</h3>
          <table class="scores">
            ${RARITY_ORDER.map((r) => `<tr><td class="rarity-${r}"><span class="rarity-label">${RARITIES[r].label}</span></td><td>${pct(chances[r])}</td></tr>`).join('')}
          </table>
          <p class="muted">Au moins un objet par victoire. Plus la difficulté est haute, plus il y a de drops et de raretés hautes. Légendaire à partir de la difficulté 6.</p>
        </div>
      </div>
    </div>`;

  const rerender = () => renderEquipmentScreen(app, o);
  app.querySelector('#stuff-back')!.addEventListener('click', o.onBack);
  app.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) =>
    el.addEventListener('click', () => {
      setInventory(unequipSlot(getInventory(), o.trancheId, el.dataset.slot as (typeof SLOTS)[number]['id']));
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-action="equip"]').forEach((b) =>
    b.addEventListener('click', () => {
      setInventory(equipItem(getInventory(), o.trancheId, b.dataset.uid!));
      rerender();
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
