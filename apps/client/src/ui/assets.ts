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
