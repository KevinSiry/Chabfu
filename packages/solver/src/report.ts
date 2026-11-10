/** Rapport Markdown lisible à partir des résultats du solveur. */
import { getDungeon, getSpell } from '@chabfu/engine';
import { estimateDurationSeconds, type SolveResult } from './solver.js';

export interface JobResult extends SolveResult {
  profile: string;
  deckName: string;
  stuffName: string;
  noWalk: boolean;
}

/** Cibles du GDD : runs de 1 à 3 minutes une fois maîtrisés. */
export const TARGET_MIN_SECONDS = 60;
export const TARGET_MAX_SECONDS = 180;

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} min ${String(s).padStart(2, '0')}`;
}

function spellName(id: string): string {
  try {
    return getSpell(id).name;
  } catch {
    return id;
  }
}

function pct(n: number, d: number): string {
  return d ? `${Math.round((100 * n) / d)} %` : '-';
}

export function buildReport(results: JobResult[], meta: { options: string; decks: Record<string, string[]> }): string {
  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  out('# Rapport d’équilibrage par bot');
  out();
  out(`Généré le ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Options : ${meta.options}.`);
  out();
  out('Le bot cherche, pour chaque donjon, difficulté et deck, la route qui finit en un minimum de tours');
  out('(recherche en faisceau sur le moteur, deux profils : agressif et prudent). Une victoire prouve que le');
  out('donjon est finissable ; une défaite veut seulement dire que le bot n’a pas trouvé de route, pas qu’il');
  out('n’en existe aucune. La durée est estimée à 2,5 s par action du joueur et 1,5 s par tour des monstres.');
  out();
  out('## Decks testés');
  out();
  for (const [name, deck] of Object.entries(meta.decks)) out(`- **${name}** : ${deck.map(spellName).join(', ')}`);
  out();

  const main = results.filter((r) => !r.noWalk);
  const dungeons = [...new Set(main.map((r) => r.config.dungeonId))];
  for (const dungeonId of dungeons) {
    const dungeon = getDungeon(dungeonId);
    const rows = main.filter((r) => r.config.dungeonId === dungeonId);
    out(`## ${dungeon.name}`);
    out();
    out(`Tranche T${dungeon.tranche}, ${dungeon.rooms.length} salles, dominante ${dungeon.dominantElement}.`);
    out();

    const allRows = rows;
    const stuffs = [...new Set(allRows.map((r) => r.stuffName))];
    for (const stuffName of stuffs) {
      const rows = allRows.filter((r) => r.stuffName === stuffName);
      const sfx = stuffs.length > 1 || stuffName !== 'aucun' ? ` (stuff ${stuffName})` : '';
      // Meilleur deck par difficulté.
      const difficulties = [...new Set(rows.map((r) => r.config.difficulty))].sort((a, b) => a - b);
      out(`### Meilleure route par difficulté${sfx}`);
      out();
      out('| Difficulté | Résultat | Tours | Actions | Durée estimée | PV restants | PV au plus bas | Deck | Profil |');
      out('|---|---|---|---|---|---|---|---|---|');
      const bestByDiff = new Map<number, JobResult>();
      for (const d of difficulties) {
        const candidates = rows.filter((r) => r.config.difficulty === d);
        const best = candidates.sort(byQuality)[0];
        bestByDiff.set(d, best);
        const dur = estimateDurationSeconds(best);
        const flag = best.won ? (dur > TARGET_MAX_SECONDS ? ' (trop long)' : dur < TARGET_MIN_SECONDS ? ' (trop court)' : '') : '';
        out(
          `| ${d} | ${best.won ? 'Victoire' : `Échec (salle ${best.roomReached + 1})`} | ${best.turns} | ${best.stats.playerActions} | ${fmtDuration(dur)}${flag} | ${best.hpLeft}/${best.maxHp} | ${best.minHp} | ${best.deckName} | ${best.profile} |`,
        );
      }
      out();

      // Tous les decks.
      const deckNames = [...new Set(rows.map((r) => r.deckName))];
      if (deckNames.length > 1) {
        out(`### Tours par deck${sfx}`);
        out();
        out(`| Deck | ${difficulties.map((d) => `D${d}`).join(' | ')} |`);
        out(`|---|${difficulties.map(() => '---').join('|')}|`);
        for (const name of deckNames) {
          const cells = difficulties.map((d) => {
            const r = rows.find((x) => x.deckName === name && x.config.difficulty === d);
            if (!r) return '-';
            return r.won ? `${r.turns}` : '✗';
          });
          out(`| ${name} | ${cells.join(' | ')} |`);
        }
        out();
        out('✗ : pas de victoire trouvée.');
        out();
      }

      // Concentration et mobilité.
      out(`### Concentration et mobilité${sfx}`);
      out();
      out('| Difficulté | Cases marchées | Tours sans marcher | Concentration max | Tirs concentrés | Sorts les plus lancés |');
      out('|---|---|---|---|---|---|');
      for (const [d, r] of bestByDiff) {
        const totalTurns = r.stats.damageTakenPerTurn.length + 1;
        const top = Object.entries(r.stats.casts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id, n]) => `${spellName(id)} ×${n}`)
          .join(', ');
        out(
          `| ${d} | ${r.stats.cellsWalked} | ${r.stats.turnsStill}/${totalTurns} (${pct(r.stats.turnsStill, totalTurns)}) | ${r.stats.concentrationMax} | ${r.stats.casts['tir_concentre'] ?? 0} | ${top} |`,
        );
      }
      out();

      const still = results.filter((r) => r.noWalk && r.stuffName === stuffName && r.config.dungeonId === dungeonId);
      if (still.length) {
        out(`### Archer immobile, sans marcher${sfx}`);
        out();
        out('| Difficulté | Deck | Résultat | Tours | PV restants |');
        out('|---|---|---|---|---|');
        for (const r of still.sort((a, b) => a.config.difficulty - b.config.difficulty)) {
          out(`| ${r.config.difficulty} | ${r.deckName} | ${r.won ? 'Victoire' : `Échec (salle ${r.roomReached + 1})`} | ${r.turns} | ${r.hpLeft}/${r.maxHp} |`);
        }
        out();
      }

      out(`### Diagnostic${sfx}`);
      out();
      for (const line of diagnose(bestByDiff, still)) out(`- ${line}`);
      out();
    }
  }
  return lines.join('\n');
}

export function byQuality(a: SolveResult, b: SolveResult): number {
  if (a.won !== b.won) return a.won ? -1 : 1;
  if (a.won) return a.turns - b.turns || b.hpLeft - a.hpLeft;
  return b.roomReached - a.roomReached || a.monstersHpLeft - b.monstersHpLeft;
}

function diagnose(best: Map<number, JobResult>, still: JobResult[]): string[] {
  const notes: string[] = [];
  const entries = [...best.entries()].sort((a, b) => a[0] - b[0]);
  const won = entries.filter(([, r]) => r.won);
  const lost = entries.filter(([, r]) => !r.won);
  if (lost.length) notes.push(`Pas de victoire trouvée en difficulté ${lost.map(([d]) => d).join(', ')}.`);
  else notes.push('Victoire trouvée à toutes les difficultés testées.');
  if (won.length) {
    const [dMin, rMin] = won[0];
    const [dMax, rMax] = won[won.length - 1];
    const durMin = estimateDurationSeconds(rMin);
    const durMax = estimateDurationSeconds(rMax);
    notes.push(`Durée estimée : ${fmtDuration(durMin)} en D${dMin}, ${fmtDuration(durMax)} en D${dMax} (cible ${TARGET_MIN_SECONDS / 60} à ${TARGET_MAX_SECONDS / 60} min).`);
    if (durMin > TARGET_MAX_SECONDS) {
      const factor = TARGET_MAX_SECONDS / durMin;
      notes.push(`Trop long dès D${dMin} : il faudrait environ ${Math.round((1 - factor) * 100)} % de tours en moins (PV des monstres plus bas ou dégâts de l’Archer plus hauts).`);
    }
    const hpLoss = 1 - rMax.minHp / rMax.maxHp;
    if (rMax.minHp / rMax.maxHp > 0.5) notes.push(`En D${dMax}, l’Archer ne descend pas sous ${rMax.minHp}/${rMax.maxHp} PV : la difficulté ne met pas assez de pression (pertes ${Math.round(hpLoss * 100)} %).`);
    const stillShare = rMin.stats.turnsStill / (rMin.stats.damageTakenPerTurn.length + 1);
    if (stillShare < 0.3) notes.push(`La meilleure route marche presque à chaque tour (${pct(rMin.stats.turnsStill, rMin.stats.damageTakenPerTurn.length + 1)} des tours sans marcher en D${dMin}) : rester en place pour charger la Concentration ne paie pas assez.`);
  }
  const stillWins = still.filter((r) => r.won);
  if (still.length && stillWins.length === 0) notes.push('Sans marcher, le bot ne gagne à aucune des difficultés testées : la mobilité est obligatoire.');
  if (still.length && stillWins.length === still.length) notes.push('Le bot gagne même sans marcher : reculer n’est pas nécessaire, la tension Concentration/mobilité est faible.');
  return notes;
}
