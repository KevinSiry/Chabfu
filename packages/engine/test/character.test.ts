import { describe, expect, it } from 'vitest';
import {
  applyAction,
  difficultyMultiplier,
  applyRunSummary,
  characterLevel,
  characterRunConfig,
  createCharacter,
  createRun,
  currentLoadout,
  getCastError,
  getMonsters,
  getPlayer,
  getSpellRange,
  levelFromXp,
  levelProgress,
  monsterXp,
  parseCharacter,
  redefine,
  setLoadout,
  summarizeRun,
  totalXpForLevel,
  validatePassives,
  verifyRun,
  xpToNext,
  type Action,
  type RunConfig,
  type RunState,
} from '../src/index.js';

const DECK = ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'];
const base: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK };

function edit(state: RunState, mutate: (s: RunState) => void): RunState {
  const s = JSON.parse(JSON.stringify(state)) as RunState;
  mutate(s);
  return s;
}

describe('courbe d’XP', () => {
  it('est croissante et cohérente', () => {
    expect(xpToNext(1)).toBe(60);
    for (let l = 1; l < 99; l++) expect(xpToNext(l + 1)).toBeGreaterThanOrEqual(xpToNext(l));
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(59)).toBe(1);
    expect(levelFromXp(60)).toBe(2);
    expect(levelFromXp(totalXpForLevel(20))).toBe(20);
    expect(levelFromXp(totalXpForLevel(20) - 1)).toBe(19);
    expect(levelFromXp(1e12)).toBe(100);
    expect(levelProgress(70)).toEqual({ level: 2, into: 10, needed: xpToNext(2) });
  });
});

describe('passifs', () => {
  it('respecte les emplacements et les niveaux', () => {
    expect(validatePassives([], 1, 1)).toBeNull();
    expect(validatePassives(['instinct_du_chasseur'], 1, 20)).toBeNull();
    expect(validatePassives(['instinct_du_chasseur', 'patience'], 1, 20)).toBeNull();
    expect(validatePassives(['instinct_du_chasseur', 'patience', 'braises'], 1, 20)).toMatch(/2 emplacements/);
    expect(validatePassives(['instinct_du_chasseur', 'patience'], 2, 40)).toBeNull();
    expect(validatePassives(['sang_froid'], 1, 19)).toMatch(/indisponible/);
    expect(() => createRun({ ...base, passives: ['patience', 'sang_froid', 'braises'] })).toThrow();
  });

  it('Réception agile annule la perte de Concentration de Bond arrière', () => {
    const prep = (passives: string[]) =>
      edit(createRun({ ...base, passives }), (s) => {
        s.player.concentration = 3;
        getPlayer(s).pos = { x: 3, y: 3 };
      });
    const target = { x: 5, y: 3 };
    expect(applyAction(prep([]), { type: 'cast', spellId: 'bond_arriere', target }).state.player.concentration).toBe(2);
    expect(applyAction(prep(['reception_agile']), { type: 'cast', spellId: 'bond_arriere', target }).state.player.concentration).toBe(3);
  });

  it('Sang-froid réduit le coût de Tir concentré', () => {
    const s = edit(createRun({ ...base, passives: ['sang_froid'] }), (st) => (st.player.concentration = 3));
    expect(getCastError(s, 'tir_concentre')).toBeNull();
    const after = applyAction(s, { type: 'cast', spellId: 'tir_concentre', target: getPlayer(s).pos }).state;
    expect(after.player.concentration).toBe(0);
    const without = edit(createRun(base), (st) => (st.player.concentration = 3));
    expect(getCastError(without, 'tir_concentre')).toMatch(/Concentration/);
  });

  it('Œil perçant allonge la portée des tirs, pas celle de Bond arrière', () => {
    const range = (passives: string[], spell: string) => Math.max(...getSpellRange(createRun({ ...base, deck: [...DECK.slice(0, 4), 'fleche_du_vent'], passives }), spell).map((c) => Math.abs(c.pos.x - 1) + Math.abs(c.pos.y - 3)));
    expect(range(['oeil_percant'], 'fleche_du_vent')).toBe(range([], 'fleche_du_vent') + 1);
    expect(range(['oeil_percant'], 'bond_arriere')).toBe(2);
  });

  it('Instinct du chasseur donne de la Concentration à chaque monstre achevé', () => {
    const prep = (passives: string[]) =>
      edit(createRun({ ...base, passives }), (s) => {
        getPlayer(s).pos = { x: 4, y: 1 };
        const m = s.units.find((u) => u.id === 'r0-m0')!;
        m.hp = 1;
      });
    const act: Action = { type: 'cast', spellId: 'fleche_ardente', target: { x: 8, y: 1 } };
    const a = applyAction(prep([]), act).state.player.concentration;
    const b = applyAction(prep(['instinct_du_chasseur']), act).state.player.concentration;
    expect(b).toBe(a + 1);
  });

  it('Pointes incendiaires prolonge la brûlure', () => {
    const s = edit(createRun({ ...base, passives: ['pointes_incendiaires'] }), (st) => (getPlayer(st).pos = { x: 4, y: 1 }));
    const after = applyAction(s, { type: 'cast', spellId: 'fleche_ardente', target: { x: 8, y: 1 } }).state;
    expect(after.units.find((u) => u.id === 'r0-m0')!.burn?.turns).toBe(3);
  });
});

describe('bilan de run et XP', () => {
  it('compte les monstres vaincus et l’XP, avec l’échelle de difficulté', () => {
    // Bot glouton : tire sur le premier monstre atteignable, sinon passe son tour.
    const play = (cfg: RunConfig) => {
      let s = createRun(cfg);
      const actions: Action[] = [];
      let deaths = 0;
      for (let i = 0; i < 400 && s.status === 'playing'; i++) {
        let action: Action = { type: 'endTurn' };
        for (const spellId of cfg.deck) {
          const m = getMonsters(s).find((u) => !getCastError(s, spellId, u.pos));
          if (m) {
            action = { type: 'cast', spellId, target: m.pos };
            break;
          }
        }
        const res = applyAction(s, action);
        deaths += res.events.filter((e) => e.type === 'death' && e.unitId !== 'archer').length;
        actions.push(action);
        s = res.state;
      }
      return { actions, deaths, s };
    };
    const cfg: RunConfig = { ...base, deck: ['fleche_ardente', 'fleche_givree', 'fleche_du_vent'] };
    const r1 = play(cfg);
    const s1 = summarizeRun(cfg, r1.actions);
    expect(r1.deaths).toBeGreaterThan(0);
    expect(s1.kills.length).toBe(r1.deaths);
    expect(s1.status).toBe(r1.s.status);
    expect(s1.xpFromKills).toBe(s1.kills.reduce((a, k) => a + k.xp, 0));
    expect(s1.xpVictoryBonus).toBe(s1.status === 'won' ? Math.round(s1.xpFromKills / 2) : 0);
    expect(s1.kills[0].xp).toBe(s1.kills[0].templateId === 'guepe' ? 14 : 20);
    // Même run en difficulté 3 : l'XP suit l'échelle de difficulté.
    const r5 = play({ ...cfg, difficulty: 3 });
    const s5 = summarizeRun({ ...cfg, difficulty: 3 }, r5.actions);
    expect(s5.kills[0].xp).toBe(Math.round(monsterXp(s5.kills[0].templateId) * difficultyMultiplier(3)));
  });

  it('applique l’XP au personnage et liste les déblocages', () => {
    const c = createCharacter('  Kevin  ', '2026-11-10T00:00:00.000Z');
    expect(c.name).toBe('Kevin');
    expect(characterLevel(c)).toBe(1);
    const summary = { dungeonId: 'bosquet_des_ronces', difficulty: 1, status: 'won' as const, turns: 10, roomsCleared: 3, kills: [{ unitId: 'x', templateId: 'gardien_racineux', name: 'G', isBoss: true, xp: 170 }], xpFromKills: 170, xpVictoryBonus: 85, challenges: [], challengeBonus: 0, xpChallengeBonus: 0, xpTotal: 255 };
    const { character, report } = applyRunSummary(c, summary);
    expect(report.levelBefore).toBe(1);
    expect(report.levelAfter).toBe(levelFromXp(255));
    expect(report.unlockedSpells.map((s) => s.id)).toContain('fleche_fracassante');
    expect(character.stats).toEqual({ runs: 1, wins: 1, kills: 1, bossKills: 1 });
  });
});

describe('personnage', () => {
  it('un niveau 1 ne peut jouer que ses sorts débloqués', () => {
    const c = createCharacter('A', 'x');
    const cfg = characterRunConfig(c, 'bosquet_des_ronces', 1);
    expect(cfg.deck).toEqual(['fleche_ardente', 'bond_arriere']);
    expect(cfg.level).toBe(1);
    expect(() => createRun(cfg)).not.toThrow();
    expect(() => createRun({ ...cfg, deck: ['fleche_givree'] })).toThrow(/indisponible/);
  });

  it('se redéfinit et garde un deck par tranche', () => {
    let c = { ...createCharacter('A', 'x'), xp: totalXpForLevel(45) };
    expect(() => redefine(c, 4)).toThrow();
    c = redefine(c, 2);
    expect(c.trancheId).toBe(2);
    expect(currentLoadout(c).deck.length).toBe(7);
    c = setLoadout(c, { deck: ['fleche_ardente'], passives: ['patience', 'sang_froid'] });
    c = redefine(c, 1);
    expect(currentLoadout(c).deck).toEqual(['fleche_ardente', 'bond_arriere']);
    c = redefine(c, 2);
    expect(currentLoadout(c)).toEqual({ deck: ['fleche_ardente'], passives: ['patience', 'sang_froid'] });
    c = redefine(c, 1);
    c = setLoadout(c, { deck: DECK, passives: ['patience', 'sang_froid', 'braises'] });
    // Deux cases de passif en T1 : le surplus est ignoré.
    expect(currentLoadout(c).passives).toEqual(['patience', 'sang_froid']);
  });

  it('relit une sauvegarde et rejette les données corrompues', () => {
    const c = { ...createCharacter('A', 'x'), xp: 500 };
    expect(parseCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(parseCharacter(null)).toBeNull();
    expect(parseCharacter({ version: 2 })).toBeNull();
    expect(parseCharacter({ ...c, trancheId: 5 })?.trancheId).toBe(1);
  });
});

describe('run complet', () => {
  it('l’XP d’un run se recalcule depuis le replay', () => {
    // On joue « tour passé » jusqu'à la défaite : aucun monstre tué, aucune XP, run perdu.
    let s = createRun(base);
    const actions: Action[] = [];
    for (let i = 0; i < 60 && s.status === 'playing'; i++) {
      actions.push({ type: 'endTurn' });
      s = applyAction(s, { type: 'endTurn' }).state;
    }
    expect(s.status).toBe('lost');
    const summary = summarizeRun(base, actions);
    expect(summary.status).toBe('lost');
    expect(summary.xpTotal).toBe(0);
    expect(verifyRun(base, actions, s.turn).valid).toBe(false);
    expect(getMonsters(s).length).toBeGreaterThan(0);
  });
});
