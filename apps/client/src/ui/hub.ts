/** Barre de navigation du hub (hors combat) : logo, onglets, plaque du personnage. */
import type { Character } from '@chabfu/engine';
import { characterPlateHtml } from '../character/ui';
import { icon } from './icons';

export type HubTab = 'dungeons' | 'grimoire' | 'equipment' | 'workshop';

const TABS: { id: HubTab; label: string; icon: string }[] = [
  { id: 'dungeons', label: 'Donjons', icon: 'dungeons' },
  { id: 'grimoire', label: 'Grimoire', icon: 'grimoire' },
  { id: 'equipment', label: 'Équipement', icon: 'equipment' },
  { id: 'workshop', label: 'Atelier', icon: 'workshop' },
];

export function hubBarHtml(active: HubTab, c: Character): string {
  return `
    <nav class="hub-bar">
      <div class="hub-logo">Chabfu<small>Prototype</small></div>
      <div class="hub-tabs" role="tablist">
        ${TABS.map((t) => `<button class="hub-tab ${t.id === active ? 'on' : ''}" role="tab" aria-selected="${t.id === active}" data-tab="${t.id}"><span class="hub-tab-icon">${icon(t.icon)}</span>${t.label}</button>`).join('')}
      </div>
      ${characterPlateHtml(c)}
    </nav>`;
}

export function bindHubTabs(root: HTMLElement, go: (tab: HubTab) => void): void {
  root.querySelectorAll<HTMLButtonElement>('.hub-tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab as HubTab)));
}
