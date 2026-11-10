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
