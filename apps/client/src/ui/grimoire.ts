/**
 * Grimoire : tous les sorts de la tranche sur une seule page, rangés par élément.
 * Présentation choisie par Kevin (2026-11-11) : une rangée par élément, ses sorts côte à côte,
 * la fiche s'ouvre en panneau au toucher.
 */
import { ELEMENT_IDENTITY, type Element, type SpellDef } from '@chabfu/engine';
import { ELEMENT_LABEL } from '../info';
import { spellIconImg } from './assets';
import { elementIcon, icon } from './icons';

export const GR_ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air', 'neutral'];

export interface GrimoireView {
  spells: SpellDef[];
  deck: Set<string>;
  effLevel: number;
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
