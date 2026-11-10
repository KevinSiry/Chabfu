/** Règles de drop et d'échelle de difficulté (GDD sections 7 et 8). */

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

/**
 * PV et dégâts des monstres : +15 % par palier au-dessus de 1, plus une courbe qui ne pèse qu'en haut
 * (D3 ×1,31, D5 ×1,64, D10 ×2,55) pour que les hautes difficultés exigent un stuff presque parfait.
 */
export function difficultyMultiplier(difficulty: number): number {
  const d = difficulty - 1;
  return 1 + 0.15 * d + 0.0025 * d * d;
}

/**
 * Taux de drop d'un objet de difficulté de référence `refDifficulty` dans un run de difficulté `difficulty`.
 * Au-dessus de la référence : +25 % du taux de base par palier. À référence - 1 : taux / 10. En dessous : 0.
 */
export function dropRate(baseRate: number, refDifficulty: number, difficulty: number): number {
  if (difficulty >= refDifficulty) return baseRate * (1 + 0.25 * (difficulty - refDifficulty));
  if (difficulty === refDifficulty - 1) return baseRate / 10;
  return 0;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'legendary';

export const RARITIES: Record<Rarity, { label: string; power: number; runeSlots: number; craftable: boolean }> = {
  common: { label: 'Commune', power: 1.0, runeSlots: 0, craftable: true },
  uncommon: { label: 'Inhabituelle', power: 1.1, runeSlots: 1, craftable: true },
  rare: { label: 'Rare', power: 1.2, runeSlots: 1, craftable: true },
  mythic: { label: 'Mythique', power: 1.35, runeSlots: 2, craftable: true },
  legendary: { label: 'Légendaire', power: 1.5, runeSlots: 3, craftable: false },
};

/** Générateur pseudo-aléatoire à graine (mulberry32), pour des tirages reproductibles côté serveur. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
