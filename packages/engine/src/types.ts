import type { EquipmentConfig } from './equipment.js';

export type Element = 'fire' | 'water' | 'earth' | 'air' | 'neutral';

export interface Pos {
  x: number;
  y: number;
}

export type Team = 'player' | 'monster';

export interface Burn {
  damage: number;
  turns: number;
}

/** Mécanique de boss annoncée : elle se déclenche au début du prochain tour du monstre. */
export interface Telegraph {
  kind: 'roots' | 'gale' | 'blast';
  /** Cases touchées (racines, explosion). Vide pour le vent, qui pousse tout le monde. */
  cells: Pos[];
  /** Sens de la poussée du vent. */
  dir?: Pos;
}

export interface Unit {
  id: string;
  team: Team;
  templateId: string;
  name: string;
  pos: Pos;
  hp: number;
  maxHp: number;
  pa: number;
  pm: number;
  basePa: number;
  basePm: number;
  weakness?: Element;
  resistance?: Element;
  burn?: Burn;
  /** PM retirés, appliqués au début du prochain tour de l'unité. */
  pmMalus: number;
  isBoss?: boolean;
  /** Utilisations des attaques ce tour (monstres). */
  attackUses: Record<string, number>;
  /** Mécanique de boss annoncée pour son prochain tour (voir data/mechanics.ts). */
  telegraph?: Telegraph;
  /** Nombre de tours joués par le monstre (rythme des mécaniques). */
  turnsPlayed?: number;
  /** Chaleur du Golem de magma (Surchauffe). */
  heat?: number;
  /** Refroidi après une explosion : ne joue pas et subit plus de dégâts jusqu'à son prochain tour. */
  cooled?: boolean;
  /** Tour du joueur où un coup d'Eau a déjà fait baisser la chaleur (une fois par tour). */
  waterTurn?: number;
  /** Œuf : tours restants avant l'éclosion. */
  hatchIn?: number;
}

export interface PlayerState {
  concentration: number;
  nextShotDouble: boolean;
  /** Le joueur a-t-il dépensé des PM pendant son tour précédent ? */
  movedLastTurn: boolean;
  pmSpentThisTurn: number;
  spellUses: Record<string, number>;
  deck: string[];
  masteries: Record<Element, number>;
  /** Passifs équipés (voir data/passives.ts). */
  passives: string[];
}

export interface RoomTemplate {
  name: string;
  /** '.' sol, '#' rocher (bloque déplacement et ligne de vue). */
  tiles: string[];
  playerSpawn: Pos;
  monsters: { templateId: string; pos: Pos }[];
}

export interface RoomState {
  name: string;
  width: number;
  height: number;
  tiles: string[];
}

export type Action =
  | { type: 'move'; to: Pos }
  | { type: 'cast'; spellId: string; target: Pos }
  | { type: 'endTurn' };

export type GameEvent =
  | { type: 'turnStart'; unitId: string; turn: number }
  | { type: 'move'; unitId: string; path: Pos[] }
  | { type: 'jump'; unitId: string; from: Pos; to: Pos }
  | { type: 'push'; unitId: string; from: Pos; to: Pos }
  | { type: 'cast'; unitId: string; spellId: string; target: Pos }
  | { type: 'attack'; unitId: string; attackId: string; targetId: string }
  | { type: 'damage'; unitId: string; amount: number; element: Element; source: 'spell' | 'burn' | 'collision' | 'attack' | 'mechanic' }
  | { type: 'status'; unitId: string; text: string }
  | { type: 'heal'; unitId: string; amount: number }
  | { type: 'spawn'; unitId: string }
  | { type: 'hatch'; unitId: string }
  | { type: 'telegraph'; unitId: string; telegraph: Telegraph }
  | { type: 'mechanic'; unitId: string; kind: 'roots' | 'gale' | 'blast' | 'deathBlast'; cells: Pos[] }
  | { type: 'concentration'; value: number; delta: number }
  | { type: 'death'; unitId: string }
  | { type: 'roomCleared'; roomIndex: number }
  | { type: 'roomEnter'; roomIndex: number; name: string }
  | { type: 'won' }
  | { type: 'lost' };

export type RunStatus = 'playing' | 'won' | 'lost';

export interface RunConfig {
  dungeonId: string;
  difficulty: number;
  deck: string[];
  /** Niveau réel du personnage (défaut : niveau de redéfinition de la tranche du donjon). */
  level?: number;
  masteries?: Partial<Record<Element, number>>;
  /** Bonus de l'équipement porté (voir `EquipmentBonus`), calculés par `equipmentBonus`. Stats absentes = 0. */
  equipment?: EquipmentConfig;
  /** Passifs équipés, limités par les emplacements de la tranche et le niveau effectif. */
  passives?: string[];
}

export interface RunState {
  config: RunConfig;
  roomIndex: number;
  room: RoomState;
  units: Unit[];
  player: PlayerState;
  /** Nombre de tours joués par le joueur (compte pour le classement). */
  turn: number;
  status: RunStatus;
  actionLog: Action[];
}
