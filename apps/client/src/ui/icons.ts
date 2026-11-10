/**
 * Jeu d'icônes de Chabfu, dessiné pour le jeu (grille de 24 px, trait de 2 px, bouts arrondis).
 * Remplace tous les caractères Unicode et émojis utilisés comme icônes.
 * `icon('nom')` renvoie un <svg> en ligne qui prend la couleur du texte (currentColor).
 */

type IconDef = string | { d: string; fill?: true };

/** Tracés : chaque chaîne est le contenu du <svg viewBox="0 0 24 24">. */
const ICONS: Record<string, IconDef> = {
  // --- Navigation ---
  dungeons: '<path d="M3.5 3.5 13 13"/><path d="m10.5 15.5 5-5"/><path d="m15 15 4.5 4.5"/><path d="M20.5 3.5 11 13"/><path d="m8.5 10.5 5 5"/><path d="M9 15l-4.5 4.5"/>',
  grimoire: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h13v-4"/><path d="m11.5 7 1 2.2 2.3.3-1.7 1.6.4 2.4-2-1.2-2.1 1.2.4-2.4-1.7-1.6 2.4-.3Z"/>',
  equipment: '<path d="M12 2.8 19.5 6v5.2c0 4.6-3.1 8.4-7.5 10-4.4-1.6-7.5-5.4-7.5-10V6Z"/><path d="M12 7.5v9"/><path d="M8.5 11h7"/>',
  workshop: '<path d="M4 7h16v1.5A3.5 3.5 0 0 1 16.5 12h-9A3.5 3.5 0 0 1 4 8.5Z"/><path d="M10 12v4M14 12v4"/><path d="M7 20l1.5-4h7l1.5 4Z"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  menu: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.8"/><path d="M12 17.3v.1"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cross: '<path d="M7 7l10 10M17 7 7 17"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2"/>',
  star: { d: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z"/>', fill: true },
  sparkle: { d: '<path d="M12 2.5c.6 4.4 2.9 6.9 7.5 7.5-4.6.6-6.9 3.1-7.5 7.5-.6-4.4-2.9-6.9-7.5-7.5 4.6-.6 6.9-3.1 7.5-7.5Z"/><path d="M19 15.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z"/>', fill: true },
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9.5 2.5h5"/>',
  turns: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4.5V10h5.5"/>',
  forward: { d: '<path d="M4 6.5v11l7.5-5.5Z"/><path d="M12.5 6.5v11L20 12Z"/>', fill: true },
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/><path d="M9.9 10a3 3 0 0 0 4.2 4.2"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  vibrate: '<rect x="8" y="3.5" width="8" height="17" rx="2"/><path d="M4.5 8v8M19.5 8v8"/>',
  trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0Z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4"/><path d="M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5Z"/>',
  bag: '<path d="M6 8.5h12l-1 12H7Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  shard: { d: '<path d="M12 2.5 18 9l-6 12.5L6 9Z"/>', fill: true },
  recycle: '<path d="M8.5 6.5 10.5 3h3l2.5 4.5"/><path d="m16 7.5 1.5-2.5M16 7.5h-3"/><path d="M19.5 12 21 15l-1.5 3H15"/><path d="m15 18 1.5 2.5M15 18l1.5-2.5"/><path d="M8.5 18H4.5L3 15l2.5-4.5"/><path d="M5.5 10.5 3 10M5.5 10.5 6.8 13"/>',
  hammer: '<path d="m13.5 7.5-9 9a2 2 0 0 0 3 3l9-9"/><path d="m11 5 4-2.5 6.5 6.5L19 13Z"/>',
  levelUp: '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/><path d="M5 20h14"/>',
  arrowUp: { d: '<path d="M12 5 19 14H5Z"/>', fill: true },
  arrowDown: { d: '<path d="M12 19 5 10h14Z"/>', fill: true },
  arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r=".9"/><circle cx="15.5" cy="15.5" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="15.5" cy="8.5" r=".9"/><circle cx="8.5" cy="15.5" r=".9"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5c5-2.5 8 2.5 14 0v9c-6 2.5-9-2.5-14 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  logbook: '<path d="M7 3.5h12v17H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/><path d="M9 8h7M9 12h7M9 16h4"/>',

  // --- Combat ---
  skull: '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.4 3 5.5V20h9v-4c1.7-1.1 3-2.9 3-5.5A7.5 7.5 0 0 0 12 3Z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10.5 20v-2.5M13.5 20v-2.5"/>',
  sword: '<path d="M14.5 3.5h6v6L10 20l-3-3Z"/><path d="m4 14 6 6"/><path d="m3.5 20.5 2-2"/>',
  bow: '<path d="M8 3a13 13 0 0 1 0 18"/><path d="M8 3v18"/><path d="M3 12h17"/><path d="m17 9 3 3-3 3"/>',
  heart: { d: '<path d="M12 20.5S3.5 15.3 3.5 9.3A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.3c0 6-8.5 11.2-8.5 11.2Z"/>', fill: true },
  pa: { d: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6Z"/>', fill: true },
  pm: '<path d="M8 3.5c1.7 0 2.5 1.5 2.5 3.5S9.2 11 8 11 5.5 9 5.5 7 6.3 3.5 8 3.5Z"/><path d="M6 13.5h4l-.5 3a1.6 1.6 0 0 1-3 0Z"/><path d="M16 8.5c1.7 0 2.5 1.5 2.5 3.5S17.2 16 16 16s-2.5-2-2.5-4 .8-3.5 2.5-3.5Z"/><path d="M14 18.5h4l-.5 1.5a1.6 1.6 0 0 1-3 0Z"/>',
  conc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  burn: { d: '<path d="M12 2.5c1 3.5 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.3 2.5-5.3-.1 1.9.6 3.3 2 3.8C10 8.8 10.8 5.5 12 2.5Z"/>', fill: true },
  slow: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="m10 4.5 2 1.5 2-1.5M10 19.5l2-1.5 2 1.5"/>',
  push: '<path d="M3.5 12h12"/><path d="m11 7 5 5-5 5"/><path d="M20 5v14"/>',
  jump: '<path d="M4 18c3-9 9-12 16-11"/><path d="m15.5 3.5 4.5 3.5-3.5 4.5"/><path d="M3 21h6"/>',
  impact: { d: '<path d="m12 2 2 6 6-3-3 6 5 2-5 2 3 6-6-3-2 6-2-6-6 3 3-6-5-2 5-2-3-6 6 3Z"/>', fill: true },
  move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  range: '<circle cx="12" cy="12" r="2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M6.3 6.3a8 8 0 0 1 11.4 0M17.7 17.7a8 8 0 0 1-11.4 0"/>',
  shield: '<path d="M12 3 19 6v5c0 4.5-3 8.2-7 9.8C8 19.2 5 15.5 5 11V6Z"/>',

  // --- Éléments (formes pleines, distinctes sans la couleur) ---
  fire: { d: '<path d="M12 2.5c1 3.5 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.3 2.5-5.3-.1 1.9.6 3.3 2 3.8C10 8.8 10.8 5.5 12 2.5Z"/>', fill: true },
  water: { d: '<path d="M12 2.5S5.5 9.8 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 9.8 12 2.5 12 2.5Z"/>', fill: true },
  earth: { d: '<path d="M2.5 19.5 9 8l3.5 5 2.5-3.5 6.5 10Z"/>', fill: true },
  air: '<path d="M3 8.5h11a3 3 0 1 0-3-3"/><path d="M3 12.5h16a3 3 0 1 1-3 3"/><path d="M3 16.5h7"/>',
  neutral: { d: '<path d="M12 3 20 12 12 21 4 12Z"/>', fill: true },

  // --- Emplacements d'équipement ---
  slotHead: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M3 15h18v2.5H3Z"/><path d="M12 7V4.5"/>',
  slotNeck: '<path d="M5 3.5c0 6 3 9.5 7 9.5s7-3.5 7-9.5"/><path d="M12 13 9.5 16.5 12 21l2.5-4.5Z"/>',
  slotCape: '<path d="M8 3.5h8l3.5 17-3.5-1.5-4 2-4-2-3.5 1.5Z"/><path d="M8 3.5c0 2 1.8 3.5 4 3.5s4-1.5 4-3.5"/>',
  slotChest: '<path d="M8 3.5 4 6l1.5 5H7v9.5h10V11h1.5L20 6l-4-2.5c-.5 1.8-2 3-4 3s-3.5-1.2-4-3Z"/>',
  slotRing: '<circle cx="12" cy="14.5" r="6"/><path d="m9.5 8.5 2.5-5 2.5 5"/>',
  slotBoots: '<path d="M7 3.5h6v9l6.5 3a1.5 1.5 0 0 1 1 1.4V20.5H5V12Z"/><path d="M5 17h15.5"/>',
  slotBow: '<path d="M8 3a13 13 0 0 1 0 18"/><path d="M8 3v18"/><path d="M3 12h17"/><path d="m17 9 3 3-3 3"/>',
  slotQuiver: '<path d="M8 9h8l-1.5 12h-5Z"/><path d="m10 9 1-6.5M14 9l-1-6.5M12 9V2.5"/>',
};

export type IconName = keyof typeof ICONS;

export function icon(name: string, cls = '', label?: string): string {
  const def = ICONS[name];
  if (!def) return '';
  const body = typeof def === 'string' ? def : def.d;
  const filled = typeof def !== 'string' && def.fill;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ico ico-${name}${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" ${a11y} fill="${filled ? 'currentColor' : 'none'}" stroke="${filled ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** Icône d'élément, couleur de l'élément comprise. */
export function elementIcon(element: string, cls = ''): string {
  return icon(element, `el-ico el-ico-${element}${cls ? ` ${cls}` : ''}`);
}

/** Icône d'emplacement d'équipement selon le type d'objet. */
const KIND_ICON: Record<string, string> = {
  coiffe: 'slotHead',
  amulette: 'slotNeck',
  cape: 'slotCape',
  plastron: 'slotChest',
  anneau: 'slotRing',
  bottes: 'slotBoots',
  arc: 'slotBow',
  carquois: 'slotQuiver',
};
export function kindIcon(kind: string, cls = ''): string {
  return icon(KIND_ICON[kind] ?? 'bag', cls);
}

export const ICON_NAMES = Object.keys(ICONS);
