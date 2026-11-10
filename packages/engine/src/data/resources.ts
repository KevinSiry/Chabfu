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
  { id: 'epine_de_ronceau', name: 'Épine de ronceau', dungeonId: 'bosquet_des_ronces', tier: 'common', refDifficulty: 1, baseRate: 2 },
  { id: 'aile_de_guepe', name: 'Aile de guêpe', dungeonId: 'bosquet_des_ronces', tier: 'common', refDifficulty: 2, baseRate: 1.2 },
  { id: 'seve_racineuse', name: 'Sève racineuse', dungeonId: 'bosquet_des_ronces', tier: 'rare', refDifficulty: 4, baseRate: 0.6 },
  { id: 'ecorce_du_gardien', name: 'Écorce du Gardien', dungeonId: 'bosquet_des_ronces', tier: 'mythic', refDifficulty: 6, baseRate: 0.25 },
  { id: 'coeur_de_racine', name: 'Cœur de racine', dungeonId: 'bosquet_des_ronces', tier: 'ultimate', refDifficulty: 9, baseRate: 0.12 },
  { id: 'jonc_des_marais', name: 'Jonc des marais', dungeonId: 'tourbiere_des_noyes', tier: 'common', refDifficulty: 1, baseRate: 2 },
  { id: 'mucus_de_batracien', name: 'Mucus de batracien', dungeonId: 'tourbiere_des_noyes', tier: 'common', refDifficulty: 2, baseRate: 1.2 },
  { id: 'perle_de_tourbe', name: 'Perle de tourbe', dungeonId: 'tourbiere_des_noyes', tier: 'rare', refDifficulty: 4, baseRate: 0.6 },
  { id: 'oeuf_de_la_reine', name: 'Œuf de la Reine', dungeonId: 'tourbiere_des_noyes', tier: 'mythic', refDifficulty: 6, baseRate: 0.25 },
  { id: 'larme_des_noyes', name: 'Larme des Noyés', dungeonId: 'tourbiere_des_noyes', tier: 'ultimate', refDifficulty: 9, baseRate: 0.12 },
  { id: 'scorie_tiede', name: 'Scorie tiède', dungeonId: 'caldeira_des_cendres', tier: 'common', refDifficulty: 1, baseRate: 2 },
  { id: 'cendre_vive', name: 'Cendre vive', dungeonId: 'caldeira_des_cendres', tier: 'common', refDifficulty: 2, baseRate: 1.2 },
  { id: 'coeur_de_lave', name: 'Cœur de lave', dungeonId: 'caldeira_des_cendres', tier: 'rare', refDifficulty: 4, baseRate: 0.6 },
  { id: 'noyau_du_golem', name: 'Noyau du Golem', dungeonId: 'caldeira_des_cendres', tier: 'mythic', refDifficulty: 6, baseRate: 0.25 },
  { id: 'flamme_primordiale', name: 'Flamme primordiale', dungeonId: 'caldeira_des_cendres', tier: 'ultimate', refDifficulty: 9, baseRate: 0.12 },
  { id: 'plume_grise', name: 'Plume grise', dungeonId: 'falaises_hurlantes', tier: 'common', refDifficulty: 1, baseRate: 2 },
  { id: 'crin_de_bouquetin', name: 'Crin de bouquetin', dungeonId: 'falaises_hurlantes', tier: 'common', refDifficulty: 2, baseRate: 1.2 },
  { id: 'serre_de_harpie', name: 'Serre de harpie', dungeonId: 'falaises_hurlantes', tier: 'rare', refDifficulty: 4, baseRate: 0.6 },
  { id: 'plume_de_la_matriarche', name: 'Plume de la Matriarche', dungeonId: 'falaises_hurlantes', tier: 'mythic', refDifficulty: 6, baseRate: 0.25 },
  { id: 'souffle_des_cimes', name: 'Souffle des cimes', dungeonId: 'falaises_hurlantes', tier: 'ultimate', refDifficulty: 9, baseRate: 0.12 },
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
