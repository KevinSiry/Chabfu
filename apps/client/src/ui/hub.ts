/** Barre de navigation du hub (hors combat) : logo, onglets, plaque du personnage. */
import type { Character } from '@chabfu/engine';
import { characterPlateHtml } from '../character/ui';
import { icon } from './icons';
import { openSettings } from './settings-screen';

export type HubTab = 'dungeons' | 'grimoire' | 'equipment' | 'workshop';

const TABS: { id: HubTab; label: string; icon: string }[] = [
  { id: 'dungeons', label: 'Donjons', icon: 'dungeons' },
  { id: 'grimoire', label: 'Grimoire', icon: 'grimoire' },
  { id: 'equipment', label: 'Équipement', icon: 'equipment' },
  { id: 'workshop', label: 'Atelier', icon: 'workshop' },
];

/**
 * Coquille « jeu mobile », identique sur téléphone, tablette et ordinateur :
 * plaque du personnage en haut, grands onglets illustrés en bas.
 */
export function hubBarHtml(active: HubTab, c: Character): string {
  return `
    <header class="hb-top">
      ${characterPlateHtml(c)}
      <div class="hb-title"><span>${TABS.find((t) => t.id === active)?.label ?? ''}</span></div>
      <div class="hb-right"><div class="hb-logo">Chabfu</div><button class="ui-icon-btn hb-gear" id="open-settings" aria-label="Paramètres">${icon('settings')}</button></div>
    </header>
    <nav class="hb-tabs hub-tabs" role="tablist">
      ${TABS.map((t) => `<button class="hub-tab ${t.id === active ? 'on' : ''}" role="tab" aria-selected="${t.id === active}" data-tab="${t.id}"><span class="hub-tab-icon">${icon(t.icon)}</span><span class="hub-tab-label">${t.label}</span></button>`).join('')}
    </nav>`;
}

export function bindHubTabs(root: HTMLElement, go: (tab: HubTab) => void): void {
  root.querySelectorAll<HTMLButtonElement>('.hub-tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab as HubTab)));
  root.querySelector('#open-settings')?.addEventListener('click', () => openSettings());
}
