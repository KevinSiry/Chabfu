import { PASSIVES, getPassive, type PassiveDef, type PassiveMods } from './data/passives.js';
import type { SpellDef } from './data/spells.js';
import { getTranche } from './progression.js';

export function availablePassives(effectiveLvl: number): PassiveDef[] {
  return PASSIVES.filter((p) => p.level <= effectiveLvl);
}

/** Retourne un message d'erreur si les passifs sont invalides pour cette tranche et ce niveau effectif, sinon null. */
export function validatePassives(passives: string[], trancheId: number, effectiveLvl: number): string | null {
  const t = getTranche(trancheId);
  if (passives.length > t.passiveSlots) {
    return `La tranche T${t.id} n’a que ${t.passiveSlots} emplacement${t.passiveSlots > 1 ? 's' : ''} de passif.`;
  }
  if (new Set(passives).size !== passives.length) return 'Un passif ne peut être équipé qu’une fois.';
  const allowed = new Set(availablePassives(effectiveLvl).map((p) => p.id));
  for (const id of passives) {
    if (!allowed.has(id)) return `Passif indisponible au niveau ${effectiveLvl} : ${id}`;
  }
  return null;
}

/** Modificateurs cumulés des passifs équipés. */
export interface CombinedMods {
  killPm: number;
  burnExtraTurns: number;
  paCostReduction: Record<string, number>;
  rangeBonus: number;
  distanceBonusPerCell: number;
}

export function combinePassives(passives: readonly string[] | undefined): CombinedMods {
  const out: CombinedMods = {
    killPm: 0,
    burnExtraTurns: 0,
    paCostReduction: {},
    rangeBonus: 0,
    distanceBonusPerCell: 0,
  };
  for (const id of passives ?? []) {
    const m: PassiveMods = getPassive(id).mods;
    out.killPm += m.killPm ?? 0;
    out.burnExtraTurns += m.burnExtraTurns ?? 0;
    for (const [s, v] of Object.entries(m.paCostReduction ?? {})) {
      out.paCostReduction[s] = (out.paCostReduction[s] ?? 0) + v;
    }
    out.rangeBonus += m.rangeBonus ?? 0;
    out.distanceBonusPerCell += m.distanceBonusPerCell ?? 0;
  }
  return out;
}

/** Un tir à distance : sort offensif dont la portée maximale est d'au moins 2 cases. */
export function isRangedShot(spell: SpellDef): boolean {
  return (spell.target === 'unit' || spell.target === 'cell') && spell.maxRange >= 2;
}

/** Portée maximale d'un sort : passifs et portée de l'équipement s'ajoutent aux tirs à distance. */
export function spellMaxRange(spell: SpellDef, passives: readonly string[] | undefined, equipmentRange = 0): number {
  return spell.maxRange + (isRangedShot(spell) ? combinePassives(passives).rangeBonus + equipmentRange : 0);
}

/** Coût en PA d'un sort, réductions des passifs comprises (1 PA minimum). */
export function spellPaCost(spell: SpellDef, passives: readonly string[] | undefined): number {
  const cut = combinePassives(passives).paCostReduction[spell.id] ?? 0;
  return cut ? Math.max(1, spell.pa - cut) : spell.pa;
}
