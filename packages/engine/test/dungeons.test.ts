import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createRun,
  DUNGEONS,
  dungeonsForTranche,
  getBossDropTable,
  getMonster,
  getMonsters,
  getPlayer,
  isWall,
  key,
  monsterBehavior,
  type Pos,
  type RoomState,
  type RunState,
} from '../src/index.js';
import { planMonsterMove } from '../src/ai.js';

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function floodFill(room: RoomState, start: Pos): Set<string> {
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (isWall(room, n) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen;
}

function edit(state: RunState, mutate: (s: RunState) => void): RunState {
  const s = JSON.parse(JSON.stringify(state)) as RunState;
  mutate(s);
  return s;
}

/** Remplace la salle courante par une salle vide avec le joueur et un seul monstre aux positions données. */
function duel(dungeonId: string, templateId: string, player: Pos, monster: Pos, tiles?: string[]): RunState {
  const base = createRun({ dungeonId, difficulty: 1, deck: ['fleche_ardente'] });
  return edit(base, (s) => {
    const rows = tiles ?? Array.from({ length: 9 }, () => '.........');
    s.room = { name: 'test', width: rows[0].length, height: rows.length, tiles: rows };
    const t = getMonster(templateId);
    const m = s.units.find((u) => u.team === 'monster')!;
    Object.assign(m, { templateId, name: t.name, hp: t.hp, maxHp: t.hp, pa: t.pa, pm: t.pm, basePa: t.pa, basePm: t.pm, weakness: t.weakness, resistance: t.resistance, pos: monster, isBoss: t.isBoss });
    s.units = [getPlayer(s), m];
    getPlayer(s).pos = player;
  });
}

describe('donjons : données', () => {
  it('la tranche 1 propose plusieurs donjons aux dominantes et faiblesses différentes', () => {
    const t1 = dungeonsForTranche(1);
    expect(t1.length).toBeGreaterThanOrEqual(3);
    expect(new Set(t1.map((d) => d.dominantElement)).size).toBe(t1.length);
    expect(new Set(t1.map((d) => d.weakElement)).size).toBe(t1.length);
    expect(new Set(DUNGEONS.map((d) => d.id)).size).toBe(DUNGEONS.length);
  });

  for (const d of DUNGEONS) {
    describe(d.name, () => {
      it('1 à 2 salles puis une salle de boss, un seul boss et seulement à la fin', () => {
        expect(d.rooms.length).toBeGreaterThanOrEqual(2);
        expect(d.rooms.length).toBeLessThanOrEqual(3);
        d.rooms.forEach((r, i) => {
          const bosses = r.monsters.filter((m) => getMonster(m.templateId).isBoss).length;
          expect(bosses, `${r.name}`).toBe(i === d.rooms.length - 1 ? 1 : 0);
        });
      });

      it('salles cohérentes : grille rectangulaire, apparitions sur le sol, toutes atteignables', () => {
        for (const r of d.rooms) {
          const width = r.tiles[0].length;
          expect(r.tiles.every((row) => row.length === width && /^[.#]+$/.test(row)), r.name).toBe(true);
          const room: RoomState = { name: r.name, width, height: r.tiles.length, tiles: r.tiles };
          const cells = [r.playerSpawn, ...r.monsters.map((m) => m.pos)];
          expect(new Set(cells.map(key)).size, `${r.name} : apparitions en double`).toBe(cells.length);
          for (const c of cells) expect(isWall(room, c), `${r.name} ${key(c)}`).toBe(false);
          const zone = floodFill(room, r.playerSpawn);
          for (const m of r.monsters) expect(zone.has(key(m.pos)), `${r.name} : ${m.templateId} inaccessible`).toBe(true);
        }
      });

      it('le boss a une table de drop', () => {
        expect(getBossDropTable(d.id).length).toBeGreaterThan(0);
      });

      it('la plupart des monstres craignent l’élément annoncé', () => {
        const all = d.rooms.flatMap((r) => r.monsters.map((m) => getMonster(m.templateId)));
        const weak = all.filter((m) => m.weakness === d.weakElement).length;
        expect(weak / all.length).toBeGreaterThan(0.5);
        const boss = all.find((m) => m.isBoss)!;
        expect(boss.weakness).toBe(d.weakElement);
        expect(boss.resistance).not.toBe(d.weakElement);
      });

      it.each([1, 10])('les monstres jouent sans erreur (difficulté %i)', (difficulty) => {
        let s = createRun({ dungeonId: d.id, difficulty, deck: ['fleche_ardente'] });
        for (let i = 0; i < 30 && s.status === 'playing'; i++) s = applyAction(s, { type: 'endTurn' }).state;
        expect(getPlayer(s).hp).toBeLessThan(getPlayer(s).maxHp);
      });
    });
  }
});

describe('monstres : comportements', () => {
  it('une sentinelle ne bouge jamais', () => {
    const s = duel('caldeira_des_cendres', 'brasero_vivant', { x: 0, y: 0 }, { x: 8, y: 8 });
    expect(monsterBehavior(getMonster('brasero_vivant'))).toBe('sentinel');
    const m = getMonsters(s)[0];
    expect(planMonsterMove(s.room, s.units, { ...m, pm: 5 }, getPlayer(s)).path).toEqual([]);
  });

  it('un tireur attaque depuis la case la plus éloignée possible', () => {
    // Crapaud collé au joueur : il recule à 4 cases (sa portée max) au lieu de rester au contact.
    const s = duel('tourbiere_des_noyes', 'crapaud_vaseux', { x: 4, y: 4 }, { x: 5, y: 4 });
    const m = getMonsters(s)[0];
    const path = planMonsterMove(s.room, s.units, m, getPlayer(s)).path;
    const end = path[path.length - 1];
    expect(Math.abs(end.x - 4) + Math.abs(end.y - 4)).toBe(4);
  });

  it('un agressif rejoint la case d’attaque la plus proche', () => {
    const s = duel('tourbiere_des_noyes', 'sangsue_geante', { x: 0, y: 4 }, { x: 3, y: 4 });
    const m = getMonsters(s)[0];
    expect(planMonsterMove(s.room, s.units, m, getPlayer(s)).path).toEqual([
      { x: 2, y: 4 },
      { x: 1, y: 4 },
    ]);
  });

  it('les braises passent par-dessus les rochers et brûlent le joueur', () => {
    const tiles = ['.....', '.....', '..#..', '.....', '.....'];
    let s = duel('caldeira_des_cendres', 'brasero_vivant', { x: 2, y: 4 }, { x: 2, y: 0 }, tiles);
    s = applyAction(s, { type: 'endTurn' }).state;
    const p = getPlayer(s);
    // 8 dégâts de braises, puis la brûlure (3) tombe au début du tour du joueur.
    expect(p.hp).toBe(150 - 8 - 3);
    expect(p.burn).toEqual({ damage: 3, turns: 1 });
  });

  it('la langue gluante retire 1 PM au joueur pour son tour suivant', () => {
    let s = duel('tourbiere_des_noyes', 'crapaud_vaseux', { x: 0, y: 4 }, { x: 4, y: 4 });
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(getPlayer(s).hp).toBe(150 - 8);
    expect(getPlayer(s).pm).toBe(2);
  });

  it('la rafale repousse le joueur, avec collision contre un rocher', () => {
    const tiles = ['#........', '.........', '.........'];
    let s = duel('falaises_hurlantes', 'harpie', { x: 2, y: 0 }, { x: 4, y: 0 }, tiles);
    s = applyAction(s, { type: 'endTurn' }).state;
    const p = getPlayer(s);
    // Poussé d'une case vers la gauche, le rocher arrête la seconde : 8 + 8 de collision.
    expect(p.pos).toEqual({ x: 1, y: 0 });
    expect(p.hp).toBe(150 - 8 - 8);
  });

  it('la salle se vide si le dernier monstre meurt de brûlure pendant son tour', () => {
    let s = duel('caldeira_des_cendres', 'brasero_vivant', { x: 0, y: 0 }, { x: 8, y: 8 });
    s = edit(s, (st) => {
      const m = getMonsters(st)[0];
      m.hp = 2;
      m.burn = { damage: 5, turns: 1 };
    });
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(s.roomIndex).toBe(1);
  });
});

describe('donjons : budget comparable au Bosquet des Ronces', () => {
  // Garde-fou grossier en attendant le solveur d'équilibrage : PV totaux des monstres à ±25 % du donjon de référence.
  const totalHp = (id: string) =>
    DUNGEONS.find((d) => d.id === id)!.rooms.reduce((sum, r) => sum + r.monsters.reduce((a, m) => a + getMonster(m.templateId).hp, 0), 0);
  const ref = totalHp('bosquet_des_ronces');
  for (const d of dungeonsForTranche(1)) {
    it(d.name, () => {
      expect(totalHp(d.id) / ref).toBeGreaterThan(0.75);
      expect(totalHp(d.id) / ref).toBeLessThan(1.25);
    });
  }
});
