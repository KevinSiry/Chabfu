import { describe, expect, it } from 'vitest';
import {
  applyAction,
  availableTranches,
  compareScores,
  computeDamage,
  createRun,
  dropRate,
  effectiveLevel,
  getCastError,
  getMonsters,
  getPlayer,
  hasLineOfSight,
  InvalidActionError,
  replayRun,
  validateDeck,
  verifyRun,
  type Action,
  type RunConfig,
  type RunState,
} from '../src/index.js';

const DECK = ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'];
const config: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK };

function withUnits(state: RunState, mutate: (s: RunState) => void): RunState {
  const s = JSON.parse(JSON.stringify(state)) as RunState;
  mutate(s);
  return s;
}

describe('progression', () => {
  it('redéfinit un niveau 65 en T1 au niveau 20', () => {
    expect(effectiveLevel(65, 1)).toBe(20);
    expect(effectiveLevel(65, 4)).toBe(65);
    expect(availableTranches(65).map((t) => t.id)).toEqual([1, 2, 3, 4]);
    expect(() => effectiveLevel(15, 2)).toThrow();
  });

  it('valide la taille du deck et les niveaux de déblocage', () => {
    expect(validateDeck(DECK, 1, 20)).toBeNull();
    expect(validateDeck([...DECK, 'fleche_givree'], 1, 20)).toMatch(/limité à 5/);
    expect(validateDeck(['coup_de_pied'], 1, 10)).toMatch(/indisponible/);
  });
});

describe('loot', () => {
  it('suit la règle de drop par difficulté de référence', () => {
    expect(dropRate(0.1, 4, 4)).toBeCloseTo(0.1);
    expect(dropRate(0.1, 4, 6)).toBeCloseTo(0.15);
    expect(dropRate(0.1, 4, 3)).toBeCloseTo(0.01);
    expect(dropRate(0.1, 4, 2)).toBe(0);
  });
});

describe('combat', () => {
  it('crée le run dans la première salle', () => {
    const s = createRun(config);
    expect(s.turn).toBe(1);
    expect(s.roomIndex).toBe(0);
    expect(getMonsters(s)).toHaveLength(3);
    expect(getPlayer(s).pa).toBe(6);
  });

  it('refuse un deck trop grand ou une difficulté invalide', () => {
    expect(() => createRun({ ...config, deck: [...DECK, 'fleche_givree'] })).toThrow(InvalidActionError);
    expect(() => createRun({ ...config, difficulty: 11 })).toThrow(InvalidActionError);
  });

  it('applique faiblesse, résistance et difficulté', () => {
    const s = createRun(config);
    const ronceau = getMonsters(s)[0]; // faible Feu, résiste Terre
    const player = getPlayer(s);
    expect(computeDamage(s, 10, 'fire', player, ronceau)).toBe(13);
    expect(computeDamage(s, 10, 'earth', player, ronceau)).toBe(8);
    expect(computeDamage(s, 10, 'fire', player, ronceau, true)).toBe(26);
    const hard = createRun({ ...config, difficulty: 3 });
    expect(computeDamage(hard, 10, 'neutral', getMonsters(hard)[0], getPlayer(hard))).toBe(13);
    expect(getMonsters(hard)[0].maxHp).toBe(31); // Ronceau : 24 PV × 1,3
  });

  it('le déplacement coûte 1 Concentration par PM', () => {
    let s = withUnits(createRun(config), (st) => (st.player.concentration = 5));
    s = applyAction(s, { type: 'move', to: { x: 1, y: 1 } }).state;
    expect(getPlayer(s).pm).toBe(1);
    expect(s.player.concentration).toBe(3);
  });

  it('+1 Concentration au début du tour si le joueur n’a pas bougé', () => {
    let s = createRun(config);
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(s.player.concentration).toBe(1);
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(s.player.concentration).toBe(2);
  });

  it('Tir concentré double le prochain tir et consomme 4 Concentration', () => {
    let s = withUnits(createRun(config), (st) => {
      st.player.concentration = 4;
      st.units[1].pos = { x: 6, y: 3 }; // ronceau à 5 cases, en ligne de vue
    });
    expect(getCastError(s, 'tir_concentre', getPlayer(s).pos)).toBeNull();
    s = applyAction(s, { type: 'cast', spellId: 'tir_concentre', target: getPlayer(s).pos }).state;
    expect(s.player.concentration).toBe(0);
    const res = applyAction(s, { type: 'cast', spellId: 'fleche_ardente', target: { x: 6, y: 3 } });
    const dmg = res.events.find((e) => e.type === 'damage');
    expect(dmg && dmg.type === 'damage' && dmg.amount).toBe(Math.floor(12 * 1.3 * 2));
    expect(res.state.player.concentration).toBe(1); // tir à 5 cases
    expect(res.state.player.nextShotDouble).toBe(false);
  });

  it('Flèche fracassante pousse et inflige des dégâts de collision', () => {
    let s = withUnits(createRun(config), (st) => {
      st.units[1].pos = { x: 5, y: 3 };
      st.units[2].pos = { x: 7, y: 3 }; // bloque après 1 case
    });
    const res = applyAction(s, { type: 'cast', spellId: 'fleche_fracassante', target: { x: 5, y: 3 } });
    const pushed = res.state.units[1];
    expect(pushed.pos).toEqual({ x: 6, y: 3 });
    const collisions = res.events.filter((e) => e.type === 'damage' && e.source === 'collision');
    expect(collisions).toHaveLength(2); // poussé + monstre heurté
  });

  it('les rochers bloquent la ligne de vue', () => {
    const s = createRun(config);
    expect(hasLineOfSight(s.room, [], { x: 0, y: 4 }, { x: 3, y: 4 })).toBe(false); // rocher en (1,4)
    expect(hasLineOfSight(s.room, [], { x: 0, y: 3 }, { x: 5, y: 3 })).toBe(true);
  });

  it('refuse une action illégale', () => {
    const s = createRun(config);
    expect(() => applyAction(s, { type: 'move', to: { x: 9, y: 9 } })).toThrow(InvalidActionError);
    expect(() => applyAction(s, { type: 'cast', spellId: 'fleche_givree', target: { x: 8, y: 1 } })).toThrow(/deck/);
  });

  it('n’altère pas l’état d’entrée', () => {
    const s = createRun(config);
    const before = JSON.stringify(s);
    applyAction(s, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('les monstres approchent et attaquent le joueur', () => {
    let s = createRun(config);
    for (let i = 0; i < 4; i++) s = applyAction(s, { type: 'endTurn' }).state;
    expect(getPlayer(s).hp).toBeLessThan(150);
  });
});

/** Joueur automatique simple : tire sur le monstre le plus faible possible, sinon recule ou attend. */
function autoPlay(cfg: RunConfig, maxActions = 400): { state: RunState; actions: Action[] } {
  let s = createRun(cfg);
  const actions: Action[] = [];
  const order = ['tir_concentre', 'fleche_ardente', 'fleche_fracassante', 'coup_de_pied'];
  while (s.status === 'playing' && actions.length < maxActions) {
    let acted = false;
    for (const spellId of order) {
      const player = getPlayer(s);
      const targets = spellId === 'tir_concentre' ? [player] : getMonsters(s).sort((a, b) => a.hp - b.hp);
      for (const t of targets) {
        if (getCastError(s, spellId, t.pos) === null) {
          const a: Action = { type: 'cast', spellId, target: t.pos };
          s = applyAction(s, a).state;
          actions.push(a);
          acted = true;
          break;
        }
      }
      if (acted) break;
    }
    if (!acted) {
      const a: Action = { type: 'endTurn' };
      s = applyAction(s, a).state;
      actions.push(a);
    }
  }
  return { state: s, actions };
}

describe('replay', () => {
  it('un run complet est reproductible et validable', () => {
    const { state, actions } = autoPlay(config);
    const replayed = replayRun(config, actions);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(state));
    if (state.status === 'won') {
      expect(verifyRun(config, actions, state.turn)).toEqual({ valid: true });
      expect(verifyRun(config, actions, state.turn - 1).valid).toBe(false);
    } else {
      expect(verifyRun(config, actions, state.turn).valid).toBe(false);
    }
  });

  it('rejette un replay contenant une action illégale', () => {
    const r = verifyRun(config, [{ type: 'move', to: { x: 9, y: 9 } }], 1);
    expect(r.valid).toBe(false);
  });

  it('classe par difficulté, puis tours, puis chrono', () => {
    const scores = [
      { dungeonId: 'd', difficulty: 3, turns: 10, timeMs: 90000 },
      { dungeonId: 'd', difficulty: 5, turns: 14, timeMs: 120000 },
      { dungeonId: 'd', difficulty: 3, turns: 10, timeMs: 80000 },
      { dungeonId: 'd', difficulty: 3, turns: 9, timeMs: 150000 },
    ].sort(compareScores);
    expect(scores.map((x) => [x.difficulty, x.turns, x.timeMs])).toEqual([
      [5, 14, 120000],
      [3, 9, 150000],
      [3, 10, 80000],
      [3, 10, 90000],
    ]);
  });
});
