/**
 * Fonctions de lecture pour l'interface : aperçus d'actions, intentions des monstres, zones de menace.
 * Aucune règle n'est définie ici : tout passe par `applyAction` sur une copie de l'état, ou par les
 * mêmes fonctions que le moteur. Les aperçus sont donc exacts (le combat est déterministe).
 */
import { canUseAttack } from './ai.js';
import { PLAYER_ID, applyAction, computeDamage, equipmentFlatDamage, playerResistance, getCastError, getPlayer, getReachableCells, WEAKNESS_BONUS, RESISTANCE_MALUS } from './combat.js';
import { getMonster, monsterBehavior } from './data/monsters.js';
import { getSpell } from './data/spells.js';
import { isWall, key, reachable } from './grid.js';
import { difficultyMultiplier } from './loot.js';
import type { Action, Burn, Element, GameEvent, Pos, RunState, Unit } from './types.js';

// ---------------------------------------------------------------------------
// Résumé d'une suite d'événements
// ---------------------------------------------------------------------------

export interface UnitOutcome {
  unitId: string;
  name: string;
  hpBefore: number;
  hpAfter: number;
  /** Dégâts totaux, toutes sources confondues. */
  damage: number;
  bySource: Partial<Record<'spell' | 'burn' | 'collision' | 'attack', number>>;
  killed: boolean;
  /** Déplacement subi (poussée, saut) : case d'arrivée. */
  movedTo?: Pos;
  pushedFrom?: Pos;
  statuses: string[];
}

export interface ActionPreview {
  valid: boolean;
  error: string | null;
  outcomes: UnitOutcome[];
  concentrationBefore: number;
  concentrationAfter: number;
  /** La salle est vidée par cette action. */
  clearsRoom: boolean;
  events: GameEvent[];
}

function summarize(before: RunState, events: GameEvent[], stopAtRoomChange = true): Omit<ActionPreview, 'valid' | 'error' | 'events'> {
  const outcomes = new Map<string, UnitOutcome>();
  const get = (id: string): UnitOutcome => {
    let o = outcomes.get(id);
    if (!o) {
      const u = before.units.find((x) => x.id === id);
      o = { unitId: id, name: u?.name ?? id, hpBefore: u?.hp ?? 0, hpAfter: u?.hp ?? 0, damage: 0, bySource: {}, killed: false, statuses: [] };
      outcomes.set(id, o);
    }
    return o;
  };
  let conc = before.player.concentration;
  let clearsRoom = false;
  for (const ev of events) {
    if (ev.type === 'roomCleared') {
      clearsRoom = true;
      if (stopAtRoomChange) break;
    }
    switch (ev.type) {
      case 'damage': {
        const o = get(ev.unitId);
        o.damage += ev.amount;
        o.hpAfter = Math.max(0, o.hpAfter - ev.amount);
        o.bySource[ev.source] = (o.bySource[ev.source] ?? 0) + ev.amount;
        break;
      }
      case 'death':
        get(ev.unitId).killed = true;
        break;
      case 'push': {
        const o = get(ev.unitId);
        o.pushedFrom = o.pushedFrom ?? ev.from;
        o.movedTo = ev.to;
        break;
      }
      case 'jump':
        get(ev.unitId).movedTo = ev.to;
        break;
      case 'move':
        if (ev.path.length) get(ev.unitId).movedTo = ev.path[ev.path.length - 1];
        break;
      case 'status':
        get(ev.unitId).statuses.push(ev.text);
        break;
      case 'concentration':
        conc = ev.value;
        break;
      default:
        break;
    }
  }
  return { outcomes: [...outcomes.values()], concentrationBefore: before.player.concentration, concentrationAfter: conc, clearsRoom };
}

/** Aperçu exact d'une action du joueur : dégâts, morts, poussées, collisions, Concentration. */
export function previewAction(state: RunState, action: Action): ActionPreview {
  try {
    const { events } = applyAction(state, action);
    return { valid: true, error: null, events, ...summarize(state, events) };
  } catch (e) {
    return {
      valid: false,
      error: (e as Error).message,
      events: [],
      outcomes: [],
      concentrationBefore: state.player.concentration,
      concentrationAfter: state.player.concentration,
      clearsRoom: false,
    };
  }
}

export function previewCast(state: RunState, spellId: string, target: Pos): ActionPreview {
  const err = getCastError(state, spellId, target);
  if (err) {
    const c = state.player.concentration;
    return { valid: false, error: err, events: [], outcomes: [], concentrationBefore: c, concentrationAfter: c, clearsRoom: false };
  }
  return previewAction(state, { type: 'cast', spellId, target });
}

// ---------------------------------------------------------------------------
// Dégâts théoriques (affichés même hors de portée)
// ---------------------------------------------------------------------------

export interface DamageBreakdown {
  /** Dégâts directs finaux. */
  amount: number;
  base: number;
  /** Dégâts fixes ajoutés par l'équipement (stat Dommages). */
  flat: number;
  element: Element;
  mastery: number;
  weakness: boolean;
  resistance: boolean;
  doubled: boolean;
  /** Dégâts de brûlure par tour, s'il y en a. */
  burn?: Burn;
}

/** Dégâts d'un sort du joueur sur une unité, avec le détail des multiplicateurs. */
export function spellDamageOn(state: RunState, spellId: string, target: Unit): DamageBreakdown | null {
  const spell = getSpell(spellId);
  if (spell.damage === undefined) return null;
  const player = getPlayer(state);
  const doubled = state.player.nextShotDouble;
  return {
    amount: computeDamage(state, spell.damage + equipmentFlatDamage(state), spell.element, player, target, doubled),
    base: spell.damage,
    flat: equipmentFlatDamage(state),
    element: spell.element,
    mastery: state.player.masteries[spell.element] ?? 0,
    weakness: spell.element !== 'neutral' && target.weakness === spell.element,
    resistance: spell.element !== 'neutral' && target.resistance === spell.element,
    doubled,
    burn: spell.burn ? { damage: computeDamage(state, spell.burn.damage, spell.element, player, target), turns: spell.burn.turns } : undefined,
  };
}

export const DAMAGE_FACTORS = { weakness: WEAKNESS_BONUS, resistance: RESISTANCE_MALUS };

export interface AttackInfo {
  id: string;
  name: string;
  element: Element;
  /** Dégâts infligés à l'Archer, difficulté et résistances comprises. */
  damage: number;
  /** Résistance de l'Archer à l'élément de l'attaque, en %. */
  resisted: number;
  pa: number;
  minRange: number;
  maxRange: number;
  los: boolean;
  maxPerTurn: number;
  burn?: Burn;
  pmRemoval?: number;
  push?: number;
}

/** Attaques d'un monstre avec les dégâts réels contre l'Archer. */
export function monsterAttacks(state: RunState, monster: Unit): AttackInfo[] {
  const player = getPlayer(state);
  return getMonster(monster.templateId).attacks.map((a) => ({
    id: a.id,
    name: a.name,
    element: a.element,
    damage: computeDamage(state, a.damage, a.element, monster, player),
    resisted: playerResistance(state, a.element),
    pa: a.pa,
    minRange: a.minRange,
    maxRange: a.maxRange,
    los: a.los,
    maxPerTurn: a.maxPerTurn,
    burn: a.burn ? { damage: computeDamage(state, a.burn.damage, a.element, monster, player), turns: a.burn.turns } : undefined,
    pmRemoval: a.pmRemoval,
    push: a.push,
  }));
}

export function difficultyFactor(state: RunState): number {
  return difficultyMultiplier(state.config.difficulty);
}

// ---------------------------------------------------------------------------
// Intentions : ce que feront les monstres si le joueur finit son tour maintenant
// ---------------------------------------------------------------------------

export interface MonsterIntent {
  unitId: string;
  name: string;
  /** Chemin suivi (vide s'il ne bouge pas). */
  path: Pos[];
  attacks: { attackId: string; name: string; damage: number; element: Element }[];
  /** Effets subis par l'Archer (brûlure, retrait de PM, poussée, collision). */
  effects: string[];
  /** Dégâts totaux infligés à l'Archer (collisions comprises). */
  damageToPlayer: number;
  /** Dégâts de brûlure subis au début de son tour. */
  burnTaken: number;
  diesFromBurn: boolean;
  /** Le monstre n'agit pas (le joueur est mort avant, etc.). */
  skipped: boolean;
}

export interface EnemyTurnPreview {
  intents: MonsterIntent[];
  damageToPlayer: number;
  playerHpAfter: number;
  playerDies: boolean;
  /** Dégâts de brûlure subis par l'Archer au début de son prochain tour. */
  playerBurnNextTurn: number;
  /** Concentration au début du prochain tour du joueur. */
  concentrationNextTurn: number;
}

/** Simule la fin du tour (depuis `state`, ou après un déplacement vers `moveTo`). */
export function previewEnemyTurn(state: RunState, moveTo?: Pos): EnemyTurnPreview | null {
  let s = state;
  if (s.status !== 'playing') return null;
  if (moveTo) {
    try {
      s = applyAction(s, { type: 'move', to: moveTo }).state;
    } catch {
      return null;
    }
  }
  const before = getPlayer(s).hp;
  const { state: after, events } = applyAction(s, { type: 'endTurn' });
  const intents = new Map<string, MonsterIntent>();
  for (const m of s.units) {
    if (m.team !== 'monster' || m.hp <= 0) continue;
    intents.set(m.id, { unitId: m.id, name: m.name, path: [], attacks: [], effects: [], damageToPlayer: 0, burnTaken: 0, diesFromBurn: false, skipped: true });
  }
  let current: MonsterIntent | undefined;
  let playerBurn = 0;
  let playerTurnStarted = false;
  for (const ev of events) {
    if (ev.type === 'turnStart') {
      current = intents.get(ev.unitId);
      if (current) current.skipped = false;
      if (ev.unitId === PLAYER_ID) playerTurnStarted = true;
      continue;
    }
    if (playerTurnStarted) {
      if (ev.type === 'damage' && ev.unitId === PLAYER_ID && ev.source === 'burn') playerBurn += ev.amount;
      continue;
    }
    if (!current) continue;
    if (ev.type === 'move' && ev.unitId === current.unitId) current.path = ev.path;
    if (ev.type === 'damage' && ev.unitId === current.unitId && ev.source === 'burn') current.burnTaken += ev.amount;
    if (ev.type === 'death' && ev.unitId === current.unitId) current.diesFromBurn = true;
    if (ev.type === 'attack' && ev.unitId === current.unitId) {
      const atk = getMonster(s.units.find((u) => u.id === current!.unitId)!.templateId).attacks.find((a) => a.id === ev.attackId);
      current.attacks.push({ attackId: ev.attackId, name: atk?.name ?? ev.attackId, damage: 0, element: atk?.element ?? 'neutral' });
    }
    if (ev.type === 'damage' && ev.unitId === PLAYER_ID && ev.source === 'attack') {
      const last = current.attacks[current.attacks.length - 1];
      if (last) last.damage += ev.amount;
      current.damageToPlayer += ev.amount;
    }
    if (ev.type === 'damage' && ev.unitId === PLAYER_ID && ev.source === 'collision') {
      current.damageToPlayer += ev.amount;
      current.effects.push(`collision −${ev.amount} PV`);
    }
    if (ev.type === 'status' && ev.unitId === PLAYER_ID) current.effects.push(ev.text);
    if (ev.type === 'push' && ev.unitId === PLAYER_ID) {
      const n = Math.abs(ev.to.x - ev.from.x) + Math.abs(ev.to.y - ev.from.y);
      current.effects.push(`vous pousse de ${n} case${n > 1 ? 's' : ''}`);
    }
  }
  const list = [...intents.values()];
  const total = list.reduce((n, i) => n + i.damageToPlayer, 0);
  return {
    intents: list,
    damageToPlayer: total,
    playerHpAfter: Math.max(0, before - total),
    playerDies: before - total <= 0,
    playerBurnNextTurn: playerBurn,
    concentrationNextTurn: after.player.concentration,
  };
}

// ---------------------------------------------------------------------------
// Zones de déplacement et de menace d'un monstre (pour son prochain tour)
// ---------------------------------------------------------------------------

export interface ThreatZone {
  /** Cases que le monstre peut atteindre à son prochain tour. */
  move: Pos[];
  /** Cases où l'Archer peut être touché par le monstre à son prochain tour (déplacement + attaque). */
  threat: Pos[];
  /** PM réellement disponibles au prochain tour (retraits de PM compris). */
  pm: number;
}

/**
 * Zone de menace exacte, case par case : on place l'Archer sur chaque case et on vérifie si le
 * monstre peut le toucher après un déplacement (mêmes règles de portée et de ligne de vue que l'IA).
 */
export function monsterThreatZone(state: RunState, monsterId: string): ThreatZone {
  const monster = state.units.find((u) => u.id === monsterId);
  if (!monster || monster.hp <= 0) return { move: [], threat: [], pm: 0 };
  const tpl = getMonster(monster.templateId);
  // Une sentinelle ne se déplace jamais (même règle que l'IA).
  const pm = monsterBehavior(tpl) === 'sentinel' ? 0 : Math.max(0, monster.basePm - monster.pmMalus);
  const player = getPlayer(state);
  const others = state.units.filter((u) => u.id !== monster.id && u.hp > 0);

  const moveMap = reachable(state.room, others, monster.pos, pm);
  const move = [...moveMap.values()].map((p) => (p.length ? p[p.length - 1] : monster.pos));

  const threat: Pos[] = [];
  const withoutPlayer = others.filter((u) => u.id !== PLAYER_ID);
  for (let y = 0; y < state.room.height; y++) {
    for (let x = 0; x < state.room.width; x++) {
      const cell = { x, y };
      if (isWall(state.room, cell) || withoutPlayer.some((u) => u.pos.x === x && u.pos.y === y) || (monster.pos.x === x && monster.pos.y === y)) continue;
      const ghost: Unit = { ...player, pos: cell };
      const units = [...withoutPlayer, ghost, monster];
      const cells = reachable(state.room, [...withoutPlayer, ghost], monster.pos, pm);
      let hit = false;
      for (const path of cells.values()) {
        const from = path.length ? path[path.length - 1] : monster.pos;
        if (tpl.attacks.some((a) => a.pa <= monster.basePa && canUseAttack(state.room, units, from, ghost, a, monster))) {
          hit = true;
          break;
        }
      }
      if (hit) threat.push(cell);
    }
  }
  return { move, threat, pm };
}

/** Union des zones de menace de tous les monstres, avec le nombre de monstres par case. */
export function combinedThreat(state: RunState): Map<string, { pos: Pos; count: number }> {
  const map = new Map<string, { pos: Pos; count: number }>();
  for (const m of state.units) {
    if (m.team !== 'monster' || m.hp <= 0) continue;
    for (const c of monsterThreatZone(state, m.id).threat) {
      const k = key(c);
      const e = map.get(k);
      if (e) e.count += 1;
      else map.set(k, { pos: c, count: 1 });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Ordre des tours et Concentration
// ---------------------------------------------------------------------------

/** Ordre de jeu d'un tour complet : l'Archer, puis les monstres dans l'ordre du moteur. */
export function turnOrder(state: RunState): Unit[] {
  return [getPlayer(state), ...state.units.filter((u) => u.team === 'monster' && u.hp > 0)];
}

export interface MovePreview {
  path: Pos[];
  pmCost: number;
  concentrationAfter: number;
}

export function previewMove(state: RunState, to: Pos): MovePreview | null {
  const path = getReachableCells(state).get(key(to));
  if (!path) return null;
  const p = previewAction(state, { type: 'move', to });
  return { path, pmCost: path.length, concentrationAfter: p.concentrationAfter };
}

/** Le joueur gagnera-t-il +1 Concentration au début de son prochain tour (s'il ne bouge plus) ? */
export function willGainConcentrationNextTurn(state: RunState): boolean {
  return state.player.pmSpentThisTurn === 0;
}
