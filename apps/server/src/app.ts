/**
 * Petite API de sauvegarde : le client envoie sa sauvegarde complète, la base la garde.
 * Le jeu est solo et local : une seule partie, sans compte.
 *
 *   GET  /api/health  état de l'API et de la base
 *   GET  /api/save    dernière sauvegarde (404 s'il n'y en a pas encore)
 *   PUT  /api/save    remplace la sauvegarde (l'ancienne part dans l'historique)
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export const SAVE_FORMAT = 'chabfu-save';
/** Taille maximale d'une sauvegarde reçue. */
export const MAX_BODY = 5 * 1024 * 1024;

export interface StoredSave {
  save: unknown;
  updatedAt: string;
}

export interface SaveStore {
  get(): Promise<StoredSave | null>;
  put(save: { version: number }): Promise<StoredSave>;
  ping(): Promise<void>;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Sauvegarde trop lourde');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
}

/** Contrôle de forme seulement : les migrations de contenu se font dans le jeu. */
export function validateSave(body: unknown): { version: number } {
  if (typeof body !== 'object' || body === null) throw new HttpError(400, 'Sauvegarde attendue');
  const b = body as Record<string, unknown>;
  if (b.format !== SAVE_FORMAT) throw new HttpError(400, 'Format de sauvegarde inconnu');
  if (!Number.isInteger(b.version) || (b.version as number) < 1) throw new HttpError(400, 'Version invalide');
  if (typeof b.data !== 'object' || b.data === null || Array.isArray(b.data)) throw new HttpError(400, 'Données manquantes');
  return b as { version: number };
}

export function createApp(store: SaveStore): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        await store.ping();
        return send(res, 200, { ok: true });
      }
      if (url.pathname === '/api/save') {
        if (req.method === 'GET') {
          const stored = await store.get();
          return stored ? send(res, 200, stored) : send(res, 404, { error: 'Aucune sauvegarde' });
        }
        if (req.method === 'PUT' || req.method === 'POST') {
          const save = validateSave(await readJson(req));
          const stored = await store.put(save);
          return send(res, 200, { updatedAt: stored.updatedAt });
        }
        throw new HttpError(405, 'Méthode non permise');
      }
      throw new HttpError(404, 'Introuvable');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 503, { error: 'Base de données indisponible' });
    }
  });
}
