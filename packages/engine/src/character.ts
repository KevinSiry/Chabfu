/**
 * Personnage persistant et progression permanente (GDD sections 4 et 10).
 * Tout est pur et déterministe : l'XP d'un run se recalcule à partir de sa configuration et de sa suite d'actions,
 * ce qui permettra au serveur de la valider comme le score.
 */
import { applyAction, createRun } from './combat.js';
import { getDungeon } from './data/dungeons.js';
import { getMonster } from './data/monsters.js';
import { PASSIVES, type PassiveDef } from './data/passives.js';
import { SPELLS, type SpellDef } from './data/spells.js';
import { difficultyMultiplier } from './loot.js';
import { MAX_LEVEL, TRANCHES, getTranche, type Tranche } from './progression.js';
import type { Action, RunConfig, RunStatus } from './types.js';

// ---------------------------------------------------------------------------
// Courbe d'XP
// ---------------------------------------------------------------------------

/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.round((60 * Math.pow(level, 1.3)) / 10) * 10;
}

/** XP totale nécessaire pour atteindre `level` depuis le niveau 1. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) total += xpToNext(l);
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  let rest = xp;
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level += 1;
  }
  return level;
}

/** Progression dans le niveau courant, pour une barre d'XP. */
export function levelProgress(xp: number): { level: number; into: number; needed: number } {
  const level = levelFromXp(xp);
  return { level, into: xp - totalXpForLevel(level), needed: xpToNext(level) };
}

// ---------------------------------------------------------------------------
// Bilan d'un run
// ---------------------------------------------------------------------------

/**
 * XP de base par PV de base d'un monstre (doublée pour un boss). Les PV des monstres ont baissé de 40 %
 * à l'équilibrage du 2026-11-10 : 1/1,2 au lieu de 1/2 garde le même rythme de montée en niveau.
 */
export const XP_PER_MONSTER_HP = 1 / 1.2;

export function monsterXp(templateId: string): number {
  const m = getMonster(templateId);
  return Math.round(m.hp * XP_PER_MONSTER_HP * (m.isBoss ? 2 : 1));
}

/** Bonus de victoire : 50 % de l'XP des monstres. */
export const VICTORY_XP_BONUS = 0.5;

export interface RunKill {
  unitId: string;
  templateId: string;
  name: string;
  isBoss: boolean;
  xp: number;
}

export interface RunSummary {
  dungeonId: string;
  difficulty: number;
  status: RunStatus;
  turns: number;
  /** Nombre de salles terminées (boss compris en cas de victoire). */
  roomsCleared: number;
  kills: RunKill[];
  xpFromKills: number;
  xpVictoryBonus: number;
  xpTotal: number;
}

/**
 * Rejoue le run et en tire le bilan : monstres vaincus et XP gagnée.
 * L'XP des monstres est multipliée par l'échelle de difficulté (+15 % par palier), comme leurs PV.
 * Un run perdu ou abandonné rapporte l'XP des monstres déjà vaincus, sans bonus de victoire.
 */
export function summarizeRun(config: RunConfig, actions: Action[]): RunSummary {
  let state = createRun(config);
  const kills: RunKill[] = [];
  let roomsCleared = 0;
  const mult = difficultyMultiplier(config.difficulty);
  for (const action of actions) {
    const before = state;
    const res = applyAction(state, action);
    for (const ev of res.events) {
      if (ev.type === 'roomCleared') roomsCleared += 1;
      if (ev.type !== 'death') continue;
      const unit = before.units.find((u) => u.id === ev.unitId) ?? res.state.units.find((u) => u.id === ev.unitId);
      if (!unit || unit.team !== 'monster') continue;
      kills.push({ unitId: unit.id, templateId: unit.templateId, name: unit.name, isBoss: !!unit.isBoss, xp: Math.round(monsterXp(unit.templateId) * mult) });
    }
    state = res.state;
  }
  const xpFromKills = kills.reduce((s, k) => s + k.xp, 0);
  const xpVictoryBonus = state.status === 'won' ? Math.round(xpFromKills * VICTORY_XP_BONUS) : 0;
  return {
    dungeonId: config.dungeonId,
    difficulty: config.difficulty,
    status: state.status,
    turns: state.turn,
    roomsCleared,
    kills,
    xpFromKills,
    xpVictoryBonus,
    xpTotal: xpFromKills + xpVictoryBonus,
  };
}

// ---------------------------------------------------------------------------
// Personnage
// ---------------------------------------------------------------------------

/** Préparation propre à une tranche : chaque tranche a son deck et ses passifs. */
export interface TrancheLoadout {
  deck: string[];
  passives: string[];
}

export interface CharacterStats {
  runs: number;
  wins: number;
  kills: number;
  bossKills: number;
}

export interface Character {
  version: 1;
  name: string;
  /** XP totale accumulée. Le niveau réel en découle. */
  xp: number;
  /** Tranche sur laquelle le personnage est actuellement défini. */
  trancheId: number;
  loadouts: Record<number, TrancheLoadout>;
  stats: CharacterStats;
  createdAt: string;
}

export const DEFAULT_DECK = ['fleche_ardente', 'bond_arriere'];

export function createCharacter(name: string, createdAt: string): Character {
  const clean = name.trim().slice(0, 20);
  if (!clean) throw new Error('Le personnage doit avoir un nom.');
  return {
    version: 1,
    name: clean,
    xp: 0,
    trancheId: 1,
    loadouts: { 1: { deck: [...DEFAULT_DECK], passives: [] } },
    stats: { runs: 0, wins: 0, kills: 0, bossKills: 0 },
    createdAt,
  };
}

export function characterLevel(c: Character): number {
  return levelFromXp(c.xp);
}

/** Niveau auquel le personnage joue sur sa tranche courante (niveau de redéfinition ou niveau réel). */
export function characterEffectiveLevel(c: Character, trancheId = c.trancheId): number {
  return Math.min(characterLevel(c), getTranche(trancheId).redefinitionLevel);
}

/** Se redéfinir sur une tranche : possible sur toute tranche dont le niveau minimum est atteint. */
export function redefine(c: Character, trancheId: number): Character {
  const t = getTranche(trancheId);
  const level = characterLevel(c);
  if (t.minLevel > level) throw new Error(`Niveau ${t.minLevel} requis pour la tranche T${t.id}.`);
  const loadouts = { ...c.loadouts };
  if (!loadouts[trancheId]) loadouts[trancheId] = defaultLoadout(level, t);
  return { ...c, trancheId, loadouts };
}

function defaultLoadout(level: number, t: Tranche): TrancheLoadout {
  const eff = Math.min(level, t.redefinitionLevel);
  return { deck: SPELLS.filter((s) => s.level <= eff).slice(0, t.deckSize).map((s) => s.id), passives: [] };
}

/** Deck et passifs de la tranche courante, débarrassés de tout ce qui n'est plus valide. */
export function currentLoadout(c: Character): TrancheLoadout {
  const t = getTranche(c.trancheId);
  const eff = characterEffectiveLevel(c);
  const l = c.loadouts[c.trancheId] ?? defaultLoadout(characterLevel(c), t);
  const spellOk = new Set(SPELLS.filter((s) => s.level <= eff).map((s) => s.id));
  const passiveOk = new Set(PASSIVES.filter((p) => p.level <= eff).map((p) => p.id));
  const deck = [...new Set(l.deck)].filter((id) => spellOk.has(id)).slice(0, t.deckSize);
  const passives = [...new Set(l.passives)].filter((id) => passiveOk.has(id)).slice(0, t.passiveSlots);
  return { deck, passives };
}

export function setLoadout(c: Character, loadout: TrancheLoadout): Character {
  return { ...c, loadouts: { ...c.loadouts, [c.trancheId]: { deck: [...loadout.deck], passives: [...loadout.passives] } } };
}

/** Configuration de run correspondant au personnage. */
export function characterRunConfig(c: Character, dungeonId: string, difficulty: number): RunConfig {
  const d = getDungeon(dungeonId);
  if (d.tranche !== c.trancheId) throw new Error(`Le donjon ${d.name} appartient à la tranche T${d.tranche}.`);
  const l = currentLoadout(c);
  return { dungeonId, difficulty, deck: l.deck, passives: l.passives, level: characterLevel(c) };
}

export interface LevelUpReport {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  unlockedSpells: SpellDef[];
  unlockedPassives: PassiveDef[];
  unlockedTranches: Tranche[];
}

/** Applique le bilan d'un run : XP (toujours versée au niveau réel, même redéfini) et statistiques. */
export function applyRunSummary(c: Character, summary: RunSummary): { character: Character; report: LevelUpReport } {
  const levelBefore = characterLevel(c);
  const xp = Math.min(c.xp + summary.xpTotal, totalXpForLevel(MAX_LEVEL));
  const levelAfter = levelFromXp(xp);
  const between = <T extends { level: number }>(list: T[]) => list.filter((x) => x.level > levelBefore && x.level <= levelAfter);
  const character: Character = {
    ...c,
    xp,
    stats: {
      runs: c.stats.runs + 1,
      wins: c.stats.wins + (summary.status === 'won' ? 1 : 0),
      kills: c.stats.kills + summary.kills.length,
      bossKills: c.stats.bossKills + summary.kills.filter((k) => k.isBoss).length,
    },
  };
  return {
    character,
    report: {
      xpGained: xp - c.xp,
      levelBefore,
      levelAfter,
      unlockedSpells: between(SPELLS),
      unlockedPassives: between(PASSIVES),
      unlockedTranches: TRANCHES.filter((t) => t.minLevel > levelBefore && t.minLevel <= levelAfter),
    },
  };
}

/** Remet en forme une sauvegarde lue depuis le stockage local ; null si elle est inexploitable. */
export function parseCharacter(raw: unknown): Character | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Character>;
  if (r.version !== 1 || typeof r.name !== 'string' || typeof r.xp !== 'number' || !Number.isFinite(r.xp)) return null;
  const base = createCharacter(r.name || 'Archer', typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString());
  let c: Character = {
    ...base,
    xp: Math.max(0, Math.floor(r.xp)),
    loadouts: { ...base.loadouts, ...(r.loadouts ?? {}) },
    stats: { ...base.stats, ...(r.stats ?? {}) },
  };
  try {
    c = redefine(c, typeof r.trancheId === 'number' ? r.trancheId : 1);
  } catch {
    c = redefine(c, 1);
  }
  return c;
}
