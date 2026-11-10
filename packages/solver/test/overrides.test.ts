import { afterEach, describe, expect, it } from 'vitest';
import { MONSTERS, SPELLS, getMonster, getSpell } from '@chabfu/engine';
import { applyOverrides } from '../src/overrides.js';

const snapshot = JSON.stringify({ MONSTERS, SPELLS });

afterEach(() => {
  const saved = JSON.parse(snapshot) as { MONSTERS: typeof MONSTERS; SPELLS: typeof SPELLS };
  MONSTERS.forEach((m, i) => Object.assign(m, saved.MONSTERS[i]));
  SPELLS.forEach((s, i) => Object.assign(s, saved.SPELLS[i]));
});

describe('réglages --set', () => {
  it('change une valeur, applique un multiplicateur et traverse les attaques', () => {
    applyOverrides(['monster.ronceau.hp=30', 'monster.*.pm=x2', 'monster.gardien_racineux.attacks.etreinte.damage=20', 'spell.tir_concentre.concentrationCost=3', 'monster.ronceau.pa=+1']);
    expect(getMonster('ronceau').hp).toBe(30);
    expect(getMonster('guepe').pm).toBe(12);
    expect(getMonster('gardien_racineux').attacks.find((a) => a.id === 'etreinte')!.damage).toBe(20);
    expect(getSpell('tir_concentre').concentrationCost).toBe(3);
    expect(getMonster('ronceau').pa).toBe(7);
  });

  it('refuse un réglage qui ne touche rien', () => {
    expect(() => applyOverrides(['monster.inconnu.hp=3'])).toThrow();
    expect(() => applyOverrides(['monster.ronceau.champ_absent=x2'])).toThrow();
  });
});
