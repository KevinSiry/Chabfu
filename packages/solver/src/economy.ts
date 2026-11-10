/**
 * Simulation de l'économie du stuff : combien de runs gagnés faut-il pour une panoplie complète ?
 *
 * Joueur modèle : il farme un seul donjon (le Bosquet, seule panoplie qui couvre les 9 emplacements)
 * à une difficulté fixe et gagne chaque run. Il garde le premier objet de chaque emplacement à la rareté visée
 * ou mieux, recycle tout le reste en éclats, et fabrique à l'atelier dès qu'une recette de la rareté visée
 * (ou mieux) est payable pour un emplacement encore vide. Moyenne sur plusieurs graines.
 */
import {
  addResources,
  addRunes,
  breakResult,
  canFuse,
  createCraftingState,
  fuseRunes,
  fusionCost,
  rollRuneDrops,
  type CraftingState,
  type RuneKey,
  type RuneType,
  RARITY_ORDER,
  RECIPES,
  SHARDS_BY_RARITY,
  getItem,
  rollBossLoot,
  rollResourceDrops,
  seededRandom,
  type Rarity,
  type Recipe,
} from '@chabfu/engine';

/** Nombre d'objets voulus par famille (deux anneaux). */
const NEEDED: Record<string, number> = { arc: 1, carquois: 1, coiffe: 1, cape: 1, plastron: 1, bottes: 1, amulette: 1, anneau: 2 };

export interface EconomyResult {
  dungeonId: string;
  difficulty: number;
  target: Rarity;
  craft: boolean;
  /** Runs moyens (moyenne sur les graines), ou null si la panoplie n'est jamais complétée dans la limite. */
  meanRuns: number | null;
  /** Médiane. */
  medianRuns: number | null;
  /** Part des objets de la panoplie obtenus par l'atelier. */
  craftShare: number;
}

const atLeast = (r: Rarity, target: Rarity) => RARITY_ORDER.indexOf(r) >= RARITY_ORDER.indexOf(target);

export function runsForFullSet(
  dungeonId: string,
  difficulty: number,
  target: Rarity,
  opts: { craft?: boolean; seeds?: number; maxRuns?: number } = {},
): EconomyResult {
  const craft = opts.craft ?? true;
  const seeds = opts.seeds ?? 200;
  const maxRuns = opts.maxRuns ?? 2000;
  const recipes = RECIPES.filter((r) => r.dungeonId === dungeonId && atLeast(r.rarity, target)).sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
  );
  const runs: number[] = [];
  let crafted = 0;
  let total = 0;
  for (let s = 0; s < seeds; s++) {
    const rng = seededRandom(0x9e3779b9 ^ (s * 7919 + difficulty * 104729));
    const have: Record<string, number> = {};
    const res: Record<string, number> = {};
    let shards = 0;
    const missing = () => Object.entries(NEEDED).some(([k, n]) => (have[k] ?? 0) < n);
    let n = 0;
    while (missing() && n < maxRuns) {
      n++;
      for (const d of rollBossLoot(dungeonId, difficulty, Math.floor(rng() * 2 ** 32))) {
        const kind = getItem(d.itemId).kind;
        if (atLeast(d.rarity, target) && (have[kind] ?? 0) < NEEDED[kind]) {
          have[kind] = (have[kind] ?? 0) + 1;
          total++;
        } else shards += SHARDS_BY_RARITY[d.rarity];
      }
      for (const [id, q] of Object.entries(rollResourceDrops(dungeonId, difficulty, Math.floor(rng() * 2 ** 32))))
        res[id] = (res[id] ?? 0) + q;
      if (!craft) continue;
      let again = true;
      while (again) {
        again = false;
        for (const r of recipes) {
          const kind = getItem(r.itemId).kind;
          if ((have[kind] ?? 0) >= NEEDED[kind] || !payable(r, res, shards)) continue;
          for (const [id, q] of Object.entries(r.resources)) res[id] -= q;
          shards -= r.shards;
          have[kind] = (have[kind] ?? 0) + 1;
          crafted++;
          total++;
          again = true;
          break;
        }
      }
    }
    runs.push(missing() ? Infinity : n);
  }
  const ok = runs.filter(Number.isFinite);
  const sorted = [...runs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    dungeonId,
    difficulty,
    target,
    craft,
    meanRuns: ok.length === runs.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null,
    medianRuns: Number.isFinite(median) ? median : null,
    craftShare: total ? crafted / total : 0,
  };
}

function payable(r: Recipe, res: Record<string, number>, shards: number): boolean {
  if (shards < r.shards) return false;
  return Object.entries(r.resources).every(([id, q]) => (res[id] ?? 0) >= q);
}

// ---------------------------------------------------------------------------
// Runes
// ---------------------------------------------------------------------------

/**
 * Jeu de runes de référence du « stuff parfait » (panoplie Mythique : 18 emplacements) :
 * Mire et Focus, puis des Parfaites de maîtrise, de Pointe et de Sève. C'est aussi celui du solveur.
 */
export const PERFECT_RUNE_SET: Partial<Record<RuneType, number>> = { mire: 1, focus: 1, pointe: 2, braise: 8, seve: 3, rempart: 3 };

export interface RuneEconomyResult {
  dungeonId: string;
  difficulty: number;
  /** Runs avant la première rune (drop ou bris). */
  firstRune: number | null;
  /** Runs pour 18 runes Taillées ou mieux, de n'importe quel type. */
  eighteenCut: number | null;
  /** Runs pour le jeu parfait (PERFECT_RUNE_SET en Parfaite). */
  perfectSet: number | null;
}

/**
 * Joueur modèle déjà équipé : il farme un donjon pour ses runes. Il brise tous les objets Rares ou mieux
 * (des doublons), recycle les autres en éclats, et fusionne dès que possible les types dont il a besoin.
 */
export function runsForRunes(dungeonId: string, difficulty: number, opts: { seeds?: number; maxRuns?: number } = {}): RuneEconomyResult {
  const seeds = opts.seeds ?? 100;
  const maxRuns = opts.maxRuns ?? 3000;
  const first: number[] = [];
  const cut: number[] = [];
  const perfect: number[] = [];
  const need = PERFECT_RUNE_SET;
  for (let s = 0; s < seeds; s++) {
    const rng = seededRandom(0x51ed270b ^ (s * 7919 + difficulty * 104729));
    let st: CraftingState = createCraftingState();
    let f = Infinity;
    let c = Infinity;
    let p = Infinity;
    for (let n = 1; n <= maxRuns && p === Infinity; n++) {
      const gained: RuneKey[] = rollRuneDrops(difficulty, Math.floor(rng() * 2 ** 32));
      let shards = 0;
      for (const d of rollBossLoot(dungeonId, difficulty, Math.floor(rng() * 2 ** 32))) {
        const r = breakResult(d);
        if (r) gained.push(r);
        else shards += SHARDS_BY_RARITY[d.rarity];
      }
      st = addRunes(addResources({ ...st, shards: { 1: (st.shards[1] ?? 0) + shards } }, rollResourceDrops(dungeonId, difficulty, Math.floor(rng() * 2 ** 32))), gained);
      // Fusions : d'abord vers Parfaite, puis vers Taillée, pour les types du jeu visé.
      for (let again = true; again; ) {
        again = false;
        for (const grade of ['parfaite', 'taillee'] as const)
          for (const type of Object.keys(need) as RuneType[]) {
            const cost = fusionCost(type, grade);
            if (cost && canFuse(st, cost)) {
              st = fuseRunes(st, type, grade);
              again = true;
            }
          }
      }
      const stock = st.runes ?? {};
      const total = Object.values(stock).reduce((a, b) => a + b, 0);
      if (f === Infinity && total > 0) f = n;
      const cutCount = Object.entries(stock).filter(([k]) => !k.endsWith(':brute')).reduce((a, [, v]) => a + v, 0);
      if (c === Infinity && cutCount >= 18) c = n;
      if (Object.entries(need).every(([t, q]) => (stock[`${t}:parfaite`] ?? 0) >= q!)) p = n;
    }
    first.push(f);
    cut.push(c);
    perfect.push(p);
  }
  const mean = (a: number[]) => (a.every(Number.isFinite) ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { dungeonId, difficulty, firstRune: mean(first), eighteenCut: mean(cut), perfectSet: mean(perfect) };
}
