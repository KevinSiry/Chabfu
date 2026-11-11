/**
 * Fonctions de lecture pour l'interface : aperçus d'actions, intentions des monstres, zones de menace.
 * Aucune règle n'est définie ici : tout passe par `applyAction` sur une copie de l'état, ou par les
 * mêmes fonctions que le moteur. Les aperçus sont donc exacts (le combat est déterministe).
 */
import { canUseAttack } from './ai.js';
import { PLAYER_ID, applyAction, computeDamage, distanceBonus, DISTANCE_BONUS_FROM, DISTANCE_BONUS_MAX_CELLS, equipmentFlatDamage, equipmentRange, playerResistance, getCastError, getPlayer, getReachableCells, getSpellZone, spellHitMultiplier, WEAKNESS_BONUS, RESISTANCE_MALUS, monsterDamageMultiplier } from './combat.js';
import { getMonster, monsterBehavior } from './data/monsters.js';
import { getSpell } from './data/spells.js';
import { distance, isWall, key, reachable, samePos } from './grid.js';
import { combinePassives, spellMaxRange } from './passives.js';

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
  bySource: Partial<Record<'spell' | 'burn' | 'collision' | 'attack' | 'mechanic', number>>;
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
  /** La salle est vidée par cette action. */
  clearsRoom: boolean;
  events: GameEvent[];
  /** État après l'action (absent si l'action est invalide). */
  after?: RunState;
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
      default:
        break;
    }
  }
  return { outcomes: [...outcomes.values()], clearsRoom };
}

/** Aperçu exact d'une action du joueur : dégâts, morts, poussées, collisions. */
export function previewAction(state: RunState, action: Action): ActionPreview {
  try {
    const { state: after, events } = applyAction(state, action);
    return { valid: true, error: null, events, after, ...summarize(state, events) };
  } catch (e) {
    return {
      valid: false,
      error: (e as Error).message,
      events: [],
      outcomes: [],
      clearsRoom: false,
    };
  }
}

export function previewCast(state: RunState, spellId: string, target: Pos): ActionPreview {
  const err = getCastError(state, spellId, target);
  if (err) return { valid: false, error: err, events: [], outcomes: [], clearsRoom: false };
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
  /** Distance lanceur → cible, en cases. */
  distance: number;
  /** Bonus de distance appliqué (fraction : 0,18 = +18 %), Tir concentré compris. */
  distanceBonus: number;
  /** Tir concentré actif : bonus de distance doublé. */
  aimed: boolean;
  /** Multiplicateur propre au sort et aux passifs (cible ralentie, obstacle derrière, brûlure…), 1 sinon. */
  hitBonus: number;
  /** Dégâts de brûlure par tour, s'il y en a. */
  burn?: Burn;
}

/** Dégâts d'un sort du joueur sur une unité, avec le détail des multiplicateurs. */
export function spellDamageOn(state: RunState, spellId: string, target: Unit): DamageBreakdown | null {
  const spell = getSpell(spellId);
  if (spell.damage === undefined) return null;
  const player = getPlayer(state);
  const aimed = state.player.nextShotAimed;
  const d = distance(player.pos, target.pos);
  const bonus = distanceBonus(state, d, aimed);
  const hitBonus = spellHitMultiplier(state, spell, target, player.pos);
  return {
    amount: computeDamage(state, spell.damage + equipmentFlatDamage(state), spell.element, player, target, bonus, hitBonus),
    hitBonus,
    base: spell.damage,
    flat: equipmentFlatDamage(state),
    element: spell.element,
    mastery: state.player.masteries[spell.element] ?? 0,
    weakness: spell.element !== 'neutral' && target.weakness === spell.element,
    resistance: spell.element !== 'neutral' && target.resistance === spell.element,
    distance: d,
    distanceBonus: bonus,
    aimed,
    burn: spell.burn ? { damage: computeDamage(state, spell.burn.damage, spell.element, player, target), turns: spell.burn.turns } : undefined,
  };
}

export const DAMAGE_FACTORS = { weakness: WEAKNESS_BONUS, resistance: RESISTANCE_MALUS };

// ---------------------------------------------------------------------------
// Puissance réelle d'un sort (fiche de sort)
// ---------------------------------------------------------------------------

/** Dégâts d'un sort contre une cible neutre, une cible faible et une cible résistante à son élément. */
export interface DamageSpread {
  normal: number;
  weak: number;
  resist: number;
}

export interface SpellPower {
  element: Element;
  /** Dégâts de base du catalogue. */
  base: number;
  /** Dégâts fixes ajoutés par l'équipement (stat Dommages), avant la maîtrise. */
  flat: number;
  /** Maîtrise de l'élément du sort, en %. */
  mastery: number;
  /** Dégâts directs avec les stats actuelles du personnage, sans bonus de distance (tir à 3 cases ou moins). */
  damage: DamageSpread;
  /** Dégâts directs au plus loin possible (portée maximale du sort, 8 cases au plus), Tir concentré compris s'il est actif. */
  damageFar: DamageSpread;
  /** Distance du tir le plus lointain qui compte (portée maximale réelle, plafonnée à 8 cases). */
  farDistance: number;
  /** Bonus de distance à `farDistance` (fraction), Tir concentré compris s'il est actif. */
  farBonus: number;
  /** Tir concentré actif : le prochain tir double son bonus de distance. */
  aimed: boolean;
  /** Brûlure par tour avec les stats actuelles, et nombre de tours (passifs compris). */
  burn?: { base: number; perTurn: DamageSpread; turns: number };
  /** Portée maximale réelle (passifs compris). */
  maxRange: number;
}

/** Cible fictive sans faiblesse ni résistance, pour calculer les dégâts « à vide » d'un sort. */
function dummyTarget(state: RunState, weakness?: Element, resistance?: Element): Unit {
  const p = getPlayer(state);
  return {
    id: '__cible__',
    team: 'monster',
    templateId: '__cible__',
    name: 'Cible',
    pos: { ...p.pos },
    hp: 1,
    maxHp: 1,
    pa: 0,
    pm: 0,
    basePa: 0,
    basePm: 0,
    weakness,
    resistance,
    pmMalus: 0,
    attackUses: {},
  };
}

function spread(state: RunState, base: number, element: Element, bonus = 0): DamageSpread {
  const player = getPlayer(state);
  const neutral = element === 'neutral';
  return {
    normal: computeDamage(state, base, element, player, dummyTarget(state), bonus),
    weak: computeDamage(state, base, element, player, dummyTarget(state, neutral ? undefined : element), bonus),
    resist: computeDamage(state, base, element, player, dummyTarget(state, undefined, neutral ? undefined : element), bonus),
  };
}

/** Chiffres réels d'un sort avec les stats du personnage : ce que la fiche de sort affiche. */
export function spellPower(state: RunState, spellId: string): SpellPower {
  const spell = getSpell(spellId);
  const aimed = spell.damage !== undefined && state.player.nextShotAimed;
  const maxRange = spellMaxRange(spell, state.player.passives, equipmentRange(state));
  const farDistance = Math.min(maxRange, DISTANCE_BONUS_FROM + DISTANCE_BONUS_MAX_CELLS);
  const far = spell.damage !== undefined ? distanceBonus(state, farDistance, aimed) : 0;
  const none = { normal: 0, weak: 0, resist: 0 };
  return {
    element: spell.element,
    base: spell.damage ?? 0,
    flat: spell.damage !== undefined ? equipmentFlatDamage(state) : 0,
    mastery: state.player.masteries[spell.element] ?? 0,
    damage: spell.damage !== undefined ? spread(state, spell.damage + equipmentFlatDamage(state), spell.element) : none,
    damageFar: spell.damage !== undefined ? spread(state, spell.damage + equipmentFlatDamage(state), spell.element, far) : none,
    farDistance,
    farBonus: far,
    aimed,
    burn: spell.burn
      ? { base: spell.burn.damage, perTurn: spread(state, spell.burn.damage, spell.element), turns: spell.burn.turns + combinePassives(state.player.passives).burnExtraTurns }
      : undefined,
    maxRange,
  };
}

// ---------------------------------------------------------------------------
// Aperçu détaillé d'un sort sur une case (survol avec un sort sélectionné)
// ---------------------------------------------------------------------------

export interface TargetOutcome {
  unitId: string;
  name: string;
  templateId: string;
  /** Unité sur la case visée (les autres sont touchées par la zone ou une collision). */
  isTarget: boolean;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  spellDamage: number;
  collisionDamage: number;
  killed: boolean;
  /** Détail du calcul des dégâts directs (absent si l'unité n'est touchée que par une collision). */
  breakdown: DamageBreakdown | null;
  /** Brûlure portée après le sort (dégâts par tour, tours restants). */
  burn?: Burn;
  /** Nombre de ses tours au bout duquel la brûlure l'achève (si rien d'autre ne la touche). */
  burnKillsIn?: number;
  /** PM retirés par ce sort, et PM qu'il aura à son prochain tour. */
  pmRemoved: number;
  pmNextTurn: number;
  basePm: number;
  /** Poussée subie : départ, arrivée, cases parcourues, cases demandées. */
  push?: { from: Pos; to: Pos; cells: number; wanted: number; blocked: boolean };
  /** Heurté par une unité poussée contre lui. */
  hitByCollision: boolean;
}

export interface CastPreview extends ActionPreview {
  spellId: string;
  target: Pos;
  /** Cases touchées par le sort. */
  zone: Pos[];
  targets: TargetOutcome[];
  /** Distance lanceur → case visée. */
  distance: number;
  /** Portée réelle du sort. */
  minRange: number;
  maxRange: number;
  /** Nouvelle case de l'Archer (saut). */
  playerMovedTo?: Pos;
  /** Bonus de distance sur la case visée (fraction), Tir concentré compris ; 0 pour un sort sans dégâts. */
  distanceBonus: number;
  /** Le sort consomme le Tir concentré (bonus de distance doublé). */
  consumesAimed: boolean;
}

/** Aperçu complet d'un sort sur une case : tout ce que l'infobulle de visée affiche. */
export function previewCastDetailed(state: RunState, spellId: string, target: Pos): CastPreview {
  const spell = getSpell(spellId);
  const base = previewCast(state, spellId, target);
  const player = getPlayer(state);
  const d = distance(player.pos, target);
  const out: CastPreview = {
    ...base,
    spellId,
    target,
    zone: spell.target === 'self' ? [player.pos] : getSpellZone(state, spellId, target),
    targets: [],
    distance: d,
    minRange: spell.minRange,
    maxRange: spellMaxRange(spell, state.player.passives, equipmentRange(state)),
    distanceBonus: spell.damage !== undefined ? distanceBonus(state, d, state.player.nextShotAimed) : 0,
    consumesAimed: spell.damage !== undefined && state.player.nextShotAimed,
  };
  if (!base.valid) return out;

  const sameRoom = !!base.after && base.after.roomIndex === state.roomIndex;
  const pushes = new Map<string, { from: Pos; to: Pos }>();
  for (const ev of base.events) {
    if (ev.type === 'roomCleared') break;
    if (ev.type === 'push') pushes.set(ev.unitId, { from: ev.from, to: ev.to });
    if (ev.type === 'jump' && ev.unitId === PLAYER_ID) out.playerMovedTo = ev.to;
  }

  for (const o of base.outcomes) {
    if (o.unitId === PLAYER_ID) continue;
    const u = state.units.find((x) => x.id === o.unitId);
    if (!u) continue;
    const a = sameRoom ? base.after!.units.find((x) => x.id === u.id) : undefined;
    const hitBySpell = (o.bySource.spell ?? 0) > 0 || out.zone.some((c) => samePos(c, u.pos));
    const burn = a && a.hp > 0 && a.burn ? { ...a.burn } : undefined;
    const pmMalus = a ? a.pmMalus : u.pmMalus;
    const p = pushes.get(u.id);
    let push: TargetOutcome['push'];
    if (spell.push && hitBySpell && (o.hpAfter > 0 || p || (o.bySource.collision ?? 0) > 0)) {
      const from = p?.from ?? u.pos;
      const to = p?.to ?? u.pos;
      const cells = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      push = { from, to, cells, wanted: spell.push, blocked: cells < spell.push };
    }
    out.targets.push({
      unitId: u.id,
      name: u.name,
      templateId: u.templateId,
      isTarget: samePos(u.pos, target),
      hpBefore: o.hpBefore,
      hpAfter: o.hpAfter,
      maxHp: u.maxHp,
      spellDamage: o.bySource.spell ?? 0,
      collisionDamage: o.bySource.collision ?? 0,
      killed: o.killed,
      breakdown: hitBySpell && spell.damage !== undefined ? spellDamageOn(state, spellId, u) : null,
      burn,
      burnKillsIn: burn && burn.damage > 0 && Math.ceil(o.hpAfter / burn.damage) <= burn.turns ? Math.ceil(o.hpAfter / burn.damage) : undefined,
      pmRemoved: hitBySpell && o.hpAfter > 0 ? (spell.pmRemoval ?? 0) : 0,
      pmNextTurn: Math.max(0, u.basePm - pmMalus),
      basePm: u.basePm,
      push,
      hitByCollision: !hitBySpell && (o.bySource.collision ?? 0) > 0,
    });
  }
  // La cible principale d'abord, puis les autres de haut en bas.
  out.targets.sort((x, y) => Number(y.isTarget) - Number(x.isTarget));
  return out;
}

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
  return monsterDamageMultiplier(state);
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
}

/** Simule la fin du tour (depuis `state`, ou après un déplacement vers `moveTo`). */
const MECHANIC_LABEL: Record<string, string> = { roots: 'racines', blast: 'explosion', gale: 'grand vent', deathBlast: 'explosion' };

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
  const { events } = applyAction(s, { type: 'endTurn' });
  const intents = new Map<string, MonsterIntent>();
  for (const m of s.units) {
    if (m.team !== 'monster' || m.hp <= 0) continue;
    intents.set(m.id, { unitId: m.id, name: m.name, path: [], attacks: [], effects: [], damageToPlayer: 0, burnTaken: 0, diesFromBurn: false, skipped: true });
  }
  let current: MonsterIntent | undefined;
  let playerBurn = 0;
  let playerTurnStarted = false;
  let lastMechanic = '';
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
    if (ev.type === 'damage' && ev.unitId === PLAYER_ID && ev.source === 'mechanic') {
      current.damageToPlayer += ev.amount;
      current.effects.push(`${MECHANIC_LABEL[lastMechanic] ?? 'mécanique'} −${ev.amount} PV`);
    }
    if (ev.type === 'mechanic') lastMechanic = ev.kind;
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
// Ordre des tours et déplacements
// ---------------------------------------------------------------------------

/** Ordre de jeu d'un tour complet : l'Archer, puis les monstres dans l'ordre du moteur. */
export function turnOrder(state: RunState): Unit[] {
  return [getPlayer(state), ...state.units.filter((u) => u.team === 'monster' && u.hp > 0)];
}

export interface MovePreview {
  path: Pos[];
  pmCost: number;
}

export function previewMove(state: RunState, to: Pos): MovePreview | null {
  const path = getReachableCells(state).get(key(to));
  if (!path) return null;
  return { path, pmCost: path.length };
}
