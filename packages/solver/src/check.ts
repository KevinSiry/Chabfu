/**
 * Vérification des cibles d'équilibrage fixées par Kevin (2026-11-10) :
 * - début de partie (niveau 1, sans stuff) : D1 gagnable ;
 * - sans stuff : D3 gagnable, D5 perdue (D4 est la zone grise : selon le donjon et le joueur) ;
 * - D10 : perdue avec un stuff faible, gagnée avec un stuff fort (presque parfait) mais avec peu de marge.
 *   Les stuffs sont des totaux de stats (stuff.ts), pas des raretés.
 * - toute victoire en moins de 3 minutes (estimation).
 *
 * « Perdue » veut dire que le bot ne trouve aucune victoire, quel que soit le deck testé.
 */
import { estimateDurationSeconds } from './solver.js';
import type { JobResult } from './report.js';
import { TARGET_MAX_SECONDS } from './report.js';

export interface CheckTarget {
  id: string;
  label: string;
  level?: number;
  stuff: string;
  difficulty: number;
  expect: 'win' | 'lose';
  /** Pour une victoire attendue « serrée » : PV au plus bas / PV max à ne pas dépasser. */
  maxMinHpRatio?: number;
}

export const CHECK_TARGETS: CheckTarget[] = [
  { id: 'debut', label: 'Niveau 1 sans stuff, D1', level: 1, stuff: 'aucun', difficulty: 1, expect: 'win' },
  { id: 'nu-d3', label: 'Sans stuff, D3', stuff: 'aucun', difficulty: 3, expect: 'win' },
  { id: 'nu-d5', label: 'Sans stuff, D5', stuff: 'aucun', difficulty: 5, expect: 'lose' },
  { id: 'faible-d10', label: 'Stuff faible, D10', stuff: 'faible', difficulty: 10, expect: 'lose' },
  { id: 'fort-d10', label: 'Stuff fort, D10 (serré)', stuff: 'fort', difficulty: 10, expect: 'win', maxMinHpRatio: 0.35 },
];

export interface CheckOutcome {
  dungeonId: string;
  target: CheckTarget;
  ok: boolean;
  detail: string;
}

export function evaluateChecks(results: JobResult[]): CheckOutcome[] {
  const out: CheckOutcome[] = [];
  const dungeons = [...new Set(results.filter((r) => r.checkId).map((r) => r.config.dungeonId))];
  for (const dungeonId of dungeons) {
    for (const target of CHECK_TARGETS) {
      const rows = results.filter((r) => r.checkId === target.id && r.config.dungeonId === dungeonId);
      if (!rows.length) continue;
      const wins = rows.filter((r) => r.won).sort((a, b) => a.turns - b.turns);
      if (target.expect === 'lose') {
        const ok = wins.length === 0;
        out.push({
          dungeonId,
          target,
          ok,
          detail: ok ? `aucune victoire (${rows.length} decks)` : `gagné en ${wins[0].turns} tours avec ${wins[0].deckName}, ${wins[0].hpLeft}/${wins[0].maxHp} PV`,
        });
        continue;
      }
      if (!wins.length) {
        const best = rows.sort((a, b) => b.roomReached - a.roomReached || a.monstersHpLeft - b.monstersHpLeft)[0];
        out.push({ dungeonId, target, ok: false, detail: `aucune victoire (au mieux salle ${best.roomReached + 1})` });
        continue;
      }
      const best = wins[0];
      const dur = estimateDurationSeconds(best);
      const problems: string[] = [];
      if (dur > TARGET_MAX_SECONDS) problems.push(`trop long (~${dur} s)`);
      // Serré : même la route la plus prudente trouvée doit finir bas.
      const safest = wins.reduce((a, b) => (b.minHp > a.minHp ? b : a));
      if (target.maxMinHpRatio !== undefined && safest.minHp / safest.maxHp > target.maxMinHpRatio) {
        problems.push(`trop de marge (${safest.minHp}/${safest.maxHp} PV au plus bas)`);
      }
      out.push({
        dungeonId,
        target,
        ok: problems.length === 0,
        detail: `${best.turns} tours, ~${dur} s, ${best.hpLeft}/${best.maxHp} PV${problems.length ? ` : ${problems.join(', ')}` : ''}`,
      });
    }
  }
  return out;
}

export function checkReport(outcomes: CheckOutcome[], dungeonName: (id: string) => string): string {
  const lines = ['## Vérification des cibles', '', '| Donjon | Cible | Attendu | Résultat | |', '|---|---|---|---|---|'];
  for (const o of outcomes) {
    lines.push(`| ${dungeonName(o.dungeonId)} | ${o.target.label} | ${o.target.expect === 'win' ? 'victoire' : 'défaite'} | ${o.detail} | ${o.ok ? '✅' : '❌'} |`);
  }
  const ok = outcomes.filter((o) => o.ok).length;
  lines.push('', `${ok}/${outcomes.length} cibles atteintes.`, '');
  return lines.join('\n');
}
