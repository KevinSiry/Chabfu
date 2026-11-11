import { describe, expect, it } from 'vitest';
import {
  MECHANICS,
  applyAction,
  computeDamage,
  createMonsterUnit,
  createRun,
  getPlayer,
  type Pos,
  type RunState,
  type Unit,
} from '../src/index.js';

const DECKS: Record<string, string[]> = {
  bosquet_des_ronces: ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'],
  caldeira_des_cendres: ['fleche_givree', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'],
};

/** Salle vide 10×10 avec l'Archer et les monstres donnés ; les monstres « figés » n'avancent ni n'attaquent. */
function arena(dungeonId: string, player: Pos, monsters: { id: string; pos: Pos; frozen?: boolean }[], walls: Pos[] = []): RunState {
  const s = createRun({ dungeonId, difficulty: 1, deck: DECKS[dungeonId] ?? DECKS.bosquet_des_ronces });
  const tiles = Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => (walls.some((w) => w.x === x && w.y === y) ? '#' : '.')).join(''));
  s.room = { name: 'test', width: 10, height: 10, tiles };
  const p = getPlayer(s);
  p.pos = { ...player };
  s.units = [p];
  monsters.forEach((m, i) => {
    const u = createMonsterUnit(s, m.id, `t${i}`, m.pos);
    if (m.frozen) {
      u.basePa = 0;
      u.basePm = 0;
    }
    s.units.push(u);
  });
  return s;
}

const endTurn = (s: RunState) => applyAction(s, { type: 'endTurn' });
const unit = (s: RunState, id: string) => s.units.find((u) => u.id === id) as Unit;

describe('Gardien racineux : Racines', () => {
  it('marque la case de l’Archer et ses voisines, puis frappe au tour suivant si l’Archer y reste', () => {
    let s = arena('bosquet_des_ronces', { x: 5, y: 5 }, [{ id: 'gardien_racineux', pos: { x: 0, y: 0 }, frozen: true }]);
    s = endTurn(s).state;
    const t = unit(s, 't0').telegraph!;
    expect(t.kind).toBe('roots');
    expect(t.cells).toHaveLength(5);
    const hp = getPlayer(s).hp;
    const r = endTurn(s);
    expect(r.events.some((e) => e.type === 'mechanic' && e.kind === 'roots')).toBe(true);
    expect(getPlayer(r.state).hp).toBe(hp - MECHANICS.roots.damage);
    expect(getPlayer(r.state).pm).toBe(getPlayer(r.state).basePm - MECHANICS.roots.pmRemoval);
    // Un tour sur deux : pas de nouvelle annonce juste après l'éruption.
    expect(unit(r.state, 't0').telegraph).toBeUndefined();
  });

  it('ne touche pas l’Archer qui a quitté les cases marquées', () => {
    let s = arena('bosquet_des_ronces', { x: 5, y: 5 }, [{ id: 'gardien_racineux', pos: { x: 0, y: 0 }, frozen: true }]);
    s = endTurn(s).state;
    s = applyAction(s, { type: 'move', to: { x: 7, y: 5 } }).state;
    const hp = getPlayer(s).hp;
    expect(getPlayer(endTurn(s).state).hp).toBe(hp);
  });
});

describe('Reine Batracienne : Ponte', () => {
  it('pond un œuf à son 2e tour, qui éclot en Crapaud 2 tours plus tard', () => {
    let s = arena('tourbiere_des_noyes', { x: 9, y: 9 }, [{ id: 'reine_batracienne', pos: { x: 0, y: 0 }, frozen: true }]);
    s = endTurn(s).state;
    expect(s.units.filter((u) => u.hp > 0)).toHaveLength(2);
    s = endTurn(s).state;
    const egg = s.units.find((u) => u.templateId === 'oeuf_batracien')!;
    expect(egg).toBeDefined();
    expect(egg.hatchIn).toBe(MECHANICS.brood.hatchTurns);
    s = endTurn(s).state;
    expect(unit(s, egg.id).templateId).toBe('oeuf_batracien');
    const r = endTurn(s);
    expect(r.events.some((e) => e.type === 'hatch')).toBe(true);
    const born = unit(r.state, egg.id);
    expect(born.templateId).toBe('crapaud_vaseux');
    expect(born.hatchIn).toBeUndefined();
    expect(born.hp).toBe(born.maxHp);
  });
});

describe('Golem de magma : Surchauffe', () => {
  it('chauffe, annonce son explosion, explose puis refroidit en subissant +50 % de dégâts', () => {
    let s = arena('caldeira_des_cendres', { x: 4, y: 3 }, [{ id: 'golem_magma', pos: { x: 3, y: 3 }, frozen: true }]);
    s = endTurn(s).state;
    expect(unit(s, 't0').heat).toBe(2);
    s = endTurn(s).state;
    expect(unit(s, 't0').heat).toBe(4);
    expect(unit(s, 't0').telegraph?.kind).toBe('blast');
    const hp = getPlayer(s).hp;
    s = endTurn(s).state;
    const golem = unit(s, 't0');
    expect(getPlayer(s).hp).toBe(hp - computeDamage(s, MECHANICS.overheat.damage, 'fire', golem, getPlayer(s)));
    expect(golem.cooled).toBe(true);
    expect(golem.heat).toBe(0);
    const normal = computeDamage(s, 20, 'water', getPlayer(s), { ...golem, cooled: false });
    expect(computeDamage(s, 20, 'water', getPlayer(s), golem)).toBe(Math.floor(normal * 1.5));
    s = endTurn(s).state;
    expect(unit(s, 't0').cooled).toBeUndefined();
    expect(unit(s, 't0').heat).toBe(2);
  });

  it('un coup d’Eau fait baisser la chaleur de 1, une seule fois par tour', () => {
    let s = arena('caldeira_des_cendres', { x: 0, y: 3 }, [{ id: 'golem_magma', pos: { x: 4, y: 3 }, frozen: true }]);
    s = endTurn(s).state;
    s = applyAction(s, { type: 'cast', spellId: 'fleche_givree', target: { x: 4, y: 3 } }).state;
    expect(unit(s, 't0').heat).toBe(1);
  });
});

describe('Harpie matriarche : Grand vent', () => {
  it('annonce un sens puis pousse l’Archer de 2 cases contre un obstacle', () => {
    let s = arena('falaises_hurlantes', { x: 5, y: 5 }, [{ id: 'harpie_matriarche', pos: { x: 0, y: 0 }, frozen: true }], [{ x: 6, y: 5 }]);
    s = endTurn(s).state;
    const t = unit(s, 't0').telegraph!;
    expect(t.kind).toBe('gale');
    expect(t.dir).toEqual({ x: 1, y: 0 }); // le rocher juste à droite : collision maximale
    const hp = getPlayer(s).hp;
    s = endTurn(s).state;
    expect(getPlayer(s).pos).toEqual({ x: 5, y: 5 });
    expect(getPlayer(s).hp).toBe(hp - 2 * 8);
  });
});

describe('traits des monstres', () => {
  it('Haie d’épines : un monstre collé à un Ronceau subit moitié moins de dégâts', () => {
    const s = arena('bosquet_des_ronces', { x: 0, y: 0 }, [
      { id: 'guepe', pos: { x: 5, y: 5 } },
      { id: 'ronceau', pos: { x: 5, y: 6 } },
    ]);
    const guepe = unit(s, 't0');
    const alone = arena('bosquet_des_ronces', { x: 0, y: 0 }, [{ id: 'guepe', pos: { x: 5, y: 5 } }]);
    const full = computeDamage(alone, 20, 'fire', getPlayer(alone), unit(alone, 't0'));
    expect(computeDamage(s, 20, 'fire', getPlayer(s), guepe)).toBe(Math.floor(full / 2));
  });

  it('Vol de vie : la Sangsue se soigne des dégâts infligés', () => {
    const s = arena('tourbiere_des_noyes', { x: 5, y: 5 }, [{ id: 'sangsue_geante', pos: { x: 5, y: 6 } }]);
    unit(s, 't0').hp = 10;
    const r = endTurn(s);
    const dealt = getPlayer(s).hp - getPlayer(r.state).hp;
    expect(dealt).toBeGreaterThan(0);
    expect(unit(r.state, 't0').hp).toBe(10 + dealt);
  });

  it('Explosive : la Salamandre tuée blesse les unités autour d’elle', () => {
    const s = arena('caldeira_des_cendres', { x: 0, y: 5 }, [
      { id: 'salamandre', pos: { x: 4, y: 5 } },
      { id: 'golem_scorie', pos: { x: 5, y: 5 } },
    ]);
    unit(s, 't0').hp = 1;
    const before = unit(s, 't1').hp;
    const r = applyAction(s, { type: 'cast', spellId: 'fleche_givree', target: { x: 4, y: 5 } });
    expect(r.events.some((e) => e.type === 'mechanic' && e.kind === 'deathBlast')).toBe(true);
    expect(unit(r.state, 't1').hp).toBeLessThan(before);
  });

  it('Charognard : le Vautour frappe +50 % sous la moitié des PV de l’Archer', () => {
    const s = arena('falaises_hurlantes', { x: 0, y: 0 }, [{ id: 'vautour', pos: { x: 5, y: 5 } }]);
    const v = unit(s, 't0');
    const p = getPlayer(s);
    const full = computeDamage(s, 10, 'air', v, p);
    const low = computeDamage(s, 10, 'air', v, { ...p, hp: Math.floor(p.maxHp / 2) - 1 });
    expect(low).toBe(Math.floor(full * 1.5));
  });
});

describe('mécaniques et défis', () => {
  it('détruire un œuf ne fait pas rater « Le chef d’abord »', () => {
    const s = arena('tourbiere_des_noyes', { x: 0, y: 5 }, [
      { id: 'reine_batracienne', pos: { x: 9, y: 9 }, frozen: true },
      { id: 'oeuf_batracien', pos: { x: 4, y: 5 } },
    ]);
    s.challenges = [{ id: 'chef', roomIndex: s.roomIndex, status: 'active', targetId: 't0', startTurn: 0, turns: 1, pmSpent: 0, hpLost: 0, elements: [], killsThisTurn: 0 }];
    unit(s, 't1').hp = 1;
    const r = applyAction(s, { type: 'cast', spellId: 'fleche_ardente', target: { x: 4, y: 5 } });
    expect(unit(r.state, 't1').hp).toBe(0);
    expect(r.state.challenges![0].status).toBe('active');
  });
});
