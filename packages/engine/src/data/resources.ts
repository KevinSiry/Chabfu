/**
 * Ressources de craft (GDD section 7, « Ressources par difficulté »).
 * Chaque donjon a ses propres ressources, chacune avec une difficulté de référence.
 */

/** Paliers de ressources : communes (réf. 1–3), rares (4–5), mythiques (6–8), ultimes (9–10). */
export type ResourceTier = 'common' | 'rare' | 'mythic' | 'ultimate';

export const RESOURCE_TIERS: Record<ResourceTier, { label: string; minRef: number; maxRef: number }> = {
  common: { label: 'Commune', minRef: 1, maxRef: 3 },
  rare: { label: 'Rare', minRef: 4, maxRef: 5 },
  mythic: { label: 'Mythique', minRef: 6, maxRef: 8 },
  ultimate: { label: 'Ultime', minRef: 9, maxRef: 10 },
};

export interface ResourceDef {
  id: string;
  name: string;
  dungeonId: string;
  tier: ResourceTier;
  /** Difficulté de référence : drop normal à partir d'ici, très rare à réf. − 1, jamais en dessous. */
  refDifficulty: number;
  /**
   * Quantité moyenne obtenue par run gagné à la difficulté de référence.
   * Peut dépasser 1 : la partie entière tombe toujours, la partie décimale est une chance.
   */
  baseRate: number;
}

export const RESOURCES: ResourceDef[] = [
  { id: 'epine_de_ronceau', name: 'Épine de ronceau', dungeonId: 'bosquet_des_ronces', tier: 'common', refDifficulty: 1, baseRate: 3 },
  { id: 'aile_de_guepe', name: 'Aile de guêpe', dungeonId: 'bosquet_des_ronces', tier: 'common', refDifficulty: 2, baseRate: 2 },
  { id: 'seve_racineuse', name: 'Sève racineuse', dungeonId: 'bosquet_des_ronces', tier: 'rare', refDifficulty: 4, baseRate: 1.2 },
  { id: 'ecorce_du_gardien', name: 'Écorce du Gardien', dungeonId: 'bosquet_des_ronces', tier: 'mythic', refDifficulty: 6, baseRate: 0.6 },
  { id: 'coeur_de_racine', name: 'Cœur de racine', dungeonId: 'bosquet_des_ronces', tier: 'ultimate', refDifficulty: 9, baseRate: 0.3 },
];

const BY_ID = new Map(RESOURCES.map((r) => [r.id, r]));

export function getResource(id: string): ResourceDef {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`Ressource inconnue : ${id}`);
  return r;
}

/** Ressources d'un donjon, triées par difficulté de référence. */
export function dungeonResources(dungeonId: string): ResourceDef[] {
  return RESOURCES.filter((r) => r.dungeonId === dungeonId).sort((a, b) => a.refDifficulty - b.refDifficulty);
}
