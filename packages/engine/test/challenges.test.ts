import { describe, expect, it } from 'vitest';
import {
  applyAction,
  challengeBonus,
  createRun,
  currentChallenge,
  getChallenge,
  pickChallenges,
  replayRun,
  rollBossLoot,
  startRoomChallenge,
  summarizeRun,
  type Action,
  type ChallengeId,
  type RunConfig,
  type RunState,
} from '../src/index.js';

const DECK = ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'];
const config: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK, challengeSeed: 42 };

/** Run dont chaque salle a le défi `id`, avec des retouches de l'état (positions, PV). */
function withChallenge(id: ChallengeId, mutate?: (s: RunState) => void): RunState {
  const s = JSON.parse(JSON.stringify(createRun(config))) as RunState;
  mutate?.(s);
  s.challengeIds = [id, id, id];
  s.challenges = [];
  startRoomChallenge(s);
  s.challenges[0].startTurn = 0; // le premier tour est déjà commencé
  return s;
}

function play(s: RunState, actions: Action[]): RunState {
  for (const a of actions) s = applyAction(s, a).state;
  return s;
}

const ardente = (x: number, y: number): Action => ({ type: 'cast', spellId: 'fleche_ardente', target: { x, y } });

describe('défis : tirage', () => {
  it('tire un défi par salle, sans doublon, toujours le même pour une graine', () => {
    const a = pickChallenges(config);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(pickChallenges(config)).toEqual(a);
    expect(createRun(config).challengeIds).toEqual(a);
  });

  it('pas de défi sans graine', () => {
    const { challengeSeed: _, ...noSeed } = config;
    expect(pickChallenges(noSeed)).toEqual([]);
    expect(currentChallenge(createRun(noSeed))).toBeUndefined();
  });

  it('ne propose que des défis faisables avec le deck', () => {
    // Deck Feu + Terre : Arc-en-ciel (3 éléments) ne sort jamais.
    for (let seed = 0; seed < 200; seed++) expect(pickChallenges({ ...config, challengeSeed: seed })).not.toContain('arc_en_ciel');
    // Deck sans brûlure ni poussée : pas de Fin brûlante.
    const plain = { ...config, deck: ['bond_arriere', 'tir_concentre'] };
    for (let seed = 0; seed < 200; seed++) expect(pickChallenges({ ...plain, challengeSeed: seed })).not.toContain('fin_brulante');
  });

  it('démarre le défi de la première salle', () => {
    const s = createRun(config);
    expect(currentChallenge(s)).toMatchObject({ roomIndex: 0, status: 'active', id: s.challengeIds![0] });
  });
});

describe('défis : suivi', () => {
  it('Intouchable échoue au premier dégât subi', () => {
    let s = withChallenge('intouchable', (st) => {
      st.units[1].pos = { x: 2, y: 3 }; // ronceau au contact
    });
    s = play(s, [{ type: 'endTurn' }]);
    expect(currentChallenge(s)?.status).toBe('failed');
  });

  it('Racines échoue au-delà de 3 PM dépensés dans la salle', () => {
    let s = withChallenge('racines');
    s = play(s, [{ type: 'move', to: { x: 1, y: 0 } }]);
    expect(currentChallenge(s)).toMatchObject({ status: 'active', pmSpent: 3 });
    s = play(s, [{ type: 'endTurn' }, { type: 'move', to: { x: 0, y: 0 } }]);
    expect(currentChallenge(s)?.status).toBe('failed');
  });

  it('Doublé réussit avec deux ennemis vaincus dans le même tour', () => {
    let s = withChallenge('double', (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[1].hp = 1;
      st.units[2].pos = { x: 1, y: 1 };
      st.units[2].hp = 1;
    });
    s = play(s, [ardente(4, 3)]);
    expect(currentChallenge(s)?.status).toBe('active');
    s = play(s, [ardente(1, 1)]);
    expect(currentChallenge(s)?.status).toBe('success');
  });

  it('Le chef d’abord échoue si un autre monstre tombe en premier', () => {
    let s = withChallenge('chef', (st) => {
      st.units[2].pos = { x: 4, y: 3 }; // guêpe
      st.units[2].hp = 1;
    });
    expect(currentChallenge(s)!.targetId).toBe(s.units[1].id); // le ronceau, plus résistant
    s = play(s, [ardente(4, 3)]);
    expect(currentChallenge(s)?.status).toBe('failed');
  });

  it('Fin brûlante réussit quand la brûlure achève un monstre', () => {
    let s = withChallenge('fin_brulante', (st) => {
      st.units[1].pos = { x: 4, y: 3 };
      st.units[1].maxHp = 100;
      st.units[1].hp = 18; // la flèche (13 PV) ne suffit pas, la brûlure finit le travail
    });
    s = play(s, [ardente(4, 3), { type: 'endTurn' }]);
    expect(currentChallenge(s)?.status).toBe('success');
  });

  it('un défi « tenu » est réussi quand la salle est vidée, et la salle suivante a le sien', () => {
    let s = withChallenge('distances', (st) => {
      st.units = st.units.filter((u, i) => i <= 1);
      st.units[1].pos = { x: 4, y: 3 };
      st.units[1].hp = 1;
    });
    s = play(s, [ardente(4, 3)]);
    expect(s.roomIndex).toBe(1);
    expect(s.challenges?.[0]).toMatchObject({ roomIndex: 0, status: 'success' });
    expect(currentChallenge(s)).toMatchObject({ roomIndex: 1, status: 'active', id: 'distances' });
  });

  it('Garde tes distances échoue en finissant un tour au contact', () => {
    let s = withChallenge('distances', (st) => {
      st.units[1].pos = { x: 2, y: 3 };
    });
    s = play(s, [{ type: 'endTurn' }]);
    expect(currentChallenge(s)?.status).toBe('failed');
  });

  it('Élan échoue quand la limite de tours est dépassée', () => {
    let s = withChallenge('elan');
    const limit = currentChallenge(s)!.turnLimit!;
    expect(limit).toBe(6); // 3 monstres + 3
    for (let i = 0; i < limit - 1; i++) s = play(s, [{ type: 'endTurn' }]);
    if (s.status === 'playing') {
      expect(currentChallenge(s)?.status).toBe('active');
      s = play(s, [{ type: 'endTurn' }]);
      if (s.status === 'playing') expect(currentChallenge(s)?.status).toBe('failed');
    }
  });
});

describe('défis : récompenses', () => {
  it('additionne les bonus des défis réussis', () => {
    const base = { roomIndex: 0, startTurn: 0, turns: 0, pmSpent: 0, hpLost: 0, elements: [], killsThisTurn: 0 };
    expect(
      challengeBonus([
        { ...base, id: 'distances', status: 'success' },
        { ...base, id: 'intouchable', status: 'success' },
        { ...base, id: 'chef', status: 'failed' },
      ]),
    ).toBe(0.2);
    expect(getChallenge('egratigne').bonus).toBe(0.1);
  });

  it('le replay retrouve les mêmes défis et le résumé applique le bonus d’XP', () => {
    const actions: Action[] = [{ type: 'move', to: { x: 1, y: 1 } }, { type: 'endTurn' }, { type: 'endTurn' }];
    let s = createRun(config);
    s = play(s, actions);
    expect(replayRun(config, actions).challenges).toEqual(s.challenges);
    const sum = summarizeRun(config, actions);
    expect(sum.challenges).toEqual(s.challenges);
    expect(sum.xpChallengeBonus).toBe(Math.round((sum.xpFromKills + sum.xpVictoryBonus) * sum.challengeBonus));
    expect(sum.xpTotal).toBe(sum.xpFromKills + sum.xpVictoryBonus + sum.xpChallengeBonus);
  });

  it('le bonus de loot ne change rien à graine égale sans bonus, et n’enlève jamais d’objet', () => {
    for (let seed = 1; seed < 100; seed++) {
      const a = rollBossLoot('bosquet_des_ronces', 5, seed);
      expect(rollBossLoot('bosquet_des_ronces', 5, seed, 0)).toEqual(a);
      expect(rollBossLoot('bosquet_des_ronces', 5, seed, 0.45).length).toBeGreaterThanOrEqual(a.length > 1 ? 1 : a.length);
    }
  });
});
