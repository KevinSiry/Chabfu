import { describe, expect, it } from 'vitest';
import {
  DUNGEONS,
  applyAction,
  combinedThreat,
  createRun,
  getMonsters,
  getPlayer,
  monsterAttacks,
  monsterThreatZone,
  previewCast,
  previewEnemyTurn,
  previewMove,
  spellDamageOn,
  turnOrder,
  type RunConfig,
  type RunState,
} from '../src/index.js';

const DECK = ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'];
const config: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK };

function edit(state: RunState, mutate: (s: RunState) => void): RunState {
  const s = JSON.parse(JSON.stringify(state)) as RunState;
  mutate(s);
  return s;
}

describe('aperçus', () => {
  it('prévoit exactement les dégâts, la poussée et les collisions', () => {
    const s = edit(createRun(config), (st) => {
      st.units[1].pos = { x: 5, y: 3 };
      st.units[2].pos = { x: 7, y: 3 };
    });
    const before = JSON.stringify(s);
    const p = previewCast(s, 'fleche_fracassante', { x: 5, y: 3 });
    expect(JSON.stringify(s)).toBe(before);
    expect(p.valid).toBe(true);
    const pushed = p.outcomes.find((o) => o.unitId === s.units[1].id)!;
    expect(pushed.movedTo).toEqual({ x: 6, y: 3 });
    expect(pushed.bySource.spell).toBe(8); // 10 Terre, résistance Terre
    expect(pushed.bySource.collision).toBe(8);
    const hit = p.outcomes.find((o) => o.unitId === s.units[2].id)!;
    expect(hit.bySource.collision).toBe(4);
    // Identique à l'action réelle
    const real = applyAction(s, { type: 'cast', spellId: 'fleche_fracassante', target: { x: 5, y: 3 } }).state;
    expect(real.units[1].hp).toBe(pushed.hpAfter);
  });

  it('donne la raison quand le sort est impossible', () => {
    const s = createRun(config);
    const p = previewCast(s, 'fleche_ardente', { x: 8, y: 1 });
    expect(p.valid).toBe(false);
    expect(p.error).toBeTruthy();
  });

  it('détaille les multiplicateurs de dégâts', () => {
    const s = createRun(config);
    const ronceau = getMonsters(s)[0];
    const d = spellDamageOn(s, 'fleche_ardente', ronceau)!;
    expect(d.weakness).toBe(true);
    expect(d.amount).toBe(15);
    expect(d.burn).toEqual({ damage: 5, turns: 2 });
    expect(spellDamageOn(s, 'bond_arriere', ronceau)).toBeNull();
  });

  it('prévoit le tour ennemi comme le moteur', () => {
    let s = createRun(config);
    for (let i = 0; i < 2; i++) s = applyAction(s, { type: 'endTurn' }).state;
    const preview = previewEnemyTurn(s)!;
    const after = applyAction(s, { type: 'endTurn' }).state;
    expect(preview.playerHpAfter).toBe(getPlayer(after).hp);
    expect(preview.concentrationNextTurn).toBe(after.player.concentration);
    for (const intent of preview.intents) {
      const u = after.units.find((x) => x.id === intent.unitId)!;
      const end = intent.path.length ? intent.path[intent.path.length - 1] : s.units.find((x) => x.id === intent.unitId)!.pos;
      expect(u.pos).toEqual(end);
    }
  });

  it('la zone de menace contient les cases où le monstre touche vraiment', () => {
    let s = createRun(config);
    for (let i = 0; i < 2; i++) s = applyAction(s, { type: 'endTurn' }).state;
    const player = getPlayer(s);
    const preview = previewEnemyTurn(s)!;
    for (const intent of preview.intents) {
      const zone = monsterThreatZone(s, intent.unitId);
      const inZone = zone.threat.some((c) => c.x === player.pos.x && c.y === player.pos.y);
      if (intent.attacks.length) expect(inZone).toBe(true);
      expect(zone.move.length).toBeGreaterThan(0);
    }
    expect(combinedThreat(s).size).toBeGreaterThan(0);
  });

  it('applique la difficulté aux attaques affichées', () => {
    const s = createRun({ ...config, difficulty: 3 });
    const atk = monsterAttacks(s, getMonsters(s)[0])[0];
    expect(atk.damage).toBe(Math.floor(11 * 1.3));
  });

  it('aperçu de déplacement et ordre des tours', () => {
    const s = edit(createRun(config), (st) => (st.player.concentration = 5));
    const m = previewMove(s, { x: 1, y: 1 })!;
    expect(m.pmCost).toBe(2);
    expect(m.concentrationAfter).toBe(3);
    expect(previewMove(s, { x: 9, y: 9 })).toBeNull();
    expect(turnOrder(s).map((u) => u.id)[0]).toBe('archer');
    expect(turnOrder(s)).toHaveLength(4);
  });
});

describe('aperçus sur tous les donjons', () => {
  it('le tour ennemi prévu correspond au moteur (comportements, brûlure, poussée, sentinelle)', () => {
    for (const d of DUNGEONS) {
      let s = createRun({ dungeonId: d.id, difficulty: 3, deck: ['fleche_ardente'] });
      for (let i = 0; i < 6 && s.status === 'playing'; i++) {
        const p = previewEnemyTurn(s)!;
        const after = applyAction(s, { type: 'endTurn' }).state;
        if (after.status === 'playing') {
          expect(getPlayer(after).hp + p.playerBurnNextTurn, d.id).toBe(p.playerHpAfter);
          for (const intent of p.intents) {
            const zone = monsterThreatZone(s, intent.unitId);
            const pos = getPlayer(s).pos;
            if (intent.attacks.length) expect(zone.threat.some((c) => c.x === pos.x && c.y === pos.y), `${d.id} ${intent.name}`).toBe(true);
          }
        }
        s = after;
      }
    }
  });
});
