import { getMonster, monsterBehavior, type MonsterAttack } from './data/monsters.js';
import { distance, distanceMap, hasLineOfSight, key, reachable } from './grid.js';
import type { Pos, RoomState, Unit } from './types.js';

export interface MonsterPlan {
  path: Pos[];
}

export function canUseAttack(room: RoomState, units: Unit[], from: Pos, target: Unit, atk: MonsterAttack, self: Unit): boolean {
  const d = distance(from, target.pos);
  if (d < atk.minRange || d > atk.maxRange) return false;
  if (!atk.los) return true;
  // La ligne de vue se calcule comme si le monstre était déjà sur la case `from`.
  const others = units.filter((u) => u.id !== self.id);
  return hasLineOfSight(room, others, from, target.pos);
}

/**
 * IA déterministe, selon le comportement du monstre (voir MonsterBehavior) :
 * - aggressive : rejoindre la case la plus proche d'où une attaque peut toucher le joueur ;
 * - kiter : parmi les cases d'où une attaque touche, prendre la plus éloignée du joueur ;
 * - sentinel : ne jamais bouger.
 * Sans attaque possible ce tour : se rapprocher au maximum. Égalités départagées par l'ordre de parcours (stable).
 */
export function planMonsterMove(room: RoomState, units: Unit[], self: Unit, target: Unit): MonsterPlan {
  const template = getMonster(self.templateId);
  const behavior = monsterBehavior(template);
  if (behavior === 'sentinel') return { path: [] };
  const others = units.filter((u) => u.id !== self.id && u.hp > 0);
  const options = reachable(room, others, self.pos, self.pm);

  let best: Pos[] | null = null;
  let bestDist = -1;
  for (const path of options.values()) {
    const cell = path.length ? path[path.length - 1] : self.pos;
    const usable = template.attacks.some((a) => a.pa <= self.pa && canUseAttack(room, units, cell, target, a, self));
    if (!usable) continue;
    if (behavior === 'kiter') {
      const d = distance(cell, target.pos);
      if (d > bestDist || (d === bestDist && best !== null && path.length < best.length)) {
        best = path;
        bestDist = d;
      }
    } else if (best === null || path.length < best.length) best = path;
  }
  if (best) return { path: best };

  // Pas d'attaque possible ce tour : se rapprocher du joueur.
  const blockers = others.filter((u) => u.team === 'monster');
  const dist = distanceMap(room, target.pos, blockers);
  let bestPath: Pos[] = [];
  let bestScore = dist.get(key(self.pos)) ?? Number.POSITIVE_INFINITY;
  for (const path of options.values()) {
    if (!path.length) continue;
    const cell = path[path.length - 1];
    const score = dist.get(key(cell)) ?? Number.POSITIVE_INFINITY;
    if (score < bestScore || (score === bestScore && path.length < bestPath.length)) {
      bestScore = score;
      bestPath = path;
    }
  }
  return { path: bestPath };
}
