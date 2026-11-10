/**
 * Visuels peints (public/assets/). Chaque image a un repli dessiné en CSS : si le fichier manque,
 * la balise se retire d'elle-même et le repli reste visible.
 */
const BASE = `${import.meta.env.BASE_URL}assets/`;

export function assetUrl(path: string): string {
  return BASE + path;
}

/** Balise <img> qui disparaît si le fichier est absent. */
export function assetImg(path: string, cls: string, alt = ''): string {
  return `<img class="${cls}" src="${assetUrl(path)}" alt="${alt}" draggable="false" loading="lazy" onerror="this.remove()">`;
}

export const spellIconImg = (spellId: string, cls = 'asset-icon') => assetImg(`icons/${spellId}.webp`, cls);
export const unitPortraitImg = (templateId: string, cls = 'asset-portrait') => assetImg(`units/${templateId}.png`, cls);
export const dungeonBannerImg = (dungeonId: string, cls = 'asset-banner') => assetImg(`dungeons/${dungeonId}.webp`, cls);
/** Icône propre à chaque objet (public/assets/objets/<id>.webp). */
export const itemIconImg = (itemId: string, cls = 'asset-item') => assetImg(`objets/${itemId}.webp`, cls);

/** Objet représentatif de chaque emplacement : sert d'icône aux cases vides et aux filtres par type. */
const KIND_ICON: Record<string, string> = {
  arc: 'arc_racineux',
  carquois: 'carquois_epines',
  coiffe: 'coiffe_lierre',
  cape: 'cape_feuilles',
  plastron: 'plastron_ecorce',
  bottes: 'bottes_mousse',
  amulette: 'amulette_seve',
  anneau: 'anneau_ronce',
};
export const kindIconImg = (kind: string, cls = 'asset-item') => itemIconImg(KIND_ICON[kind] ?? kind, cls);

/** Icône d'une ressource de craft (public/assets/ressources/<id>.webp). */
export const resourceIconImg = (resourceId: string, cls = 'asset-res') => assetImg(`ressources/${resourceId}.webp`, cls);
/** Icône des éclats de recyclage. */
export const shardIconImg = (cls = 'asset-res') => resourceIconImg('eclats', cls);
