import { describe, expect, it } from 'vitest';
import { applyAction, createRun, getCastError, getPlayer, type GameEvent, type RunConfig, type RunState } from '../src/index.js';

/** Bosquet des Ronces, salle 1 : l'Archer part de (1,3), la ligne y = 3 est libre. */
function setup(deck: string[], mutate: (s: RunState) => void, passives: string[] = []): RunState {
  const cfg: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck, passives };
  const s = JSON.parse(JSON.stringify(createRun(cfg))) as RunState;
  // Monstres rangés loin de la ligne de tir, sans faiblesse ni résistance, PV larges.
  s.units.slice(1).forEach((u, i) => {
    u.pos = { x: 9, y: i };
    u.weakness = undefined;
    u.resistance = undefined;
    u.hp = u.maxHp = 500;
  });
  mutate(s);
  return s;
}

const spellHits = (events: GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { type: 'damage' }> => e.type === 'damage' && e.source === 'spell');

describe('sorts par élément', () => {
  it('Ressac touche 3 cases en ligne et ralentit chaque cible', () => {
    const s = setup(['ressac'], (st) => {
      st.units[1].pos = { x: 3, y: 3 };
      st.units[2].pos = { x: 5, y: 3 };
      st.units[3].pos = { x: 6, y: 3 };
    });
    const res = applyAction(s, { type: 'cast', spellId: 'ressac', target: { x: 3, y: 3 } });
    expect(spellHits(res.events).map((e) => e.unitId)).toEqual([s.units[1].id, s.units[2].id]);
    expect(res.state.units[1].pmMalus).toBe(1);
    expect(res.state.units[3].pmMalus).toBe(0);
  });

  it('Tir perforant touche tous les ennemis alignés', () => {
    const s = setup(['tir_perforant'], (st) => {
      st.units[1].pos = { x: 3, y: 3 };
      st.units[2].pos = { x: 6, y: 3 };
    });
    const res = applyAction(s, { type: 'cast', spellId: 'tir_perforant', target: { x: 3, y: 3 } });
    expect(spellHits(res.events)).toHaveLength(2);
  });

  it('Tir de recul fait reculer l’Archer d’une case', () => {
    const s = setup(['tir_de_recul'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
    });
    const res = applyAction(s, { type: 'cast', spellId: 'tir_de_recul', target: { x: 4, y: 3 } });
    expect(getPlayer(res.state).pos).toEqual({ x: 0, y: 3 });
  });

  it('Flèche rocheuse double ses dégâts contre un obstacle derrière la cible', () => {
    const free = setup(['fleche_rocheuse'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
    });
    const blocked = setup(['fleche_rocheuse'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[2].pos = { x: 5, y: 3 };
    });
    const a = spellHits(applyAction(free, { type: 'cast', spellId: 'fleche_rocheuse', target: { x: 4, y: 3 } }).events)[0].amount;
    const b = spellHits(applyAction(blocked, { type: 'cast', spellId: 'fleche_rocheuse', target: { x: 4, y: 3 } }).events)[0].amount;
    expect(a).toBe(12);
    expect(b).toBe(24);
  });

  it('Embrasement fait éclater la brûlure restante (+50 %)', () => {
    const s = setup(['embrasement'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[1].burn = { damage: 4, turns: 2 };
    });
    const res = applyAction(s, { type: 'cast', spellId: 'embrasement', target: { x: 4, y: 3 } });
    const total = res.events.filter((e) => e.type === 'damage').reduce((n, e) => n + (e.type === 'damage' ? e.amount : 0), 0);
    expect(total).toBe(6 + 12);
    expect(res.state.units[1].burn).toBeUndefined();
  });

  it('Pic de glace frappe plus fort une cible ralentie', () => {
    const s = setup(['pic_de_glace'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[1].pmMalus = 1;
    });
    expect(spellHits(applyAction(s, { type: 'cast', spellId: 'pic_de_glace', target: { x: 4, y: 3 } }).events)[0].amount).toBe(19);
  });

  it('Flèche du zénith ignore la ligne de vue', () => {
    const s = setup(['fleche_du_zenith'], (st) => {
      st.units[1].pos = { x: 6, y: 3 };
      st.units[2].pos = { x: 3, y: 3 }; // bloque la ligne de vue
    });
    expect(getCastError(s, 'fleche_du_zenith', { x: 6, y: 3 })).toBeNull();
    const res = applyAction(s, { type: 'cast', spellId: 'fleche_du_zenith', target: { x: 6, y: 3 } });
    expect(res.events.some((e) => e.type === 'damage' && e.source === 'spell')).toBe(true);
  });

  it('Roulade déplace d’une case sans PM', () => {
    const s = setup(['roulade'], () => {});
    const res = applyAction(s, { type: 'cast', spellId: 'roulade', target: { x: 2, y: 3 } });
    expect(getPlayer(res.state).pos).toEqual({ x: 2, y: 3 });
    expect(getPlayer(res.state).pm).toBe(getPlayer(s).pm);
  });
});

describe('passifs élémentaires', () => {
  it('Braises : +20 % des sorts Feu sur une cible qui brûle', () => {
    const s = setup(['tison'], (st) => {
      st.units[1].pos = { x: 3, y: 3 };
      st.units[1].burn = { damage: 3, turns: 1 };
    }, ['braises']);
    expect(spellHits(applyAction(s, { type: 'cast', spellId: 'tison', target: { x: 3, y: 3 } }).events)[0].amount).toBe(4);
    const s2 = setup(['fleche_ardente'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[1].burn = { damage: 3, turns: 1 };
    }, ['braises']);
    expect(spellHits(applyAction(s2, { type: 'cast', spellId: 'fleche_ardente', target: { x: 4, y: 3 } }).events)[0].amount).toBe(14);
  });

  it('Eaux dormantes : +25 % sur une cible gelée', () => {
    const s = setup(['fleche_givree'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[1].pmMalus = st.units[1].basePm;
    }, ['eaux_dormantes']);
    expect(spellHits(applyAction(s, { type: 'cast', spellId: 'fleche_givree', target: { x: 4, y: 3 } }).events)[0].amount).toBe(11);
  });

  it('Socle : collisions +50 %', () => {
    const s = setup(['fleche_fracassante'], (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[2].pos = { x: 5, y: 3 };
    }, ['socle']);
    const res = applyAction(s, { type: 'cast', spellId: 'fleche_fracassante', target: { x: 4, y: 3 } });
    const col = res.events.filter((e) => e.type === 'damage' && e.source === 'collision');
    expect(col.map((e) => (e.type === 'damage' ? e.amount : 0))).toEqual([24, 12]);
  });

  it('Vent arrière : +1 PM pour un sort Air à 5 cases ou plus, une fois par tour', () => {
    const s = setup(['fleche_du_vent'], (st) => {
      st.units[1].pos = { x: 6, y: 3 };
    }, ['vent_arriere']);
    const pm = getPlayer(s).pm;
    const once = applyAction(s, { type: 'cast', spellId: 'fleche_du_vent', target: { x: 6, y: 3 } }).state;
    expect(getPlayer(once).pm).toBe(pm + 1);
    const twice = applyAction(once, { type: 'cast', spellId: 'fleche_du_vent', target: { x: 6, y: 3 } }).state;
    expect(getPlayer(twice).pm).toBe(pm + 1);
  });
});
