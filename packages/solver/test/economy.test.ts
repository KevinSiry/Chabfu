import { describe, expect, it } from 'vitest';
import { runsForFullSet, runsForRunes } from '../src/economy.js';

/** Garde-fous du rythme de farm (GDD section 8, « Rythme d'obtention ») : le stuff doit se mériter. */
describe('économie du stuff', () => {
  const runs = (d: number, target: 'uncommon' | 'rare' | 'mythic') =>
    runsForFullSet('bosquet_des_ronces', d, target, { seeds: 30 }).meanRuns ?? Infinity;

  it('une panoplie Rare demande plusieurs dizaines de runs en D5', () => {
    expect(runs(5, 'rare')).toBeGreaterThan(45);
  });

  it('une panoplie Mythique demande plus de cent runs, même en D10', () => {
    expect(runs(10, 'mythic')).toBeGreaterThan(100);
  });

  it('une panoplie Inhabituelle reste accessible en début de partie', () => {
    expect(runs(3, 'uncommon')).toBeLessThan(40);
  });
});

describe('économie des runes', () => {
  it('le jeu de 18 Parfaites demande plusieurs centaines de runs en D10', () => {
    const r = runsForRunes('bosquet_des_ronces', 10, { seeds: 10, maxRuns: 2500 });
    expect(r.perfectSet ?? Infinity).toBeGreaterThan(300);
    expect(r.firstRune ?? Infinity).toBeLessThan(10);
  });
});
