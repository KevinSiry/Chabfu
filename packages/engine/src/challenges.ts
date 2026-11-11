/**
 * Défis de combat : un défi par salle, annoncé à l'entrée de la salle. Chaque défi réussi ajoute un pourcentage
 * d'XP et de loot à la fin du run.
 *
 * Aucun aléatoire en combat : les défis sont tirés avec `RunConfig.challengeSeed` (fixée au lancement du run),
 * puis suivis à partir des événements du moteur. Le replay retrouve donc exactement les mêmes défis et le même
 * résultat. Sans graine, le run n'a pas de défi (solveur, anciens replays).
 */
import { getDungeon } from './data/dungeons.js';
import { getMonster } from './data/monsters.js';
import { getSpell } from './data/spells.js';
import { distance } from './grid.js';
import { seededRandom } from './loot.js';
import type { Action, Element, GameEvent, RunConfig, RunState, Unit } from './types.js';

/** Identifiant de l'archer (PLAYER_ID de combat.ts, recopié pour éviter un import circulaire). */
const PLAYER = 'archer';

export type ChallengeId =
  | 'distances'
  | 'arc_en_ciel'
  | 'elan'
  | 'egratigne'
  | 'chef'
  | 'fin_brulante'
  | 'racines'
  | 'intouchable'
  | 'double';

export type ChallengeTier = 1 | 2 | 3;

export interface ChallengeDef {
  id: ChallengeId;
  name: string;
  tier: ChallengeTier;
  /** Bonus d'XP et de loot si le défi est réussi (0,05 = +5 %). */
  bonus: number;
  /** Icône courte affichée dans le HUD. */
  icon: string;
}

export const CHALLENGE_TIERS: Record<ChallengeTier, { label: string; bonus: number }> = {
  1: { label: 'Facile', bonus: 0.05 },
  2: { label: 'Moyen', bonus: 0.1 },
  3: { label: 'Difficile', bonus: 0.15 },
};

const def = (id: ChallengeId, name: string, tier: ChallengeTier, icon: string): ChallengeDef => ({
  id,
  name,
  tier,
  bonus: CHALLENGE_TIERS[tier].bonus,
  icon,
});

export const CHALLENGES: ChallengeDef[] = [
  def('distances', 'Garde tes distances', 1, '↔'),
  def('arc_en_ciel', 'Arc-en-ciel', 1, '◈'),
  def('elan', 'Élan', 1, '»'),
  def('egratigne', 'Égratigné', 2, '♥'),
  def('chef', 'Le chef d’abord', 2, '♛'),
  def('fin_brulante', 'Fin brûlante', 2, '✸'),
  def('racines', 'Racines', 3, '⚓'),
  def('intouchable', 'Intouchable', 3, '◆'),
  def('double', 'Doublé', 3, '✕✕'),
];

export function getChallenge(id: ChallengeId): ChallengeDef {
  const c = CHALLENGES.find((x) => x.id === id);
  if (!c) throw new Error(`Défi inconnu : ${id}`);
  return c;
}

/** Part maximale de PV perdus pour « Égratigné ». */
export const EGRATIGNE_MAX_HP_LOSS = 0.3;
/** PM dépensés au plus pour « Racines ». */
export const RACINES_MAX_PM = 3;
/** Éléments différents à toucher pour « Arc-en-ciel ». */
export const ARC_EN_CIEL_ELEMENTS = 3;

/**
 * Tours accordés pour « Élan » : un par monstre de la salle, plus 3 (plus 6 dans la salle du boss).
 * Calibré au bot (beam 16, deck feu-poussée) : il vide les salles en 3-4, 3-6 et 5-8 tours de D1 à D5,
 * soit 2 à 3 tours de marge pour un humain dans les deux premières salles et 1 à 4 au boss.
 */
export function elanTurnLimit(monsterCount: number, bossRoom: boolean): number {
  return monsterCount + (bossRoom ? 6 : 3);
}

export type ChallengeStatus = 'active' | 'success' | 'failed';

/** Suivi d'un défi de salle (stocké dans l'état du run). */
export interface ChallengeProgress {
  id: ChallengeId;
  roomIndex: number;
  status: ChallengeStatus;
  /** Monstre à abattre en premier (« Le chef d'abord »). */
  targetId?: string;
  /** Limite de tours (« Élan »). */
  turnLimit?: number;
  /** Tours joués avant la salle (le premier tour de la salle est startTurn + 1). */
  startTurn: number;
  /** Tour en cours dans la salle (1 au premier tour). */
  turns: number;
  pmSpent: number;
  hpLost: number;
  elements: Element[];
  killsThisTurn: number;
}

// ---------------------------------------------------------------------------
// Tirage
// ---------------------------------------------------------------------------

function deckElements(deck: string[]): Set<Element> {
  const out = new Set<Element>();
  for (const id of deck) {
    const s = getSpell(id);
    if (s.damage !== undefined && s.element !== 'neutral') out.add(s.element);
  }
  return out;
}

function eligible(id: ChallengeId, config: RunConfig, monsterCount: number): boolean {
  switch (id) {
    case 'arc_en_ciel':
      return deckElements(config.deck).size >= ARC_EN_CIEL_ELEMENTS;
    case 'fin_brulante':
      return config.deck.some((s) => {
        const sp = getSpell(s);
        return sp.damage !== undefined && (!!sp.burn || !!sp.push);
      });
    case 'chef':
    case 'double':
      return monsterCount >= 2;
    default:
      return true;
  }
}

/**
 * Défis du run, un par salle, tirés avec la graine du run parmi ceux faisables avec le deck, sans doublon.
 * Retourne une liste vide sans graine.
 */
export function pickChallenges(config: RunConfig): ChallengeId[] {
  if (config.challengeSeed === undefined) return [];
  const rng = seededRandom(config.challengeSeed);
  const rooms = getDungeon(config.dungeonId).rooms;
  const used = new Set<ChallengeId>();
  return rooms.map((room) => {
    let pool = CHALLENGES.filter((c) => !used.has(c.id) && eligible(c.id, config, room.monsters.length));
    if (!pool.length) pool = CHALLENGES.filter((c) => !used.has(c.id));
    const pick = pool[Math.floor(rng() * pool.length)].id;
    used.add(pick);
    return pick;
  });
}

// ---------------------------------------------------------------------------
// Suivi
// ---------------------------------------------------------------------------

/** Démarre le défi de la salle courante (appelé par le moteur à l'entrée de chaque salle). */
export function startRoomChallenge(state: RunState): void {
  const id = state.challengeIds?.[state.roomIndex];
  if (!id) return;
  const monsters = state.units.filter((u) => u.team === 'monster');
  const p: ChallengeProgress = {
    id,
    roomIndex: state.roomIndex,
    status: 'active',
    startTurn: state.turn,
    turns: 1,
    pmSpent: 0,
    hpLost: 0,
    elements: [],
    killsThisTurn: 0,
  };
  if (id === 'chef') {
    // Le chef : le monstre le plus résistant de la salle (le premier en cas d'égalité).
    const target = [...monsters].sort((a, b) => b.maxHp - a.maxHp)[0];
    p.targetId = target?.id;
  }
  if (id === 'elan') {
    const bossRoom = state.roomIndex === getDungeon(state.config.dungeonId).rooms.length - 1;
    p.turnLimit = elanTurnLimit(monsters.length, bossRoom);
  }
  state.challenges = [...(state.challenges ?? []), p];
}

/** Défi de la salle courante, s'il y en a un. */
export function currentChallenge(state: RunState): ChallengeProgress | undefined {
  return state.challenges?.find((c) => c.roomIndex === state.roomIndex);
}

const fail = (p: ChallengeProgress) => {
  if (p.status === 'active') p.status = 'failed';
};
const succeed = (p: ChallengeProgress) => {
  if (p.status === 'active') p.status = 'success';
};

/** Défis qui ne se valident qu'en accomplissant quelque chose (sinon ratés à la fin de la salle). */
const NEEDS_FEAT: ChallengeId[] = ['arc_en_ciel', 'fin_brulante', 'double'];

/**
 * Met à jour les défis à partir d'une action du joueur et des événements qu'elle a produits.
 * `before` est l'état juste avant l'action (positions de fin de tour), `state` l'état après (modifié ici).
 */
export function trackChallenges(before: RunState, state: RunState, action: Action, events: GameEvent[]): void {
  if (!state.challenges?.length) return;
  const byRoom = (i: number) => state.challenges!.find((c) => c.roomIndex === i);
  let room = before.roomIndex;
  let p = byRoom(room);

  // Fin de tour : le joueur ne doit pas rester au contact d'un ennemi.
  if (action.type === 'endTurn' && p?.id === 'distances') {
    const pl = before.units.find((u) => u.team === 'player')!;
    if (before.units.some((u) => u.team === 'monster' && u.hp > 0 && distance(u.pos, pl.pos) === 1)) fail(p);
  }

  const units = new Map<string, Unit>();
  for (const u of before.units) units.set(u.id, u);
  let lastDamage = new Map<string, GameEvent & { type: 'damage' }>();

  for (const ev of events) {
    switch (ev.type) {
      case 'roomCleared': {
        if (p) {
          if (NEEDS_FEAT.includes(p.id)) fail(p);
          else succeed(p);
        }
        break;
      }
      case 'roomEnter': {
        room = ev.roomIndex;
        p = byRoom(room);
        for (const u of state.units) units.set(u.id, u);
        lastDamage = new Map();
        break;
      }
      case 'lost': {
        if (p) fail(p);
        break;
      }
      case 'turnStart': {
        if (!p || ev.unitId !== PLAYER) break;
        p.turns = ev.turn - p.startTurn;
        p.killsThisTurn = 0;
        if (p.id === 'elan' && p.turnLimit !== undefined && p.turns > p.turnLimit) fail(p);
        break;
      }
      case 'move': {
        if (!p || ev.unitId !== PLAYER) break;
        p.pmSpent += ev.path.length;
        if (p.id === 'racines' && p.pmSpent > RACINES_MAX_PM) fail(p);
        break;
      }
      case 'damage': {
        lastDamage.set(ev.unitId, ev);
        if (!p) break;
        const u = units.get(ev.unitId);
        if (ev.unitId === PLAYER || u?.team === 'player') {
          if (ev.amount <= 0) break;
          p.hpLost += ev.amount;
          if (p.id === 'intouchable') fail(p);
          if (p.id === 'egratigne') {
            const maxHp = state.units.find((x) => x.team === 'player')?.maxHp ?? 1;
            if (p.hpLost >= maxHp * EGRATIGNE_MAX_HP_LOSS) fail(p);
          }
        } else if (ev.source === 'spell' && ev.element !== 'neutral' && !p.elements.includes(ev.element)) {
          p.elements.push(ev.element);
          if (p.id === 'arc_en_ciel' && p.elements.length >= ARC_EN_CIEL_ELEMENTS) succeed(p);
        }
        break;
      }
      case 'death': {
        if (!p) break;
        const u = units.get(ev.unitId);
        if (!u || u.team !== 'monster') break;
        // Œufs de la Reine : à détruire, ils ne comptent ni pour « Le chef d'abord » ni pour « Doublé ».
        if (getMonster(u.templateId).hatchInto) break;
        const cause = lastDamage.get(ev.unitId)?.source;
        // Morts causées par les monstres eux-mêmes (grand vent, collision pendant leur tour) : sans effet sur le chef.
        const byMonsters = action.type === 'endTurn' && (cause === 'collision' || cause === 'mechanic');
        if (p.id === 'chef' && p.status === 'active' && !byMonsters) {
          if (ev.unitId === p.targetId) succeed(p);
          else fail(p);
        }
        p.killsThisTurn += 1;
        if (p.id === 'double' && p.killsThisTurn >= 2) succeed(p);
        const src = lastDamage.get(ev.unitId)?.source;
        if (p.id === 'fin_brulante' && (src === 'burn' || src === 'collision')) succeed(p);
        break;
      }
      default:
        break;
    }
  }
}

/** Bonus total (0,25 = +25 %) des défis réussis. */
export function challengeBonus(progress: ChallengeProgress[] | undefined): number {
  return Math.round((progress ?? []).reduce((s, p) => s + (p.status === 'success' ? getChallenge(p.id).bonus : 0), 0) * 100) / 100;
}

/** Texte de règle d'un défi, avec les chiffres de la salle quand on les connaît. */
export function describeChallenge(p: Pick<ChallengeProgress, 'id' | 'turnLimit'>, targetName?: string): string {
  switch (p.id) {
    case 'distances':
      return 'Ne finis aucun tour au contact d’un ennemi.';
    case 'arc_en_ciel':
      return `Touche avec ${ARC_EN_CIEL_ELEMENTS} éléments différents.`;
    case 'elan':
      return `Vide la salle en ${p.turnLimit ?? '?'} tours ou moins.`;
    case 'egratigne':
      return `Perds moins de ${Math.round(EGRATIGNE_MAX_HP_LOSS * 100)} % de tes PV.`;
    case 'chef':
      return `Abats ${targetName ?? 'le monstre couronné'} en premier.`;
    case 'fin_brulante':
      return 'Achève un monstre par brûlure ou collision.';
    case 'racines':
      return `Dépense ${RACINES_MAX_PM} PM au plus dans la salle.`;
    case 'intouchable':
      return 'Ne subis aucun dégât.';
    case 'double':
      return 'Vaincs deux ennemis dans le même tour.';
  }
}

/** Avancement chiffré d'un défi en cours, pour le HUD (ex. « 2/3 PM »). */
export function challengeCounter(p: ChallengeProgress, maxHp: number): string | null {
  switch (p.id) {
    case 'elan':
      return `Tour ${Math.min(p.turns, (p.turnLimit ?? 0) + 1)}/${p.turnLimit}`;
    case 'racines':
      return `${p.pmSpent}/${RACINES_MAX_PM} PM`;
    case 'arc_en_ciel':
      return `${p.elements.length}/${ARC_EN_CIEL_ELEMENTS}`;
    case 'egratigne':
      return `${Math.round((p.hpLost / maxHp) * 100)} %/${Math.round(EGRATIGNE_MAX_HP_LOSS * 100)} %`;
    default:
      return null;
  }
}
