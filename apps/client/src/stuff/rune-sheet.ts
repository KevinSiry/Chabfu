import {
  ALL_RUNE_KEYS,
  extractCost,
  findItem,
  getItem,
  itemRunes,
  runeEffectText,
  runeLabel,
  runeStock,
  socketError,
  socketRune,
  unsocketRune,
  type RuneKey,
} from '@chabfu/engine';
import { getCrafting, setCrafting } from '../craft/store';
import { openSheet, sheetColumns, toast } from '../ui/components';
import { icon } from '../ui/icons';
import { pageAll, pagerHtml } from '../ui/pager';
import { getInventory, setInventory } from './store';
import { runeGemHtml, runeLineHtml } from './rune-view';

/**
 * Fiche d'un emplacement de rune : sertir une rune du stock (emplacement libre),
 * ou extraire, détruire, remplacer la rune sertie. `onDone` est appelé après chaque changement.
 */
export function openRuneSlotSheet(uid: string, slot: number, onDone: () => void): void {
  const inv = getInventory();
  const st = getCrafting();
  const item = findItem(inv, uid);
  if (!item) return;
  const current = itemRunes(item)[slot];
  const tranche = getItem(item.itemId).tranche;
  const owned = ALL_RUNE_KEYS.filter((k) => runeStock(st, k) > 0);

  const picks = owned.length
    ? `<div class="rune-picks"><div class="rune-pick-grid" data-paged="rune-pick">${owned
        .map((k) => {
          const err = socketError(inv, st, uid, slot, k);
          return `<button type="button" class="rune-pick" data-key="${k}" ${err ? `disabled title="${err}"` : ''}>${runeGemHtml(k, { size: 'sm', count: runeStock(st, k) })}<span><b>${runeLabel(k)}</b><small>${runeEffectText(k)}</small></span></button>`;
        })
        .join('')}</div>${pagerHtml('rune-pick')}</div>`
    : '<p class="rune-sheet-note">Aucune rune en stock. Les runes tombent sur les boss à partir de la difficulté 4, ou s’obtiennent en brisant un objet Rare ou mieux à l’atelier.</p>';

  let html: string;
  if (current) {
    const cost = extractCost(current);
    const shards = st.shards[tranche] ?? 0;
    html = `
      ${runeLineHtml(current)}
      <div class="rune-sheet-actions">
        <button class="ui-btn ui-btn--gold" id="rune-extract" ${shards >= cost ? '' : 'disabled'}>${icon('back')} Extraire : ${cost} éclats</button>
        <button class="ui-btn ui-btn--danger" id="rune-destroy">${icon('close')} Détruire</button>
      </div>
      <p class="rune-sheet-note">Extraire rend la rune contre des éclats (vous en avez ${shards}). Détruire est gratuit mais définitif.${owned.length ? ' Ou choisissez une rune pour la remplacer : l’ancienne sera détruite.' : ''}</p>
      ${owned.length ? picks : ''}`;
  } else {
    html = `<p class="rune-sheet-note">Sertir est gratuit. Retirer une rune plus tard la détruit, sauf si vous payez des éclats pour l’extraire.</p>${picks}`;
  }

  // Un seul bloc : la fiche ne se coupe pas en colonnes étroites.
  const sheet = openSheet({ title: current ? 'Rune sertie' : 'Sertir une rune', html: `<div class="rune-sheet-body">${html}</div>`, cls: 'rune-sheet' });
  // La pagination fait tenir la grille : on recalcule la mise en page de la fiche une fois paginée.
  // La grille se pagine elle-même : on garde la fiche sur une colonne, à sa largeur normale.
  sheet.el.classList.remove('is-wide', 'is-xwide', 'is-dense');
  const content = sheet.el.querySelector<HTMLElement>('.ui-sheet__content');
  if (content) sheetColumns(content, 1);
  pageAll(sheet.body);
  const done = (msg: string) => {
    sheet.close();
    toast(msg, 'success');
    onDone();
  };
  sheet.el.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.key as RuneKey;
      const res = socketRune(getInventory(), getCrafting(), uid, slot, key);
      setInventory(res.inventory);
      setCrafting(res.crafting);
      done(`${runeLabel(key)} sertie.${res.destroyed ? ` ${runeLabel(res.destroyed)} détruite.` : ''}`);
    }),
  );
  sheet.el.querySelector('#rune-extract')?.addEventListener('click', () => {
    const res = unsocketRune(getInventory(), getCrafting(), uid, slot, true);
    setInventory(res.inventory);
    setCrafting(res.crafting);
    done(`${runeLabel(current!)} rangée dans le stock.`);
  });
  sheet.el.querySelector('#rune-destroy')?.addEventListener('click', () => {
    const res = unsocketRune(getInventory(), getCrafting(), uid, slot, false);
    setInventory(res.inventory);
    setCrafting(res.crafting);
    done(`${runeLabel(current!)} détruite.`);
  });
}
