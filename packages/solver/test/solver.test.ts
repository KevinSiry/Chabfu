import { describe, expect, it } from 'vitest';
import { createRun, verifyRun, type RunConfig } from '@chabfu/engine';
import { compareResults, estimateDurationSeconds, solve, stateKey } from '../src/solver.js';
import { fullSetBonus } from '../src/stuff.js';

const DECK = ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'];
const config: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK };

describe('solveur', () => {
  it('finit le Bosquet en difficulté 1 avec une route que verifyRun accepte', () => {
    const r = solve(config, { beamWidth: 8, maxTurnNodes: 1500, endTurnCandidates: 12 });
    expect(r.won).toBe(true);
    expect(verifyRun(config, r.actions, r.turns)).toEqual({ valid: true });
    expect(r.hpLeft).toBeGreaterThan(0);
    expect(estimateDurationSeconds(r)).toBeGreaterThan(0);
  }, 60_000);

  it('donne la même clé à deux états identiques et une autre après une action', () => {
    const a = createRun(config);
    const b = createRun(config);
    expect(stateKey(a)).toBe(stateKey(b));
    b.units[1].hp -= 1;
    expect(stateKey(a)).not.toBe(stateKey(b));
  });

  it('classe une victoire avant un échec, puis moins de tours avant plus de tours', () => {
    const base = solve(config, { maxTurns: 1, beamWidth: 2, maxTurnNodes: 50 });
    const win = { ...base, won: true, turns: 10 };
    expect(compareResults(win, base)).toBeLessThan(0);
    expect(compareResults({ ...win, turns: 8 }, win)).toBeLessThan(0);
  });

  it('construit une panoplie complète de la tranche', () => {
    expect(fullSetBonus(1, 'aucun').hp).toBe(0);
    const commun = fullSetBonus(1, 'commun');
    const mythique = fullSetBonus(1, 'mythique');
    expect(commun.hp).toBeGreaterThan(0);
    expect(mythique.hp).toBeGreaterThan(commun.hp);
    expect(() => fullSetBonus(1, 'inconnu')).toThrow();
  });
});

describe('clé d’état', () => {
  it('connaît tous les champs de l’état du moteur (sinon, mettre à jour stateKey)', async () => {
    const { KEYED_PLAYER_FIELDS, STATIC_PLAYER_FIELDS, KEYED_UNIT_FIELDS, STATIC_UNIT_FIELDS } = await import('../src/solver.js');
    const s = createRun({ ...config, passives: [] });
    const known = (fields: string[]) => new Set(fields);
    const playerKnown = known([...KEYED_PLAYER_FIELDS, ...STATIC_PLAYER_FIELDS]);
    expect(Object.keys(s.player).filter((k) => !playerKnown.has(k))).toEqual([]);
    const unitKnown = known([...KEYED_UNIT_FIELDS, ...STATIC_UNIT_FIELDS]);
    for (const u of s.units) expect(Object.keys(u).filter((k) => !unitKnown.has(k))).toEqual([]);
    expect(Object.keys(s).sort()).toEqual(['actionLog', 'config', 'player', 'room', 'roomIndex', 'status', 'turn', 'units']);
  });
});
