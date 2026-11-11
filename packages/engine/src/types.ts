import type { EquipmentConfig } from './equipment.js';
import type { ChallengeId, ChallengeProgress } from './challenges.js';

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
}

export interface PlayerState {
  /** Tir concentré actif : le prochain sort de dégâts double son bonus de distance. */
  nextShotAimed: boolean;
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
  | { type: 'damage'; unitId: string; amount: number; element: Element; source: 'spell' | 'burn' | 'collision' | 'attack' }
  | { type: 'status'; unitId: string; text: string }
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
  /** Graine des défis de combat, tirée au lancement du run (voir challenges.ts). Absente : pas de défi. */
  challengeSeed?: number;
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
  /** Défi tiré pour chaque salle (vide sans graine). */
  challengeIds?: ChallengeId[];
  /** Suivi des défis des salles déjà ouvertes. */
  challenges?: ChallengeProgress[];
}
