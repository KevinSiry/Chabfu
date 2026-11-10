import { canUseAttack, planMonsterMove } from './ai.js';
import { getDungeon } from './data/dungeons.js';
import { getMonster, type MonsterAttack } from './data/monsters.js';
import { getSpell, type SpellDef } from './data/spells.js';
import { DIRS, distance, hasLineOfSight, isFree, isWall, key, reachable, samePos, unitAt } from './grid.js';
import { MAX_DIFFICULTY, MIN_DIFFICULTY, difficultyMultiplier } from './loot.js';
import { MAX_RESISTANCE } from './equipment.js';
import { combinePassives, spellMaxRange, spellPaCost, validatePassives } from './passives.js';
import { effectiveLevel, getTranche, validateDeck } from './progression.js';
import type { Action, Element, GameEvent, Pos, RunConfig, RunState, Unit } from './types.js';

export const PLAYER_ID = 'archer';
export const BASE_PA = 6;
export const BASE_PM = 3;
export const PLAYER_HP = 150;
export const WEAKNESS_BONUS = 1.3;
export const RESISTANCE_MALUS = 0.8;
export const COLLISION_DAMAGE_PER_CELL = 8;
/** Portée = puissance : les dégâts directs des sorts de l'Archer montent avec la distance de tir. */
export const DISTANCE_BONUS_FROM = 3;
/** Bonus par case au-delà de DISTANCE_BONUS_FROM. */
export const DISTANCE_BONUS_PER_CELL = 0.06;
/** Nombre de cases comptées au maximum (plafond atteint à DISTANCE_BONUS_FROM + ce nombre). */
export const DISTANCE_BONUS_MAX_CELLS = 5;

/**
 * Copie profonde : l'état du run est du JSON pur, ce qui le rend aussi sérialisable pour le serveur.
 * Copie récursive plutôt qu'un aller-retour JSON : plusieurs fois plus rapide, ce qui compte pour
 * le solveur d'équilibrage qui applique des centaines de milliers d'actions. Les clés à `undefined`
 * sont omises, comme avec JSON.
 */
export function clone<T>(value: T): T {
  return deepCopy(value) as T;
}

function deepCopy(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = deepCopy(value[i]);
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const k in value as Record<string, unknown>) {
    const v = (value as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = deepCopy(v);
  }
  return out;
}

export class InvalidActionError extends Error {}

type DamageSource = 'spell' | 'burn' | 'collision' | 'attack';

const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'air', 'neutral'];

// ---------------------------------------------------------------------------
// Création du run
// ---------------------------------------------------------------------------

export function createRun(config: RunConfig): RunState {
  const dungeon = getDungeon(config.dungeonId);
  const tranche = getTranche(dungeon.tranche);
  if (!Number.isInteger(config.difficulty) || config.difficulty < MIN_DIFFICULTY || config.difficulty > MAX_DIFFICULTY) {
    throw new InvalidActionError(`Difficulté invalide : ${config.difficulty}`);
  }
  const level = effectiveLevel(config.level ?? tranche.redefinitionLevel, tranche.id);
  const deckError = validateDeck(config.deck, tranche.id, level);
  if (deckError) throw new InvalidActionError(deckError);
  const passiveError = validatePassives(config.passives ?? [], tranche.id, level);
  if (passiveError) throw new InvalidActionError(passiveError);

  const eq = config.equipment;
  const masteries = Object.fromEntries(
    ELEMENTS.map((e) => [e, (config.masteries?.[e] ?? 0) + (eq?.masteries[e] ?? 0)]),
  ) as Record<Element, number>;
  const maxHp = PLAYER_HP + (eq?.hp ?? 0);
  const basePa = BASE_PA + (eq?.pa ?? 0);
  const basePm = BASE_PM + (eq?.pm ?? 0);
  const state: RunState = {
    config: clone(config),
    roomIndex: -1,
    room: { name: '', width: 0, height: 0, tiles: [] },
    units: [],
    player: {
      nextShotAimed: false,
      spellUses: {},
      deck: [...config.deck],
      masteries,
      passives: [...(config.passives ?? [])],
    },
    turn: 0,
    status: 'playing',
    actionLog: [],
  };
  const player: Unit = {
    id: PLAYER_ID,
    team: 'player',
    templateId: 'archer',
    name: 'Archer',
    pos: { x: 0, y: 0 },
    hp: maxHp,
    maxHp,
    pa: basePa,
    pm: basePm,
    basePa,
    basePm,
    pmMalus: 0,
    attackUses: {},
  };
  state.units.push(player);
  enterRoom(state, 0, []);
  return state;
}

function enterRoom(state: RunState, index: number, events: GameEvent[]): void {
  const dungeon = getDungeon(state.config.dungeonId);
  const tpl = dungeon.rooms[index];
  const mult = difficultyMultiplier(state.config.difficulty);
  state.roomIndex = index;
  state.room = { name: tpl.name, width: tpl.tiles[0].length, height: tpl.tiles.length, tiles: [...tpl.tiles] };
  const player = getPlayer(state);
  player.pos = { ...tpl.playerSpawn };
  player.burn = undefined;
  player.pmMalus = 0;
  state.units = [player];
  tpl.monsters.forEach((m, i) => {
    const t = getMonster(m.templateId);
    const hp = Math.round(t.hp * mult);
    state.units.push({
      id: `r${index}-m${i}`,
      team: 'monster',
      templateId: t.id,
      name: t.name,
      pos: { ...m.pos },
      hp,
      maxHp: hp,
      pa: t.pa,
      pm: t.pm,
      basePa: t.pa,
      basePm: t.pm,
      weakness: t.weakness,
      resistance: t.resistance,
      pmMalus: 0,
      isBoss: t.isBoss,
      attackUses: {},
    });
  });
  events.push({ type: 'roomEnter', roomIndex: index, name: tpl.name });
  startPlayerTurn(state, events);
}

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

export function getPlayer(state: RunState): Unit {
  const p = state.units.find((u) => u.id === PLAYER_ID);
  if (!p) throw new Error('Archer introuvable');
  return p;
}

/** Portée en plus donnée par l'équipement aux tirs à distance. */
export function equipmentRange(state: RunState): number {
  return state.config.equipment?.range ?? 0;
}

/** Dégâts fixes ajoutés à chaque coup de sort de l'Archer (pas aux brûlures). */
export function equipmentFlatDamage(state: RunState): number {
  return state.config.equipment?.damage ?? 0;
}

/** Résistance de l'Archer dans un élément, en %, plafonnée à MAX_RESISTANCE. */
export function playerResistance(state: RunState, element: Element): number {
  return Math.max(0, Math.min(MAX_RESISTANCE, state.config.equipment?.resistances?.[element] ?? 0));
}

export function getMonsters(state: RunState): Unit[] {
  return state.units.filter((u) => u.team === 'monster' && u.hp > 0);
}

export function roomCount(state: RunState): number {
  return getDungeon(state.config.dungeonId).rooms.length;
}

/** Cases où le joueur peut se déplacer ce tour, avec le chemin. */
export function getReachableCells(state: RunState): Map<string, Pos[]> {
  const player = getPlayer(state);
  const others = state.units.filter((u) => u.id !== PLAYER_ID);
  const map = reachable(state.room, others, player.pos, player.pm);
  map.delete(key(player.pos));
  return map;
}

/** Raison pour laquelle le sort ne peut pas être lancé (ignorer la cible si `target` est absent), ou null. */
export function getCastError(state: RunState, spellId: string, target?: Pos): string | null {
  if (state.status !== 'playing') return 'Le run est terminé.';
  if (!state.player.deck.includes(spellId)) return 'Ce sort n’est pas dans le deck.';
  const spell = getSpell(spellId);
  const player = getPlayer(state);
  if (player.pa < spellPaCost(spell, state.player.passives)) return 'Pas assez de PA.';
  const uses = state.player.spellUses[spellId] ?? 0;
  if (spell.maxPerTurn !== undefined && uses >= spell.maxPerTurn) return 'Limite d’utilisations atteinte ce tour.';
  if (spell.buffNextShot && state.player.nextShotAimed) return 'Le prochain tir est déjà concentré.';
  if (!target) return null;
  return getTargetError(state, spell, target);
}

function getTargetError(state: RunState, spell: SpellDef, target: Pos): string | null {
  const player = getPlayer(state);
  if (spell.target === 'self') return samePos(target, player.pos) ? null : 'Ce sort se lance sur soi.';
  const d = distance(player.pos, target);
  if (d < spell.minRange || d > spellMaxRange(spell, state.player.passives, equipmentRange(state))) return 'Hors de portée.';
  if (spell.inLine && player.pos.x !== target.x && player.pos.y !== target.y) return 'Ce sort se lance en ligne droite.';
  if (isWall(state.room, target)) return 'Case invalide.';
  if (spell.los && !hasLineOfSight(state.room, state.units, player.pos, target)) return 'Pas de ligne de vue.';
  const occupant = unitAt(state.units, target);
  if (spell.target === 'unit' && (!occupant || occupant.team !== 'monster')) return 'Il faut cibler un ennemi.';
  if (spell.target === 'emptyCell' && occupant) return 'La case doit être libre.';
  return null;
}

/** Cases de la portée du sort, avec l'indication de ligne de vue (pour l'affichage). */
export function getSpellRange(state: RunState, spellId: string): { pos: Pos; los: boolean }[] {
  const spell = getSpell(spellId);
  const player = getPlayer(state);
  if (spell.target === 'self') return [{ pos: player.pos, los: true }];
  const cells: { pos: Pos; los: boolean }[] = [];
  const maxRange = spellMaxRange(spell, state.player.passives, equipmentRange(state));
  for (let y = 0; y < state.room.height; y++) {
    for (let x = 0; x < state.room.width; x++) {
      const p = { x, y };
      const d = distance(player.pos, p);
      if (d < spell.minRange || d > maxRange || isWall(state.room, p)) continue;
      if (spell.inLine && x !== player.pos.x && y !== player.pos.y) continue;
      const los = !spell.los || hasLineOfSight(state.room, state.units, player.pos, p);
      cells.push({ pos: p, los });
    }
  }
  return cells;
}

export function getSpellZone(state: RunState, spellId: string, target: Pos): Pos[] {
  const spell = getSpell(spellId);
  const cells: Pos[] = [target];
  if (spell.zone === 'cross') DIRS.forEach((d) => cells.push({ x: target.x + d.x, y: target.y + d.y }));
  if (spell.zone === 'square') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) cells.push({ x: target.x + dx, y: target.y + dy });
  }
  return cells.filter((c) => !isWall(state.room, c));
}

// ---------------------------------------------------------------------------
// Dégâts
// ---------------------------------------------------------------------------

/**
 * Bonus de distance (fraction : 0,18 = +18 %) d'un sort de l'Archer tiré à `cells` cases.
 * +6 % par case au-delà de 3, plafonné à 5 cases comptées (+30 % à 8 cases ou plus).
 * Un tir visé (Tir concentré) double le bonus. Les passifs peuvent augmenter le bonus par case.
 */
export function distanceBonus(state: RunState, cells: number, aimed = false): number {
  const counted = Math.max(0, Math.min(DISTANCE_BONUS_MAX_CELLS, cells - DISTANCE_BONUS_FROM));
  const perCell = DISTANCE_BONUS_PER_CELL + combinePassives(state.player.passives).distanceBonusPerCell;
  return Math.round(counted * perCell * (aimed ? 2 : 1) * 100) / 100;
}

/** Bonus de distance maximal possible (pour les fiches). */
export function maxDistanceBonus(state: RunState, aimed = false): number {
  return distanceBonus(state, DISTANCE_BONUS_FROM + DISTANCE_BONUS_MAX_CELLS, aimed);
}

export function computeDamage(
  state: RunState,
  base: number,
  element: Element,
  attacker: Unit | null,
  target: Unit,
  /** Bonus multiplicatif en fraction (bonus de distance de l'Archer). */
  bonus = 0,
): number {
  let dmg = base;
  if (attacker?.team === 'player') dmg *= 1 + (state.player.masteries[element] ?? 0) / 100;
  if (attacker?.team === 'monster') dmg *= difficultyMultiplier(state.config.difficulty);
  if (target.team === 'player') dmg *= 1 - playerResistance(state, element) / 100;
  if (element !== 'neutral' && target.weakness === element) dmg *= WEAKNESS_BONUS;
  if (element !== 'neutral' && target.resistance === element) dmg *= RESISTANCE_MALUS;
  if (bonus) dmg *= 1 + bonus;
  return Math.max(0, Math.floor(dmg + 1e-9));
}

function dealDamage(state: RunState, target: Unit, amount: number, element: Element, source: DamageSource, events: GameEvent[]): void {
  if (target.hp <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  events.push({ type: 'damage', unitId: target.id, amount, element, source });
  if (target.hp === 0) {
    events.push({ type: 'death', unitId: target.id });
    if (target.team === 'monster') {
      const pm = combinePassives(state.player.passives).killPm;
      const player = getPlayer(state);
      if (pm && player.hp > 0) {
        player.pm += pm;
        events.push({ type: 'status', unitId: PLAYER_ID, text: `+${pm} PM` });
      }
    }
  }
}

function pushUnit(state: RunState, target: Unit, from: Pos, cells: number, events: GameEvent[]): void {
  const dir = { x: Math.sign(target.pos.x - from.x), y: Math.sign(target.pos.y - from.y) };
  if (dir.x !== 0 && dir.y !== 0) return; // poussée uniquement en ligne
  const start = { ...target.pos };
  for (let i = 0; i < cells; i++) {
    const next = { x: target.pos.x + dir.x, y: target.pos.y + dir.y };
    const blocker = unitAt(state.units, next);
    if (isWall(state.room, next) || blocker) {
      const remaining = cells - i;
      const dmg = COLLISION_DAMAGE_PER_CELL * remaining;
      if (!samePos(start, target.pos)) events.push({ type: 'push', unitId: target.id, from: start, to: { ...target.pos } });
      dealDamage(state, target, dmg, 'neutral', 'collision', events);
      if (blocker) dealDamage(state, blocker, Math.floor(dmg / 2), 'neutral', 'collision', events);
      return;
    }
    target.pos = next;
  }
  events.push({ type: 'push', unitId: target.id, from: start, to: { ...target.pos } });
}

// ---------------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------------

function startPlayerTurn(state: RunState, events: GameEvent[]): void {
  const player = getPlayer(state);
  state.turn += 1;
  player.pa = player.basePa;
  player.pm = Math.max(0, player.basePm - player.pmMalus);
  player.pmMalus = 0;
  state.player.spellUses = {};
  events.push({ type: 'turnStart', unitId: PLAYER_ID, turn: state.turn });
  tickBurn(state, player, events);
  checkEnd(state, events);
}

function tickBurn(state: RunState, unit: Unit, events: GameEvent[]): void {
  if (!unit.burn || unit.hp <= 0) return;
  dealDamage(state, unit, unit.burn.damage, 'fire', 'burn', events);
  unit.burn.turns -= 1;
  if (unit.burn.turns <= 0) unit.burn = undefined;
}

function runMonsterTurns(state: RunState, events: GameEvent[]): void {
  for (const monster of state.units.filter((u) => u.team === 'monster')) {
    if (state.status !== 'playing' || monster.hp <= 0) continue;
    events.push({ type: 'turnStart', unitId: monster.id, turn: state.turn });
    monster.pa = monster.basePa;
    monster.pm = Math.max(0, monster.basePm - monster.pmMalus);
    monster.pmMalus = 0;
    monster.attackUses = {};
    tickBurn(state, monster, events);
    if (monster.hp <= 0) {
      checkEnd(state, events);
      continue;
    }
    const player = getPlayer(state);
    const plan = planMonsterMove(state.room, state.units, monster, player);
    if (plan.path.length) {
      monster.pos = { ...plan.path[plan.path.length - 1] };
      monster.pm -= plan.path.length;
      events.push({ type: 'move', unitId: monster.id, path: plan.path.map((p) => ({ ...p })) });
    }
    const template = getMonster(monster.templateId);
    // Attaques les plus fortes d'abord, tant que les PA le permettent.
    const attacks = [...template.attacks].sort((a, b) => b.damage - a.damage);
    for (const atk of attacks) {
      while (
        state.status === 'playing' &&
        monster.pa >= atk.pa &&
        (monster.attackUses[atk.id] ?? 0) < atk.maxPerTurn &&
        canUseAttack(state.room, state.units, monster.pos, player, atk, monster)
      ) {
        monster.pa -= atk.pa;
        monster.attackUses[atk.id] = (monster.attackUses[atk.id] ?? 0) + 1;
        events.push({ type: 'attack', unitId: monster.id, attackId: atk.id, targetId: player.id });
        dealDamage(state, player, computeDamage(state, atk.damage, atk.element, monster, player), atk.element, 'attack', events);
        applyAttackEffects(state, monster, player, atk, events);
        checkEnd(state, events);
      }
    }
  }
}

/** Effets secondaires d'une attaque de monstre sur le joueur : brûlure, retrait de PM, poussée. */
function applyAttackEffects(state: RunState, monster: Unit, player: Unit, atk: MonsterAttack, events: GameEvent[]): void {
  if (player.hp <= 0) return;
  if (atk.burn) {
    const dmg = computeDamage(state, atk.burn.damage, atk.element, monster, player);
    player.burn = { damage: Math.max(dmg, player.burn?.damage ?? 0), turns: Math.max(atk.burn.turns, player.burn?.turns ?? 0) };
    events.push({ type: 'status', unitId: player.id, text: `Brûlure ${atk.burn.turns} tours` });
  }
  if (atk.pmRemoval) {
    player.pmMalus += atk.pmRemoval;
    events.push({ type: 'status', unitId: player.id, text: `-${atk.pmRemoval} PM` });
  }
  if (atk.push) pushUnit(state, player, monster.pos, atk.push, events);
}

function checkEnd(state: RunState, events: GameEvent[]): void {
  if (state.status !== 'playing') return;
  if (getPlayer(state).hp <= 0) {
    state.status = 'lost';
    events.push({ type: 'lost' });
  }
}

/** Après une action du joueur : salle vidée ? */
function checkRoomCleared(state: RunState, events: GameEvent[]): boolean {
  if (state.status !== 'playing' || getMonsters(state).length > 0) return false;
  events.push({ type: 'roomCleared', roomIndex: state.roomIndex });
  if (state.roomIndex + 1 >= roomCount(state)) {
    state.status = 'won';
    events.push({ type: 'won' });
  } else {
    enterRoom(state, state.roomIndex + 1, events);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Actions du joueur
// ---------------------------------------------------------------------------

/**
 * Applique une action du joueur et retourne le nouvel état (l'état d'entrée n'est pas modifié)
 * ainsi que les événements produits, dans l'ordre. Lève InvalidActionError si l'action est illégale.
 */
export function applyAction(input: RunState, action: Action): { state: RunState; events: GameEvent[] } {
  if (input.status !== 'playing') throw new InvalidActionError('Le run est terminé.');
  const state = clone(input);
  const events: GameEvent[] = [];
  const player = getPlayer(state);

  switch (action.type) {
    case 'move': {
      const path = getReachableCells(state).get(key(action.to));
      if (!path) throw new InvalidActionError('Case inaccessible.');
      player.pos = { ...action.to };
      player.pm -= path.length;
      events.push({ type: 'move', unitId: PLAYER_ID, path: path.map((p) => ({ ...p })) });
      break;
    }
    case 'cast': {
      const err = getCastError(state, action.spellId, action.target);
      if (err) throw new InvalidActionError(err);
      castSpell(state, getSpell(action.spellId), action.target, events);
      checkEnd(state, events);
      checkRoomCleared(state, events);
      break;
    }
    case 'endTurn': {
      runMonsterTurns(state, events);
      // Le dernier monstre peut mourir pendant les tours monstres (brûlure, collision) : la salle est alors vidée.
      if (state.status === 'playing' && !checkRoomCleared(state, events)) startPlayerTurn(state, events);
      break;
    }
    default:
      throw new InvalidActionError('Action inconnue.');
  }

  state.actionLog.push(clone(action));
  return { state, events };
}

function castSpell(state: RunState, spell: SpellDef, target: Pos, events: GameEvent[]): void {
  const player = getPlayer(state);
  player.pa -= spellPaCost(spell, state.player.passives);
  state.player.spellUses[spell.id] = (state.player.spellUses[spell.id] ?? 0) + 1;
  events.push({ type: 'cast', unitId: PLAYER_ID, spellId: spell.id, target: { ...target } });

  if (spell.jump) {
    const from = { ...player.pos };
    player.pos = { ...target };
    events.push({ type: 'jump', unitId: PLAYER_ID, from, to: { ...target } });
  }

  if (spell.buffNextShot) {
    state.player.nextShotAimed = true;
    events.push({ type: 'status', unitId: PLAYER_ID, text: 'Prochain tir visé' });
  }

  if (spell.damage !== undefined) {
    const aimed = state.player.nextShotAimed;
    state.player.nextShotAimed = false;
    const victims = getSpellZone(state, spell.id, target)
      .map((c) => unitAt(state.units, c))
      .filter((u): u is Unit => !!u && u.team === 'monster');
    for (const victim of victims) {
      dealDamage(state, victim, computeDamage(state, spell.damage + equipmentFlatDamage(state), spell.element, player, victim, distanceBonus(state, distance(player.pos, victim.pos), aimed)), spell.element, 'spell', events);
      if (victim.hp <= 0) continue;
      if (spell.burn) {
        const dmg = computeDamage(state, spell.burn.damage, spell.element, player, victim);
        const turns = spell.burn.turns + combinePassives(state.player.passives).burnExtraTurns;
        victim.burn = { damage: Math.max(dmg, victim.burn?.damage ?? 0), turns: Math.max(turns, victim.burn?.turns ?? 0) };
        events.push({ type: 'status', unitId: victim.id, text: `Brûlure ${turns} tours` });
      }
      if (spell.pmRemoval) {
        victim.pmMalus += spell.pmRemoval;
        events.push({ type: 'status', unitId: victim.id, text: `-${spell.pmRemoval} PM` });
      }
      if (spell.push) pushUnit(state, victim, player.pos, spell.push, events);
    }
  }

  if (spell.gainPm) {
    player.pm += spell.gainPm;
    events.push({ type: 'status', unitId: PLAYER_ID, text: `+${spell.gainPm} PM` });
  }
}

/** Utilitaire pour l'affichage : la case est-elle libre ? */
export function isCellFree(state: RunState, p: Pos): boolean {
  return isFree(state.room, state.units, p);
}
