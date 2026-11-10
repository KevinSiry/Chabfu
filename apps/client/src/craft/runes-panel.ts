import {
  RUNES,
  RUNE_GRADES,
  RUNE_GRADE_LABEL,
  canFuse,
  fuseRunes,
  fusionCost,
  fusionMissing,
  fusionResourceOptions,
  getResource,
  runeKey,
  runeLabel,
  runeStock,
  runeEffectText,
  RESOURCE_TIERS,
  type CraftingState,
  type RuneGrade,
  type RuneType,
} from '@chabfu/engine';
import { resourceIconImg, shardIconImg } from '../ui/assets';
import { icon } from '../ui/icons';
import { runeGemHtml } from '../stuff/rune-view';
import { getCrafting, setCrafting } from './store';

let selectedType: RuneType = 'braise';
let selectedTarget: Exclude<RuneGrade, 'brute'> = 'taillee';

/**
 * Onglet « Runes » de l'atelier : stock par type à gauche (une ligne par type, trois niveaux),
 * fiche du type choisi à droite (effets, fusion vers le niveau au-dessus).
 */
export function runesPanelHtml(st: CraftingState, trancheId: number, modeSeg: string, shardsHtml: string): string {
  const total = Object.values(st.runes ?? {}).reduce((a, b) => a + b, 0);
  // Une tuile par type : pierre du meilleur niveau possédé (sinon du plus haut, grisée) et quantité totale.
  const rows = RUNES.map((r) => {
    const grades = RUNE_GRADES.filter((g) => r.values[g] !== null);
    const owned = grades.filter((g) => runeStock(st, runeKey(r.type, g)) > 0);
    const shown = runeKey(r.type, owned[owned.length - 1] ?? grades[grades.length - 1]);
    const n = grades.reduce((a, g) => a + runeStock(st, runeKey(r.type, g)), 0);
    return `<button type="button" class="rn-tile${r.type === selectedType ? ' on' : ''}" data-rtype="${r.type}" aria-label="${r.name}">${runeGemHtml(shown, { count: n, dim: n === 0 })}<span class="rn-name">${r.name.replace('Rune de ', '')}</span></button>`;
  }).join('');

  const def = RUNES.find((r) => r.type === selectedType)!;
  const grades = RUNE_GRADES.filter((g) => def.values[g] !== null);
  const targets = (['taillee', 'parfaite'] as const).filter((g) => fusionCost(def.type, g, trancheId));
  if (!targets.includes(selectedTarget)) selectedTarget = targets[0] ?? 'taillee';
  const cost = targets.length ? fusionCost(def.type, selectedTarget, trancheId) : null;

  const effects = grades
    .map((g) => {
      const k = runeKey(def.type, g);
      return `<li>${runeGemHtml(k, { size: 'sm' })}<span><b>${RUNE_GRADE_LABEL[g]}</b> ${runeEffectText(k)}</span><em>×${runeStock(st, k)}</em></li>`;
    })
    .join('');

  let fusion = `<p class="rn-note">${def.unique ? 'Rune unique : une seule compte sur tout l’équipement porté. ' : ''}Ne se fusionne pas : elle se trouve uniquement sur les boss en difficulté 9 et 10.</p>`;
  if (cost) {
    const miss = fusionMissing(st, cost);
    const ok = canFuse(st, cost);
    const res = fusionResourceOptions(st, cost)[0];
    const shards = st.shards[trancheId] ?? 0;
    const line = (img: string, name: string, have: number, need: number, missing: boolean, tier: string) =>
      `<li class="ws-cost${missing ? ' miss' : ''} tier-${tier}">${img}<span class="ws-cost-name">${name}</span><b>${have}<small>/${need}</small></b><i style="width:${Math.min(100, (100 * have) / need)}%"></i></li>`;
    fusion = `
      ${
        targets.length > 1
          ? `<div class="ws-rar rn-targets">${targets.map((g) => `<button type="button" class="${g === selectedTarget ? 'on' : ''}" data-rtarget="${g}">${RUNE_GRADE_LABEL[g]}</button>`).join('')}</div>`
          : ''
      }
      <div class="rn-fuse">
        ${runeGemHtml(cost.from, { count: 3 })}<span class="rn-arrow">${icon('arrowRight')}</span>${runeGemHtml(cost.to, { size: 'lg' })}
      </div>
      <ul class="rn-cost">
        ${line(runeGemHtml(cost.from, { size: 'sm' }), runeLabel(cost.from), runeStock(st, cost.from), cost.count, miss.runes > 0, 'rune')}
        ${line(shardIconImg(), 'Éclats', shards, cost.shards, miss.shards > 0, 'shard')}
        ${line(res ? resourceIconImg(res.id) : '', res ? getResource(res.id).name : `Ressource ${RESOURCE_TIERS[cost.tier].label.toLowerCase()} (D${RESOURCE_TIERS[cost.tier].minRef}+)`, res?.have ?? 0, cost.resources, miss.resources > 0, cost.tier)}
      </ul>
      <button class="ui-btn ${ok ? 'ui-btn--primary' : ''} ui-btn--block ws-go" id="rn-fuse" ${ok ? '' : 'disabled'}>${icon('sparkle')} ${ok ? 'Fusionner' : 'Il manque des ingrédients'}</button>`;
  }

  return `
    <aside class="ui-panel ws-list rn-list">
      ${modeSeg}
      <div class="rn-tiles">${rows}</div>
      <p class="rn-total">${total} rune${total > 1 ? 's' : ''} en stock</p>
    </aside>
    <section class="ui-panel ws-detail rn-detail">
      ${shardsHtml}
      <div class="ws-d-head rune-${def.type}">
        ${runeGemHtml(runeKey(def.type, grades[grades.length - 1]), { size: 'lg' })}
        <div class="ws-d-title"><b>${def.name}</b><span>Se sertit dans un objet Inhabituel ou mieux${def.unique ? ' · une seule compte' : ''}</span></div>
      </div>
      <div class="ws-d-body rn-body">
        <section><h4>Effet par niveau</h4><ul class="rn-effects">${effects}</ul>
          <p class="rn-note rn-howto">Obtention : boss (Brute D4+, Taillée D6+, Parfaite D9+), ou briser un objet Rare ou mieux dans « Recycler ».</p></section>
        <section><h4>Fusion</h4>${fusion}</section>
      </div>
    </section>`;
}

export function bindRunesPanel(app: HTMLElement, trancheId: number, rerender: (flash?: string) => void): void {
  app.querySelectorAll<HTMLButtonElement>('[data-rtype]').forEach((b) =>
    b.addEventListener('click', () => {
      selectedType = b.dataset.rtype as RuneType;
      rerender();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-rtarget]').forEach((b) =>
    b.addEventListener('click', () => {
      selectedTarget = b.dataset.rtarget as Exclude<RuneGrade, 'brute'>;
      rerender();
    }),
  );
  app.querySelector('#rn-fuse')?.addEventListener('click', () => {
    const cost = fusionCost(selectedType, selectedTarget, trancheId);
    if (!cost) return;
    setCrafting(fuseRunes(getCrafting(), selectedType, selectedTarget, trancheId));
    rerender(`${runeLabel(cost.to)} obtenue.`);
  });
}
