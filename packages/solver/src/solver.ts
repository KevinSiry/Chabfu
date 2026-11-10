/**
 * Solveur de routes : recherche en faisceau (beam search) sur le moteur déterministe.
 *
 * Une « couche » de la recherche correspond à un tour du joueur. Pour chaque état du faisceau,
 * on énumère les suites d'actions possibles pendant le tour (déplacements et sorts, dans tous
 * les ordres utiles), on fusionne les états identiques, puis on simule la fin du tour (tour des
 * monstres). On garde ensuite les meilleurs états selon une heuristique.
 *
 * Le solveur ne connaît aucun donjon en particulier : il prend n'importe quel `RunConfig`.
 * Toutes les routes trouvées sont des suites d'actions rejouables par `verifyRun`.
 */
import {
  InvalidActionError,
  applyAction,
  createRun,
  getCastError,
  getMonsters,
  getPlayer,
  getReachableCells,
  getSpell,
  type Action,
  type Pos,
  type RunConfig,
  type RunState,
} from '@chabfu/engine';

export interface SolverOptions {
  /** États conservés à chaque tour. */
  beamWidth: number;
  /** États intermédiaires explorés au maximum pendant un tour, par état du faisceau. */
  maxTurnNodes: number;
  /** Fins de tour simulées (tour des monstres) par état du faisceau. */
  endTurnCandidates: number;
  /** Abandon au-delà de ce nombre de tours. */
  maxTurns: number;
  /** Interdit les déplacements à pied (le Bond arrière reste permis). */
  noWalk: boolean;
  /**
   * Poids des PV de l'Archer dans l'heuristique. Bas : route agressive (moins de tours, plus de
   * risques). Haut : route prudente.
   */
  hpWeight: number;
}

export const DEFAULT_OPTIONS: SolverOptions = {
  beamWidth: 48,
  maxTurnNodes: 3000,
  endTurnCandidates: 24,
  maxTurns: 40,
  noWalk: false,
  hpWeight: 1.2,
};

export interface SolveResult {
  config: RunConfig;
  won: boolean;
  /** Tours joués (la valeur qui compte au classement). */
  turns: number;
  actions: Action[];
  /** PV de l'Archer à la fin (ou au meilleur état atteint en cas d'échec). */
  hpLeft: number;
  maxHp: number;
  /** PV minimum de l'Archer pendant la route (au début de ses tours). */
  minHp: number;
  /** Salle atteinte (index) et PV restants des monstres dans le meilleur état en cas d'échec. */
  roomReached: number;
  monstersHpLeft: number;
  stats: RouteStats;
  /** Temps de calcul. */
  elapsedMs: number;
}

export interface RouteStats {
  playerActions: number;
  casts: Record<string, number>;
  /** Cases parcourues à pied. */
  cellsWalked: number;
  /** Tours où l'Archer n'a pas marché (il gagne alors +1 Concentration au tour suivant). */
  turnsStill: number;
  concentrationMax: number;
  /** Dégâts reçus par tour, dans l'ordre. */
  damageTakenPerTurn: number[];
}

// ---------------------------------------------------------------------------
// Représentation compacte d'un état pour la fusion des doublons
// ---------------------------------------------------------------------------

export function stateKey(s: RunState): string {
  const p = s.player;
  const parts: (string | number)[] = [s.roomIndex, s.turn, p.concentration, p.nextShotDouble ? 1 : 0, p.pmSpentThisTurn > 0 ? 1 : 0];
  for (const id of Object.keys(p.spellUses).sort()) parts.push(id, p.spellUses[id]);
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    parts.push(u.id, u.pos.x, u.pos.y, u.hp, u.pa, u.pm, u.pmMalus, u.burn ? `${u.burn.damage}/${u.burn.turns}` : '');
  }
  return parts.join('|');
}

// ---------------------------------------------------------------------------
// Heuristiques
// ---------------------------------------------------------------------------

/** Score d'un état au début d'un tour du joueur (plus haut = meilleur). */
export function evaluate(s: RunState, hpWeight = DEFAULT_OPTIONS.hpWeight): number {
  if (s.status === 'won') return 1e9 - s.turn * 1000 + getPlayer(s).hp;
  if (s.status === 'lost') return -1e9;
  const player = getPlayer(s);
  const monsters = s.units.filter((u) => u.team === 'monster');
  let damageDone = 0;
  let pendingBurn = 0;
  let killed = 0;
  for (const m of monsters) {
    damageDone += m.maxHp - m.hp;
    if (m.hp <= 0) killed++;
    else if (m.burn) pendingBurn += Math.min(m.hp, m.burn.damage * m.burn.turns);
  }
  return (
    s.roomIndex * 100000 +
    damageDone +
    pendingBurn * 0.7 +
    killed * 40 +
    player.hp * hpWeight +
    s.player.concentration * 3 +
    (s.player.nextShotDouble ? 10 : 0)
  );
}

/** Pré-classement d'une fin de tour avant de simuler les monstres (moins coûteux). */
function quickScore(s: RunState): number {
  if (s.status === 'won') return 1e9 - s.turn * 1000;
  if (s.status === 'lost') return -1e9;
  let score = s.roomIndex * 100000;
  for (const m of s.units) {
    if (m.team !== 'monster') continue;
    score += m.maxHp - m.hp + (m.hp <= 0 ? 40 : 0);
    if (m.hp > 0 && m.burn) score += Math.min(m.hp, m.burn.damage * m.burn.turns) * 0.7;
    if (m.hp > 0) score += m.pmMalus * 4;
  }
  score += s.player.concentration * 3 + (s.player.nextShotDouble ? 10 : 0);
  return score;
}

// ---------------------------------------------------------------------------
// Génération des actions d'un tour
// ---------------------------------------------------------------------------

/**
 * Sorts lançables. Plutôt que de parcourir toute la portée, on ne teste que les cases utiles
 * (monstres, cases qui touchent un monstre avec une zone, cases de saut), puis le moteur tranche.
 */
function legalCasts(s: RunState): Action[] {
  const out: Action[] = [];
  const player = getPlayer(s);
  const monsters = getMonsters(s);
  for (const spellId of s.player.deck) {
    if (getCastError(s, spellId) !== null) continue;
    const spell = getSpell(spellId);
    const targets: Pos[] = [];
    if (spell.target === 'self') targets.push(player.pos);
    else if (spell.target === 'unit') monsters.forEach((m) => targets.push(m.pos));
    else if (spell.target === 'emptyCell') {
      for (let dy = -spell.maxRange; dy <= spell.maxRange; dy++) {
        for (let dx = -spell.maxRange; dx <= spell.maxRange; dx++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d >= spell.minRange && d <= spell.maxRange) targets.push({ x: player.pos.x + dx, y: player.pos.y + dy });
        }
      }
    } else {
      const seen = new Set<string>();
      for (const m of monsters) {
        for (const off of zoneOffsets(spell.zone)) {
          const c = { x: m.pos.x - off.x, y: m.pos.y - off.y };
          const k = `${c.x},${c.y}`;
          if (!seen.has(k)) {
            seen.add(k);
            targets.push(c);
          }
        }
      }
    }
    for (const target of targets) {
      if (getCastError(s, spellId, target) === null) out.push({ type: 'cast', spellId, target });
    }
  }
  return out;
}

function zoneOffsets(zone: string | undefined): Pos[] {
  const offs: Pos[] = [{ x: 0, y: 0 }];
  if (zone === 'cross') offs.push({ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 });
  if (zone === 'square') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) offs.push({ x: dx, y: dy });
  }
  return offs;
}

function step(s: RunState, action: Action): RunState | null {
  try {
    const next = applyAction(s, action).state;
    next.actionLog = []; // le solveur garde ses propres listes d'actions
    return next;
  } catch (e) {
    if (e instanceof InvalidActionError) return null;
    throw e;
  }
}

interface Node {
  state: RunState;
  actions: Action[];
}

/**
 * Toutes les fins de tour distinctes atteignables depuis `start` (début d'un tour du joueur).
 * Une fin de tour est soit un état où l'on choisit de passer, soit une salle vidée ou une victoire
 * (le moteur enchaîne alors directement sur la salle suivante).
 */
function expandTurn(start: Node, opts: SolverOptions): { endable: Node[]; transitions: Node[] } {
  const turn = start.state.turn;
  const room = start.state.roomIndex;
  const seen = new Set<string>([stateKey(start.state)]);
  const endable: Node[] = [start];
  const transitions: Node[] = [];
  const stack: { node: Node; lastWasMove: boolean }[] = [{ node: start, lastWasMove: false }];
  let visited = 0;

  while (stack.length && visited < opts.maxTurnNodes) {
    const { node, lastWasMove } = stack.pop()!;
    const actions: Action[] = legalCasts(node.state);
    if (!lastWasMove && !opts.noWalk) {
      for (const path of getReachableCells(node.state).values()) actions.push({ type: 'move', to: path[path.length - 1] });
    }
    for (const action of actions) {
      const next = step(node.state, action);
      if (!next) continue;
      visited++;
      const child: Node = { state: next, actions: [...node.actions, action] };
      if (next.status !== 'playing' || next.roomIndex !== room || next.turn !== turn) {
        transitions.push(child);
        continue;
      }
      const k = stateKey(next);
      if (seen.has(k)) continue;
      seen.add(k);
      endable.push(child);
      stack.push({ node: child, lastWasMove: action.type === 'move' });
    }
  }
  return { endable, transitions };
}

/** Garde les meilleures fins de tour, en assurant une diversité de positions finales. */
function pickEndTurnCandidates(nodes: Node[], count: number): Node[] {
  const scored = nodes.map((n) => ({ n, score: quickScore(n.state) })).sort((a, b) => b.score - a.score);
  const picked: Node[] = [];
  const perPos = new Map<string, number>();
  // Première passe : la meilleure fin de tour pour chaque case d'arrivée.
  for (const { n } of scored) {
    if (picked.length >= count) break;
    const p = getPlayer(n.state).pos;
    const k = `${p.x},${p.y}`;
    if (perPos.has(k)) continue;
    perPos.set(k, 1);
    picked.push(n);
  }
  // Seconde passe : compléter avec les meilleurs scores restants.
  for (const { n } of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(n)) picked.push(n);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Recherche en faisceau
// ---------------------------------------------------------------------------

export function solve(config: RunConfig, options: Partial<SolverOptions> = {}): SolveResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const t0 = Date.now();
  const initial = createRun(config);
  initial.actionLog = [];
  let beam: Node[] = [{ state: initial, actions: [] }];
  let bestFailure: Node = beam[0];

  for (let layer = 0; layer < opts.maxTurns && beam.length; layer++) {
    const next = new Map<string, { node: Node; score: number }>();
    let winner: Node | null = null;

    const consider = (node: Node) => {
      if (node.state.status === 'lost') return;
      if (node.state.status === 'won') {
        if (!winner || evaluate(node.state, opts.hpWeight) > evaluate(winner.state, opts.hpWeight)) winner = node;
        return;
      }
      const k = stateKey(node.state);
      const score = evaluate(node.state, opts.hpWeight);
      const prev = next.get(k);
      if (!prev || prev.score < score || (prev.score === score && node.actions.length < prev.node.actions.length)) {
        next.set(k, { node, score });
      }
    };

    for (const node of beam) {
      const { endable, transitions } = expandTurn(node, opts);
      transitions.forEach(consider);
      for (const cand of pickEndTurnCandidates(endable, opts.endTurnCandidates)) {
        const after = step(cand.state, { type: 'endTurn' });
        if (after) consider({ state: after, actions: [...cand.actions, { type: 'endTurn' }] });
      }
    }

    if (winner) return finish(config, true, winner, t0);
    const ranked = [...next.values()].sort((a, b) => b.score - a.score);
    beam = ranked.slice(0, opts.beamWidth).map((r) => r.node);
    if (beam.length) bestFailure = beam[0];
  }
  return finish(config, false, bestFailure, t0);
}

function finish(config: RunConfig, won: boolean, node: Node, t0: number): SolveResult {
  const stats = computeStats(config, node.actions);
  const player = getPlayer(node.state);
  return {
    config,
    won,
    turns: node.state.turn,
    actions: node.actions,
    hpLeft: player.hp,
    maxHp: player.maxHp,
    minHp: stats.minHp,
    roomReached: node.state.roomIndex,
    monstersHpLeft: getMonsters(node.state).reduce((sum, m) => sum + m.hp, 0),
    stats: stats.route,
    elapsedMs: Date.now() - t0,
  };
}

/** Rejoue la route pour en tirer des statistiques lisibles. */
export function computeStats(config: RunConfig, actions: Action[]): { route: RouteStats; minHp: number } {
  let s = createRun(config);
  const route: RouteStats = { playerActions: 0, casts: {}, cellsWalked: 0, turnsStill: 0, concentrationMax: 0, damageTakenPerTurn: [] };
  let minHp = getPlayer(s).hp;
  let walkedThisTurn = 0;
  for (const action of actions) {
    const hpBefore = getPlayer(s).hp;
    const { state, events } = applyAction(s, action);
    s = state;
    if (action.type !== 'endTurn') route.playerActions++;
    if (action.type === 'cast') route.casts[action.spellId] = (route.casts[action.spellId] ?? 0) + 1;
    for (const e of events) {
      if (e.type === 'move' && e.unitId === 'archer') {
        route.cellsWalked += e.path.length;
        walkedThisTurn += e.path.length;
      }
      if (e.type === 'concentration') route.concentrationMax = Math.max(route.concentrationMax, e.value);
      if (e.type === 'roomEnter') {
        if (walkedThisTurn === 0) route.turnsStill++;
        walkedThisTurn = 0;
      }
    }
    if (action.type === 'endTurn') {
      if (walkedThisTurn === 0) route.turnsStill++;
      walkedThisTurn = 0;
      route.damageTakenPerTurn.push(hpBefore - getPlayer(s).hp);
    }
    minHp = Math.min(minHp, getPlayer(s).hp);
    if (s.status !== 'playing') break;
  }
  return { route, minHp };
}

/** Profils essayés par `solveBest` : une route agressive et une route prudente. */
export const PROFILES: { name: string; options: Partial<SolverOptions> }[] = [
  { name: 'agressif', options: { hpWeight: 0.3 } },
  { name: 'prudent', options: { hpWeight: 1.2 } },
];

/** Lance chaque profil et garde la meilleure route : victoire en moins de tours, puis plus de PV. */
export function solveBest(config: RunConfig, options: Partial<SolverOptions> = {}): SolveResult & { profile: string } {
  let best: (SolveResult & { profile: string }) | null = null;
  for (const profile of PROFILES) {
    const r = { ...solve(config, { ...profile.options, ...options }), profile: profile.name };
    if (!best || compareResults(r, best) < 0) best = r;
  }
  return best!;
}

/** Ordre : victoire d'abord, puis moins de tours, puis plus de PV ; en cas d'échec, salle la plus loin. */
export function compareResults(a: SolveResult, b: SolveResult): number {
  if (a.won !== b.won) return a.won ? -1 : 1;
  if (a.won) return a.turns - b.turns || b.hpLeft - a.hpLeft;
  return b.roomReached - a.roomReached || a.monstersHpLeft - b.monstersHpLeft;
}

/** Secondes par action du joueur (réflexion, clic, animation) et par tour des monstres. Estimation. */
export const SECONDS_PER_ACTION = 2.5;
export const SECONDS_PER_MONSTER_PHASE = 1.5;

export function estimateDurationSeconds(r: SolveResult): number {
  const endTurns = r.actions.filter((a) => a.type === 'endTurn').length;
  return Math.round(r.stats.playerActions * SECONDS_PER_ACTION + endTurns * SECONDS_PER_MONSTER_PHASE);
}
