import type { Pos, RoomState, Unit } from './types.js';

export const DIRS: Pos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

export function distance(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inBounds(room: RoomState, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < room.width && p.y < room.height;
}

export function isWall(room: RoomState, p: Pos): boolean {
  return !inBounds(room, p) || room.tiles[p.y][p.x] === '#';
}

export function unitAt(units: Unit[], p: Pos): Unit | undefined {
  return units.find((u) => u.hp > 0 && samePos(u.pos, p));
}

export function isFree(room: RoomState, units: Unit[], p: Pos): boolean {
  return !isWall(room, p) && !unitAt(units, p);
}

export function key(p: Pos): string {
  return `${p.x},${p.y}`;
}

/**
 * Ligne de vue entre deux cases. Les rochers et les unités bloquent, sauf sur les
 * cases de départ et d'arrivée. Quand la ligne passe exactement entre deux cases,
 * elle n'est bloquée que si les deux le sont (règle permissive et symétrique).
 */
export function hasLineOfSight(room: RoomState, units: Unit[], from: Pos, to: Pos): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
  if (steps === 0) return true;
  const blocked = (p: Pos) =>
    !samePos(p, from) && !samePos(p, to) && (isWall(room, p) || unitAt(units, p) !== undefined);
  for (let i = 1; i < steps; i++) {
    const fx = from.x + (dx * i) / steps;
    const fy = from.y + (dy * i) / steps;
    const xs = candidates(fx);
    const ys = candidates(fy);
    let allBlocked = true;
    for (const x of xs) {
      for (const y of ys) {
        if (!blocked({ x, y })) allBlocked = false;
      }
    }
    if (allBlocked) return false;
  }
  return true;
}

function candidates(v: number): number[] {
  const frac = v - Math.floor(v);
  if (Math.abs(frac - 0.5) < 1e-9) return [Math.floor(v), Math.ceil(v)];
  return [Math.round(v)];
}

/** Cases atteignables en au plus `maxSteps` pas (4 directions), avec le chemin le plus court. */
export function reachable(room: RoomState, units: Unit[], start: Pos, maxSteps: number): Map<string, Pos[]> {
  const result = new Map<string, Pos[]>();
  result.set(key(start), []);
  let frontier: Pos[] = [start];
  for (let step = 0; step < maxSteps; step++) {
    const next: Pos[] = [];
    for (const p of frontier) {
      const path = result.get(key(p))!;
      for (const d of DIRS) {
        const n = { x: p.x + d.x, y: p.y + d.y };
        if (result.has(key(n)) || !isFree(room, units, n)) continue;
        result.set(key(n), [...path, n]);
        next.push(n);
      }
    }
    frontier = next;
  }
  return result;
}

/** Distance de marche depuis `goal` vers toutes les cases (unités ignorées sauf `blockers`). */
export function distanceMap(room: RoomState, goal: Pos, blockers: Unit[]): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(key(goal), 0);
  let frontier = [goal];
  let d = 0;
  while (frontier.length) {
    d++;
    const next: Pos[] = [];
    for (const p of frontier) {
      for (const dir of DIRS) {
        const n = { x: p.x + dir.x, y: p.y + dir.y };
        if (dist.has(key(n)) || isWall(room, n) || unitAt(blockers, n)) continue;
        dist.set(key(n), d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return dist;
}
