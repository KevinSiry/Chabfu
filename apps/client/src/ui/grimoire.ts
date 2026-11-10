/**
 * Grimoire : tous les sorts de la tranche sur une seule page, rangés par élément.
 * Deux présentations à comparer (choix de Kevin) :
 * - « table » : une rangée par élément, les 4 sorts côte à côte, fiche en panneau au toucher ;
 * - « focus » : un onglet par élément, ses sorts en grandes cartes et la fiche du sort choisi à côté.
 */
import { ELEMENT_IDENTITY, type Element, type RunState, type SpellDef } from '@chabfu/engine';
import { ELEMENT_LABEL, rangeLabel } from '../info';
import { briefEffects } from '../spell-info';
import { spellIconImg } from './assets';
import { elementIcon, icon } from './icons';

export const GR_ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air', 'neutral'];
export type GrimoireLayout = 'table' | 'focus';

export interface GrimoireView {
  spells: SpellDef[];
  deck: Set<string>;
  effLevel: number;
  deckSize: number;
  /** État fictif pour calculer les dégâts réels (null sans donjon). */
  state: RunState | null;
}

export const spellGlyph = (name: string) =>
  name
    .split(/[\s’'-]+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function art(sp: SpellDef, v: GrimoireView): string {
  const locked = sp.level > v.effLevel;
  return `<span class="gr-art grx-art"><span class="grx-glyph">${spellGlyph(sp.name)}</span>${spellIconImg(sp.id)}${
    locked ? `<span class="gr-lock">${icon('lock')}<b>Niv. ${sp.level}</b></span>` : `<span class="lb-cost">${sp.pa}</span>`
  }${v.deck.has(sp.id) ? `<span class="gr-check">${icon('check')}</span>` : ''}</span>`;
}

function byElement(v: GrimoireView, e: Element): SpellDef[] {
  return v.spells.filter((s) => s.element === e).sort((a, b) => a.level - b.level);
}

function deckCount(v: GrimoireView, e: Element): number {
  return byElement(v, e).filter((s) => v.deck.has(s.id)).length;
}

// ---------------------------------------------------------------------------
// Variante A : table des éléments
// ---------------------------------------------------------------------------

export function grimoireTableHtml(v: GrimoireView): string {
  return `<div class="grt">
    ${GR_ELEMENTS.map((e) => {
      const list = byElement(v, e);
      const n = deckCount(v, e);
      return `<div class="grt-row el-theme-${e}">
        <div class="grt-head">
          ${elementIcon(e)}
          <span class="grt-el"><b>${e === 'neutral' ? 'Neutre' : ELEMENT_LABEL[e]}</b><small>${ELEMENT_IDENTITY[e].name}</small></span>
          ${n ? `<i class="grt-n">${n}</i>` : ''}
        </div>
        ${list
          .map(
            (sp) => `<button class="grt-card ${sp.level > v.effLevel ? 'locked' : ''} ${v.deck.has(sp.id) ? 'in' : ''}" data-open="${sp.id}">
          ${art(sp, v)}
          <span class="grt-txt"><b>${sp.name}</b><small>${sp.role}</small></span>
        </button>`,
          )
          .join('')}
      </div>`;
    }).join('')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Variante B : un onglet par élément, fiche intégrée
// ---------------------------------------------------------------------------

export function grimoireFocusHtml(v: GrimoireView, element: Element, selected: string | undefined): string {
  const list = byElement(v, element);
  const sel = list.find((s) => s.id === selected) ?? list[0];
  const tabs = GR_ELEMENTS.map((e) => {
    const n = deckCount(v, e);
    return `<button class="grf-tab el-theme-${e} ${e === element ? 'on' : ''}" data-el="${e}" aria-pressed="${e === element}">
      ${elementIcon(e)}<span>${e === 'neutral' ? 'Neutre' : ELEMENT_LABEL[e]}</span>${n ? `<em>${n}</em>` : ''}
    </button>`;
  }).join('');
  const cards = list
    .map(
      (sp) => `<button class="grf-card ${sp.id === sel?.id ? 'sel' : ''} ${sp.level > v.effLevel ? 'locked' : ''} ${v.deck.has(sp.id) ? 'in' : ''}" data-pick="${sp.id}">
      ${art(sp, v)}
      <span class="grf-name">${sp.name}</span>
      <span class="grf-role">${sp.role}</span>
    </button>`,
    )
    .join('');
  return `<div class="grf el-theme-${element}">
    <div class="grf-tabs">${tabs}</div>
    <div class="grf-body">
      <div class="grf-ident"><b>${ELEMENT_IDENTITY[element].name}</b> ${ELEMENT_IDENTITY[element].text}</div>
      <div class="grf-cards">${cards}</div>
      ${sel ? focusSheet(sel, v) : ''}
    </div>
  </div>`;
}

function focusSheet(sp: SpellDef, v: GrimoireView): string {
  const locked = sp.level > v.effLevel;
  const has = v.deck.has(sp.id);
  const full = v.deck.size >= v.deckSize;
  const effects = v.state ? briefEffects(v.state, sp) : [];
  const action = locked
    ? `<button class="ui-btn ui-btn--block" disabled>${icon('lock')} Niveau ${sp.level}</button>`
    : has
      ? `<button class="ui-btn ui-btn--danger ui-btn--block" data-toggle="${sp.id}">Retirer du deck</button>`
      : `<button class="ui-btn ui-btn--primary ui-btn--block" data-toggle="${sp.id}" ${full ? 'disabled' : ''}>${full ? 'Deck plein' : 'Ajouter au deck'}</button>`;
  return `<aside class="ui-panel grf-sheet">
    <div class="grf-sheet-head"><b>${sp.name}</b><span class="ui-chip">${sp.role}</span></div>
    <div class="grf-stats">
      <span><b>${sp.pa}</b> PA</span>
      <span>${icon('range')} ${rangeLabel(sp.minRange, sp.maxRange).replace('Portée ', '')}</span>
      ${sp.damage !== undefined ? `<span class="grf-dmg"><b>${sp.damage}</b> dégâts</span>` : ''}
      ${sp.maxPerTurn ? `<span>${sp.maxPerTurn}× / tour</span>` : ''}
    </div>
    <p class="grf-desc">${sp.description}</p>
    ${effects.length ? `<ul class="grf-fx">${effects.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    <div class="grf-actions">${action}<button class="ui-btn ui-btn--sm" data-open="${sp.id}">Fiche complète</button></div>
  </aside>`;
}
