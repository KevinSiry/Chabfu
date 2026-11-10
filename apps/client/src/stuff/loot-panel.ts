import { equipItem, getDungeon, type ItemInstance, type RunConfig } from '@chabfu/engine';
import { itemCardHtml } from './item-view';
import { getInventory, setInventory } from './store';
import './stuff.css';
import { pageAll, pagerHtml } from '../ui/pager';

/** Bloc « Butin » de l'écran de fin de run : les objets apparaissent un par un, avec la comparaison à l'équipé. */
export function lootPanelHtml(loot: ItemInstance[], config: RunConfig): string {
  const trancheId = getDungeon(config.dungeonId).tranche;
  const inv = getInventory();
  return `
    <div class="loot" data-pager-scope>
      <h3>Butin du boss <span class="muted">${loot.length} objet${loot.length > 1 ? 's' : ''}</span>${pagerHtml('end-loot')}</h3>
      <div class="loot-list" data-paged="end-loot">
        ${loot
          .map((item, i) =>
            itemCardHtml(item, {
              inv,
              trancheId,
              compare: true,
              action: { label: 'Équiper', name: 'loot-equip' },
              extraClass: 'reveal',
              style: `animation-delay:${200 + i * 350}ms`,
            }),
          )
          .join('')}
      </div>
    </div>`;
}

/** Branche les boutons « Équiper » du bloc de butin ; `refresh` redessine le bloc. */
export function bindLootPanel(root: HTMLElement, loot: ItemInstance[], config: RunConfig): void {
  const trancheId = getDungeon(config.dungeonId).tranche;
  root.querySelectorAll<HTMLButtonElement>('[data-action="loot-equip"]').forEach((b) =>
    b.addEventListener('click', () => {
      setInventory(equipItem(getInventory(), trancheId, b.dataset.uid!));
      const holder = root.querySelector('.loot');
      if (!holder) return;
      holder.outerHTML = lootPanelHtml(loot, config);
      root.querySelectorAll('.loot .reveal').forEach((el) => el.classList.remove('reveal'));
      pageAll(root.querySelector('.loot')!);
      bindLootPanel(root, loot, config);
    }),
  );
}
