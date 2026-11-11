/**
 * Format de la sauvegarde complète du joueur, versionné et migrable.
 *
 * La partie vit dans des clés `chabfu.*` (personnage, inventaire, atelier, réglages, scores…).
 * Une sauvegarde regroupe toutes ces clés, chacune avec sa valeur JSON décodée, sous une enveloppe
 * qui porte un numéro de version. Toute nouvelle clé `chabfu.*` (runes, challenges…) est donc
 * sauvegardée d'office, sans toucher à ce fichier.
 *
 * Quand la forme des données change, on monte SAVE_VERSION et on ajoute une étape dans MIGRATIONS :
 * une vieille sauvegarde est alors remise à niveau étape par étape au chargement.
 */

export const SAVE_FORMAT = 'chabfu-save';
export const SAVE_VERSION = 1;
/** Préfixe des clés du navigateur qui font partie de la partie. */
export const SAVE_KEY_PREFIX = 'chabfu.';

/** Les clés connues au moment de la version 1 (les seules qui existaient avant la sauvegarde serveur). */
export const SAVE_KEYS = {
  scores: 'chabfu.v1',
  character: 'chabfu.character.v1',
  inventory: 'chabfu.inventory.v1',
  crafting: 'chabfu.crafting.v1',
  settings: 'chabfu.settings.v1',
} as const;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  /** Date ISO de l'écriture. */
  savedAt: string;
  /** Clé `chabfu.*` → valeur JSON décodée. */
  data: Record<string, unknown>;
}

export class SaveError extends Error {}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * MIGRATIONS[n] fait passer les données de la version n à la version n + 1.
 * La version 0 désigne des données brutes sans enveloppe (les clés du navigateur d'avant la v1).
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (data) => data,
};

export function isSaveKey(key: string): boolean {
  return key.startsWith(SAVE_KEY_PREFIX);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valide une sauvegarde (fichier exporté, réponse du serveur) et la remet à la version courante. */
export function migrateSave(raw: unknown): SaveFile {
  if (!isRecord(raw)) throw new SaveError('Sauvegarde illisible');
  let version: number;
  let data: Record<string, unknown>;
  let savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : new Date(0).toISOString();
  if (raw.format === SAVE_FORMAT) {
    if (!Number.isInteger(raw.version) || (raw.version as number) < 1) throw new SaveError('Version de sauvegarde invalide');
    if (!isRecord(raw.data)) throw new SaveError('Sauvegarde sans données');
    version = raw.version as number;
    data = raw.data;
  } else if (raw.format === undefined && Object.keys(raw).length > 0 && Object.keys(raw).every(isSaveKey)) {
    // Ancien format : directement les clés du navigateur.
    version = 0;
    data = raw;
  } else {
    throw new SaveError("Ce fichier n'est pas une sauvegarde Chabfu");
  }
  if (version > SAVE_VERSION) throw new SaveError('Sauvegarde créée par une version plus récente du jeu');
  data = Object.fromEntries(Object.entries(data).filter(([k]) => isSaveKey(k)));
  while (version < SAVE_VERSION) {
    data = MIGRATIONS[version](data);
    version++;
  }
  return { format: SAVE_FORMAT, version, savedAt, data };
}

/** Une sauvegarde sans personnage ni inventaire ni score : rien à protéger. */
export function isEmptySave(save: SaveFile): boolean {
  return Object.keys(save.data).length === 0;
}

/** Lit toutes les clés `chabfu.*` d'un stockage clé/valeur (localStorage). */
export function saveFromStorage(storage: { length: number; key(i: number): string | null; getItem(k: string): string | null }, savedAt: string): SaveFile {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !isSaveKey(key)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      /* valeur corrompue : on ne la propage pas */
    }
  }
  return { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt, data };
}

/** Écrit une sauvegarde dans le stockage : les clés `chabfu.*` absentes de la sauvegarde sont retirées. */
export function saveToStorage(save: SaveFile, storage: { length: number; key(i: number): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }): void {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isSaveKey(key) && !(key in save.data)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
  for (const [key, value] of Object.entries(save.data)) storage.setItem(key, JSON.stringify(value));
}
