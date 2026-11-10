/**
 * Outil en ligne de commande du solveur d'équilibrage.
 *
 *   npm run solve -- [options]
 *
 * Options :
 *   --dungeon <id[,id]>   Donjons à tester (défaut : tous ceux du moteur).
 *   --difficulty <liste>  Ex. "1-10", "1,5,10" (défaut : 1-10).
 *   --deck <nom|sorts>    Nom d'un deck prédéfini, ou liste d'identifiants de sorts séparés par des virgules.
 *                         Répétable. Défaut : les decks prédéfinis.
 *   --all-decks           Tous les decks possibles de la tranche (long).
 *   --stuff <liste>       Panoplie complète de la tranche par rareté : aucun, commun, inhabituel, rare,
 *                         mythique, legendaire. Ex. "aucun,rare,mythique" (défaut : aucun).
 *   --set <réglage>       Essaie une valeur sans modifier le code (répétable), ex. monster.*.hp=x0.7,
 *                         spell.tir_concentre.concentrationCost=3. Voir overrides.ts.
 *   --beam <n>            Largeur du faisceau (défaut 48). --quick équivaut à --beam 16.
 *   --no-walk             Ajoute une passe « Archer immobile » (sans marcher) pour mesurer la tension de la Concentration.
 *   --jobs <n>            Calculs en parallèle (défaut : nombre de cœurs - 1).
 *   --out <dossier>       Dossier du rapport (défaut : reports). Écrit equilibrage.md, resultats.json et les routes.
 */
import { availableCpus, runJobs, type Job } from './pool.js';
import { DUNGEONS, getTranche, availableSpells, effectiveLevel } from '@chabfu/engine';
import { buildReport, byQuality, type JobResult } from './report.js';
import { fullSetBonus } from './stuff.js';
import { DEFAULT_OPTIONS, estimateDurationSeconds } from './solver.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMainThread } from 'node:worker_threads';

/** Decks de référence T1 (niveau 20, 5 sorts). */
export const PRESET_DECKS: Record<string, string[]> = {
  'feu-poussee': ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'],
  'multi-element': ['fleche_ardente', 'fleche_givree', 'fleche_du_vent', 'pluie_de_fleches', 'fleche_fracassante'],
  concentration: ['fleche_ardente', 'tir_concentre', 'fleche_givree', 'fleche_du_vent', 'bond_arriere'],
};

function parseArgs(argv: string[]) {
  const args = {
    dungeons: [] as string[],
    difficulties: [] as number[],
    decks: [] as string[],
    allDecks: false,
    stuffs: ['aucun'] as string[],
    overrides: [] as string[],
    beam: DEFAULT_OPTIONS.beamWidth,
    noWalk: false,
    jobs: Math.max(1, availableCpus() - 1),
    out: 'reports',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Valeur manquante après ${a}`);
      return v;
    };
    if (a === '--dungeon') args.dungeons.push(...next().split(','));
    else if (a === '--difficulty') args.difficulties = parseRange(next());
    else if (a === '--deck') args.decks.push(next());
    else if (a === '--set') args.overrides.push(next());
    else if (a === '--stuff') args.stuffs = next().split(',');
    else if (a === '--all-decks') args.allDecks = true;
    else if (a === '--beam') args.beam = Number(next());
    else if (a === '--quick') args.beam = 16;
    else if (a === '--no-walk') args.noWalk = true;
    else if (a === '--jobs') args.jobs = Number(next());
    else if (a === '--out') args.out = next();
    else if (a === '--help' || a === '-h') {
      console.log('Voir l’en-tête de packages/solver/src/cli.ts pour la liste des options.');
      process.exit(0);
    } else throw new Error(`Option inconnue : ${a}`);
  }
  if (!args.difficulties.length) args.difficulties = parseRange('1-10');
  if (!args.dungeons.length) args.dungeons = DUNGEONS.map((d) => d.id);
  return args;
}

function parseRange(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let d = a; d <= (b ?? a); d++) out.push(d);
  }
  return out;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

function decksFor(dungeonTranche: number, args: ReturnType<typeof parseArgs>): Record<string, string[]> {
  const tranche = getTranche(dungeonTranche);
  if (args.allDecks) {
    const spells = availableSpells(effectiveLevel(tranche.redefinitionLevel, tranche.id)).map((s) => s.id);
    return Object.fromEntries(combinations(spells, tranche.deckSize).map((d) => [d.join('+'), d]));
  }
  if (!args.decks.length) return PRESET_DECKS;
  return Object.fromEntries(args.decks.map((d) => [d, PRESET_DECKS[d] ?? d.split(',')]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobs: Job[] = [];
  const allDecks: Record<string, string[]> = {};
  for (const dungeonId of args.dungeons) {
    const dungeon = DUNGEONS.find((d) => d.id === dungeonId);
    if (!dungeon) throw new Error(`Donjon inconnu : ${dungeonId}`);
    const decks = decksFor(dungeon.tranche, args);
    Object.assign(allDecks, decks);
    for (const stuffName of args.stuffs) {
      const equipment = fullSetBonus(dungeon.tranche, stuffName);
      for (const [deckName, deck] of Object.entries(decks)) {
        for (const difficulty of args.difficulties) {
          jobs.push({ config: { dungeonId, difficulty, deck, equipment }, deckName, stuffName, noWalk: false, options: { beamWidth: args.beam }, overrides: args.overrides });
        }
      }
      if (args.noWalk) {
        const [deckName, deck] = Object.entries(decks)[0];
        for (const difficulty of args.difficulties) {
          jobs.push({ config: { dungeonId, difficulty, deck, equipment }, deckName, stuffName, noWalk: true, options: { beamWidth: args.beam, noWalk: true }, overrides: args.overrides });
        }
      }
    }
  }

  console.log(`${jobs.length} calculs, ${args.jobs} en parallèle, faisceau ${args.beam}.`);
  const t0 = Date.now();
  const results: JobResult[] = await runJobs(jobs, args.jobs, (r, done) => {
    const dur = estimateDurationSeconds(r);
    console.log(
      `[${done}/${jobs.length}] ${r.config.dungeonId} D${r.config.difficulty} ${r.deckName} stuff ${r.stuffName}${r.noWalk ? ' (immobile)' : ''} : ` +
        (r.won ? `victoire en ${r.turns} tours, ${r.hpLeft}/${r.maxHp} PV, ~${dur} s` : `échec (salle ${r.roomReached + 1})`) +
        ` [${(r.elapsedMs / 1000).toFixed(1)} s]`,
    );
  });
  console.log(`Terminé en ${((Date.now() - t0) / 1000).toFixed(0)} s.`);

  mkdirSync(join(args.out, 'routes'), { recursive: true });
  const options = `faisceau ${args.beam}, difficultés ${args.difficulties.join(',')}, stuff ${args.stuffs.join(',')}${args.noWalk ? ', passe immobile' : ''}${args.overrides.length ? `, réglages : ${args.overrides.join(' ')}` : ''}`;
  writeFileSync(join(args.out, 'equilibrage.md'), buildReport(results, { options, decks: allDecks }));
  writeFileSync(join(args.out, 'resultats.json'), JSON.stringify(results.map(({ actions, ...rest }) => rest), null, 2));
  // Une route rejouable (verifyRun) par donjon et difficulté : la meilleure trouvée.
  for (const dungeonId of args.dungeons) {
    for (const stuffName of args.stuffs) {
      for (const d of args.difficulties) {
        const best = results
          .filter((r) => !r.noWalk && r.won && r.stuffName === stuffName && r.config.dungeonId === dungeonId && r.config.difficulty === d)
          .sort(byQuality)[0];
        if (best) {
          const file = join(args.out, 'routes', `${dungeonId}-${stuffName}-d${d}.json`);
          writeFileSync(file, JSON.stringify({ config: best.config, turns: best.turns, actions: best.actions }));
        }
      }
    }
  }
  console.log(`Rapport : ${join(args.out, 'equilibrage.md')}`);
}

if (isMainThread) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
