import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT, SAVE_KEYS, SAVE_VERSION, SaveError, isEmptySave, migrateSave, saveFromStorage, saveToStorage } from '../src/index.js';

class MemoryStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe('sauvegarde', () => {
  it('reprend toutes les clés chabfu.* du navigateur, y compris les futures', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEYS.character, JSON.stringify({ name: 'Kevin', level: 12 }));
    s.setItem(SAVE_KEYS.scores, JSON.stringify({ difficulty: 3, scores: [] }));
    s.setItem('chabfu.runes.v1', JSON.stringify({ owned: ['r1'] }));
    s.setItem('autre-site', 'x');
    s.setItem('chabfu.cassee', '{pas du json');
    const save = saveFromStorage(s, '2026-11-11T00:00:00.000Z');
    expect(save.format).toBe(SAVE_FORMAT);
    expect(save.version).toBe(SAVE_VERSION);
    expect(Object.keys(save.data).sort()).toEqual(['chabfu.character.v1', 'chabfu.runes.v1', 'chabfu.v1']);
    expect(save.data['chabfu.character.v1']).toEqual({ name: 'Kevin', level: 12 });
  });

  it('fait un aller-retour exact et retire les clés absentes de la sauvegarde', () => {
    const a = new MemoryStorage();
    a.setItem(SAVE_KEYS.inventory, JSON.stringify({ items: [{ id: 'i1' }] }));
    const save = migrateSave(JSON.parse(JSON.stringify(saveFromStorage(a, 'x'))));
    const b = new MemoryStorage();
    b.setItem(SAVE_KEYS.crafting, '{}');
    b.setItem('ailleurs', '1');
    saveToStorage(save, b);
    expect(b.getItem(SAVE_KEYS.crafting)).toBeNull();
    expect(b.getItem('ailleurs')).toBe('1');
    expect(JSON.parse(b.getItem(SAVE_KEYS.inventory)!)).toEqual({ items: [{ id: 'i1' }] });
  });

  it('migre un ancien export brut (clés du navigateur sans enveloppe)', () => {
    const save = migrateSave({ 'chabfu.character.v1': { name: 'A' } });
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.data).toEqual({ 'chabfu.character.v1': { name: 'A' } });
  });

  it('refuse les fichiers étrangers ou trop récents', () => {
    expect(() => migrateSave(null)).toThrow(SaveError);
    expect(() => migrateSave({ foo: 1 })).toThrow(SaveError);
    expect(() => migrateSave({ format: SAVE_FORMAT, version: SAVE_VERSION + 1, data: {} })).toThrow(/plus récente/);
    expect(() => migrateSave({ format: SAVE_FORMAT, version: 1, data: [] })).toThrow(SaveError);
  });

  it('détecte une sauvegarde vide', () => {
    expect(isEmptySave(saveFromStorage(new MemoryStorage(), 'x'))).toBe(true);
  });
});
