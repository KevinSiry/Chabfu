import type { Character, LevelUpReport, RunConfig, RunState, RunSummary } from '@chabfu/engine';

/**
 * Contexte de fin de run, transmis aux sections de l'écran de fin.
 * Les autres systèmes (butin, ressources, craft…) s'y branchent avec `registerRunEndSection`
 * au lieu de modifier l'écran lui-même.
 */
export interface RunEndContext {
  config: RunConfig;
  state: RunState;
  summary: RunSummary;
  report: LevelUpReport;
  /** Personnage après application de l'XP. */
  character: Character;
  /** Run gagné et replay validé. */
  validated: boolean;
}

export interface RunEndSection {
  id: string;
  /** Ordre d'affichage croissant. L'XP est à 0, le butin est prévu à 100. */
  order: number;
  render: (ctx: RunEndContext) => HTMLElement | null;
}

const sections: RunEndSection[] = [];

export function registerRunEndSection(section: RunEndSection): void {
  const i = sections.findIndex((s) => s.id === section.id);
  if (i >= 0) sections.splice(i, 1);
  sections.push(section);
  sections.sort((a, b) => a.order - b.order);
}

export function renderRunEndSections(ctx: RunEndContext): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const s of sections) {
    try {
      const el = s.render(ctx);
      if (el) {
        el.dataset.section = s.id;
        out.push(el);
      }
    } catch (e) {
      console.error(`Section de fin de run « ${s.id} » en erreur`, e);
    }
  }
  return out;
}
