import { describe, expect, it } from 'vitest';
import {
  ITEMS,
  MAX_RESISTANCE,
  PLAYER_HP,
  combatStats,
  computeDamage,
  createRun,
  describeBonus,
  emptyBonus,
  getMonsters,
  getPlayer,
  itemStats,
  normalizeBonus,
  spellDamageOn,
  spellMaxRange,
  getSpell,
  statLines,
  type EquipmentBonus,
  type RunConfig,
} from '../src/index.js';

const DECK = ['fleche_ardente', 'bond_arriere', 'fleche_fracassante', 'tir_concentre', 'coup_de_pied'];
const LABELS = { fire: 'Feu', water: 'Eau', earth: 'Terre', air: 'Air', neutral: 'Neutre' } as const;

function run(eq: Partial<EquipmentBonus>): ReturnType<typeof createRun> {
  const config: RunConfig = { dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK, equipment: { ...emptyBonus(), ...eq } };
  return createRun(config);
}

describe('stats des objets', () => {
  it('chaque objet porte au moins 2 stats', () => {
    for (const it of ITEMS) expect(statLines(itemStats(it.id, 'common'), LABELS).length, it.id).toBeGreaterThanOrEqual(2);
  });

  it('la rareté multiplie PV, maîtrises, résistances et dommages, pas PA/PM/portée/Concentration', () => {
    const c = itemStats('amulette_braise', 'common');
    const l = itemStats('amulette_braise', 'legendary');
    expect(l.resistances.fire).toBeGreaterThan(c.resistances.fire);
    expect(l.masteries.fire).toBeGreaterThan(c.masteries.fire);
    expect(l.concentration).toBe(c.concentration);
    expect(itemStats('arc_racineux', 'legendary').damage).toBeGreaterThan(itemStats('arc_racineux', 'common').damage);
    expect(itemStats('arc_roseau', 'legendary').range).toBe(1);
    expect(itemStats('bottes_batracien', 'legendary').pm).toBe(1);
  });

  it('accepte un bonus à l’ancien format (sans les nouvelles stats)', () => {
    const old = { hp: 10, pa: 0, pm: 0, masteries: { fire: 5, water: 0, earth: 0, air: 0, neutral: 0 } };
    expect(normalizeBonus(old).resistances.fire).toBe(0);
    const r = createRun({ dungeonId: 'bosquet_des_ronces', difficulty: 1, deck: DECK, equipment: old });
    expect(getPlayer(r).maxHp).toBe(PLAYER_HP + 10);
  });

  it('décrit les stats dans un ordre stable', () => {
    const lines = describeBonus(itemStats('amulette_braise', 'common'), LABELS);
    expect(lines[0]).toMatch(/PV$/);
    expect(lines.findIndex((l) => l.includes('Maîtrise'))).toBeLessThan(lines.findIndex((l) => l.includes('Concentration')));
    expect(lines.at(-1)).toContain('Résistance Feu');
  });
});

describe('stats en combat', () => {
  it('les résistances réduisent les dégâts reçus, plafonnées', () => {
    const s = run({});
    const monster = getMonsters(s)[0];
    const player = getPlayer(s);
    const raw = computeDamage(s, 20, 'earth', monster, player);
    const resisted = run({ resistances: { ...emptyBonus().resistances, earth: 25 } });
    expect(computeDamage(resisted, 20, 'earth', getMonsters(resisted)[0], getPlayer(resisted))).toBe(Math.floor(raw * 0.75));
    const capped = run({ resistances: { ...emptyBonus().resistances, earth: 90 } });
    expect(computeDamage(capped, 20, 'earth', getMonsters(capped)[0], getPlayer(capped))).toBe(Math.floor(raw * (1 - MAX_RESISTANCE / 100)));
    expect(combatStats({ ...emptyBonus(), resistances: { ...emptyBonus().resistances, air: 90 } }).resistances.air).toBe(MAX_RESISTANCE);
  });

  it('les dommages s’ajoutent aux coups de sort, avant la maîtrise', () => {
    const base = run({});
    const boosted = run({ damage: 3 });
    const a = spellDamageOn(base, 'fleche_fracassante', getMonsters(base)[0])!;
    const b = spellDamageOn(boosted, 'fleche_fracassante', getMonsters(boosted)[0])!;
    expect(b.flat).toBe(3);
    expect(b.amount).toBeGreaterThan(a.amount);
  });

  it('la portée allonge les tirs à distance seulement', () => {
    const s = run({ range: 1 });
    expect(spellMaxRange(getSpell('fleche_ardente'), [], 1)).toBe(getSpell('fleche_ardente').maxRange + 1);
    expect(spellMaxRange(getSpell('coup_de_pied'), [], 1)).toBe(getSpell('coup_de_pied').maxRange);
    expect(s.config.equipment?.range).toBe(1);
  });

  it('la Concentration de l’équipement est donnée au début de chaque salle', () => {
    expect(run({}).player.concentration).toBe(0);
    expect(run({ concentration: 1 }).player.concentration).toBe(1);
  });

  it('combatStats additionne la base et le stuff', () => {
    const st = combatStats({ ...emptyBonus(), hp: 40, pm: 1, damage: 2 });
    expect(st.hp).toBe(PLAYER_HP + 40);
    expect(st.fromEquipment.hp).toBe(40);
    expect(st.damage).toBe(2);
  });
});
