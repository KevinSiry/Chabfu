import type { Element } from '../types.js';
import { BOSQUET_DES_RONCES_MONSTERS } from './monsters/bosquet-des-ronces.js';
import { CALDEIRA_DES_CENDRES_MONSTERS } from './monsters/caldeira-des-cendres.js';
import { FALAISES_HURLANTES_MONSTERS } from './monsters/falaises-hurlantes.js';
import { TOURBIERE_DES_NOYES_MONSTERS } from './monsters/tourbiere-des-noyes.js';

export interface MonsterAttack {
  id: string;
  name: string;
  element: Element;
  damage: number;
  pa: number;
  minRange: number;
  maxRange: number;
  /** false : tir en cloche, passe par-dessus les obstacles et les unités. */
  los: boolean;
  maxPerTurn: number;
  /** PM retirés au joueur pour son prochain tour. */
  pmRemoval?: number;
  /** Brûlure infligée au joueur (dégâts au début de ses tours). */
  burn?: { damage: number; turns: number };
  /** Pousse le joueur en ligne droite (seulement si attaquant et joueur sont alignés). Collision contre un obstacle. */
  push?: number;
}

/**
 * Comportement d'IA (déterministe) :
 * - aggressive : rejoint la case la plus proche d'où il peut frapper, sinon fonce vers le joueur (défaut) ;
 * - kiter : attaque depuis la case la plus éloignée possible du joueur, sinon s'approche ;
 * - sentinel : ne se déplace jamais, tire depuis sa case.
 */
export type MonsterBehavior = 'aggressive' | 'kiter' | 'sentinel';

export interface MonsterTemplate {
  id: string;
  name: string;
  hp: number;
  pa: number;
  pm: number;
  weakness: Element;
  resistance: Element;
  isBoss?: boolean;
  behavior?: MonsterBehavior;
  /** Couleur d'affichage provisoire (rendu canvas). */
  color?: string;
  /** Une phrase pour le joueur : ce que fait le monstre et comment le gérer. */
  description?: string;
  attacks: MonsterAttack[];
}

/** Chaque donjon déclare ses monstres dans son propre fichier (data/monsters/<donjon>.ts). */
export const MONSTERS: MonsterTemplate[] = [
  ...BOSQUET_DES_RONCES_MONSTERS,
  ...TOURBIERE_DES_NOYES_MONSTERS,
  ...CALDEIRA_DES_CENDRES_MONSTERS,
  ...FALAISES_HURLANTES_MONSTERS,
];

const BY_ID = new Map(MONSTERS.map((m) => [m.id, m]));

export function getMonster(id: string): MonsterTemplate {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Monstre inconnu : ${id}`);
  return m;
}

export function monsterBehavior(t: MonsterTemplate): MonsterBehavior {
  return t.behavior ?? 'aggressive';
}
