import type { Element, RoomTemplate } from '../types.js';
import { BOSQUET_DES_RONCES } from './dungeons/bosquet-des-ronces.js';
import { CALDEIRA_DES_CENDRES } from './dungeons/caldeira-des-cendres.js';
import { FALAISES_HURLANTES } from './dungeons/falaises-hurlantes.js';
import { TOURBIERE_DES_NOYES } from './dungeons/tourbiere-des-noyes.js';

export interface DungeonDef {
  id: string;
  name: string;
  tranche: number;
  /** Élément des attaques des monstres et thème du donjon. */
  dominantElement: Element;
  /** Élément que craignent la plupart des monstres : oriente le deck optimal. */
  weakElement: Element;
  description: string;
  /**
   * Réglage de la courbe de difficulté propre au donjon (PV et dégâts des monstres), en plus de `difficultyMultiplier` :
   * `mid` s'ajoute à partir de la D4, `high` monte de la D8 à la D10 (plein effet en D10). 0,1 = +10 %.
   * Sert à caler chaque donjon sur les cibles (D5 perdue sans stuff, D10 serrée avec un stuff presque parfait).
   */
  difficultyCurve: { mid: number; high: number };
  rooms: RoomTemplate[];
}

/** Chaque donjon est décrit dans son propre fichier (data/dungeons/<donjon>.ts). */
export const DUNGEONS: DungeonDef[] = [BOSQUET_DES_RONCES, TOURBIERE_DES_NOYES, CALDEIRA_DES_CENDRES, FALAISES_HURLANTES];

const BY_ID = new Map(DUNGEONS.map((d) => [d.id, d]));

export function getDungeon(id: string): DungeonDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Donjon inconnu : ${id}`);
  return d;
}

export function dungeonsForTranche(tranche: number): DungeonDef[] {
  return DUNGEONS.filter((d) => d.tranche === tranche);
}
