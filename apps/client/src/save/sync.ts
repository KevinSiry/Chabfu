/**
 * Synchronisation de la partie avec la base PostgreSQL (via l'API /api/save).
 *
 * Le jeu continue d'écrire ses clés `chabfu.*` dans le navigateur, qui sert de cache. Chaque écriture
 * est repérée ici et envoyée au serveur peu après ; au démarrage, la sauvegarde du serveur fait foi,
 * sauf si le navigateur a des changements qui n'ont pas pu partir (serveur arrêté pendant la partie).
 * Si le serveur n'a encore rien, la partie du navigateur y est envoyée : la progression d'avant
 * la base de données est reprise telle quelle.
 */
import { isEmptySave, isSaveKey, migrateSave, saveFromStorage, saveToStorage, type SaveFile } from '@chabfu/engine';

const API = '/api/save';
/** Hors du préfixe `chabfu.` : n'appartient pas à la sauvegarde. */
const META_KEY = 'chabfu-sync';
const PUSH_DELAY = 800;

export type SaveStatus = 'server' | 'pending' | 'offline';

interface Meta {
  /** Des changements locaux ne sont pas encore arrivés sur le serveur. */
  dirty: boolean;
  /** Date (ms) du dernier changement local. */
  changedAt: number;
}

let status: SaveStatus = 'offline';
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: SaveStatus) => void>();

function setStatus(s: SaveStatus): void {
  status = s;
  listeners.forEach((fn) => fn(s));
}

export function getSaveStatus(): SaveStatus {
  return status;
}

export function onSaveStatus(fn: (s: SaveStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const rawSet = Storage.prototype.setItem;

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Meta | null;
    return m ?? { dirty: false, changedAt: 0 };
  } catch {
    return { dirty: false, changedAt: 0 };
  }
}

function writeMeta(m: Meta): void {
  try {
    rawSet.call(localStorage, META_KEY, JSON.stringify(m));
  } catch {
    /* stockage plein ou bloqué */
  }
}

export function currentSave(): SaveFile {
  return saveFromStorage(localStorage, new Date().toISOString());
}

function markChanged(): void {
  writeMeta({ dirty: true, changedAt: Date.now() });
  if (status === 'server') setStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(() => void pushNow(), PUSH_DELAY);
}

/** Repère toutes les écritures du jeu dans le navigateur, sans toucher aux modules qui les font. */
function watchStorage(): void {
  const proto = Storage.prototype;
  const rawRemove = proto.removeItem;
  const rawClear = proto.clear;
  const isLocal = (s: Storage) => {
    try {
      return s === window.localStorage;
    } catch {
      return false;
    }
  };
  proto.setItem = function (key: string, value: string) {
    rawSet.call(this, key, value);
    if (!applying && isSaveKey(key) && isLocal(this)) markChanged();
  };
  proto.removeItem = function (key: string) {
    rawRemove.call(this, key);
    if (!applying && isSaveKey(key) && isLocal(this)) markChanged();
  };
  proto.clear = function () {
    rawClear.call(this);
    if (!applying && isLocal(this)) markChanged();
  };
}

async function put(save: SaveFile, keepalive = false): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(API, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(save), keepalive, signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Envoie tout de suite la partie au serveur (attend un envoi déjà en cours). */
export async function pushNow(): Promise<boolean> {
  clearTimeout(timer);
  if (inflight) await inflight;
  let ok = false;
  inflight = (async () => {
    const meta = readMeta();
    ok = await put(currentSave());
    // Un changement arrivé pendant l'envoi garde la sauvegarde « à envoyer ».
    if (ok && readMeta().changedAt === meta.changedAt) writeMeta({ ...meta, dirty: false });
    if (ok) setStatus(readMeta().dirty ? 'pending' : 'server');
    else setStatus('offline');
  })();
  await inflight;
  inflight = null;
  if (!ok) {
    // Serveur injoignable : nouvel essai plus tard, la partie reste dans le navigateur.
    clearTimeout(timer);
    timer = setTimeout(() => void pushNow(), 15000);
  }
  return ok;
}

/** Remplace la partie du navigateur par une sauvegarde (serveur ou fichier importé). */
export function applySave(save: SaveFile, markDirty: boolean): void {
  applying = true;
  try {
    saveToStorage(save, localStorage);
  } finally {
    applying = false;
  }
  writeMeta({ dirty: markDirty, changedAt: markDirty ? Date.now() : 0 });
}

async function fetchRemote(): Promise<{ save: unknown; updatedAt: string } | null | 'offline'> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(API, { signal: ctrl.signal, cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) return 'offline';
    return (await res.json()) as { save: unknown; updatedAt: string };
  } catch {
    return 'offline';
  } finally {
    clearTimeout(t);
  }
}

/** À appeler avant de charger le jeu : met le navigateur à jour avec la sauvegarde du serveur. */
export async function bootSave(): Promise<void> {
  let storageOk = true;
  try {
    void localStorage.length;
  } catch {
    storageOk = false;
  }
  if (!storageOk) return;
  watchStorage();
  const flush = () => {
    if (readMeta().dirty) void put(currentSave(), true);
  };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

  const remote = await fetchRemote();
  const local = currentSave();
  const meta = readMeta();
  if (remote === 'offline') {
    setStatus('offline');
    if (meta.dirty) timer = setTimeout(() => void pushNow(), 15000);
    return;
  }
  if (remote === null) {
    // Base neuve : on y envoie la partie du navigateur (reprise de la progression existante).
    if (isEmptySave(local)) setStatus('server');
    else {
      writeMeta({ dirty: true, changedAt: Date.now() });
      await pushNow();
    }
    return;
  }
  let remoteSave: SaveFile;
  try {
    remoteSave = migrateSave(remote.save);
  } catch (e) {
    console.error('Sauvegarde du serveur illisible, la partie du navigateur est gardée', e);
    setStatus('offline');
    return;
  }
  if (meta.dirty && !isEmptySave(local) && meta.changedAt > Date.parse(remote.updatedAt)) {
    // Des changements faits hors ligne sont plus récents que le serveur : ils l'emportent.
    await pushNow();
    return;
  }
  applySave(remoteSave, false);
  setStatus('server');
}
