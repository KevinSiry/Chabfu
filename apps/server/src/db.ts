import pg from 'pg';
import type { SaveStore, StoredSave } from './app.ts';

/** Nombre d'anciennes sauvegardes gardées en filet de sécurité. */
const HISTORY_KEEP = 200;
/** La partie unique du jeu solo. */
const SLOT = 'main';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS saves (
  slot        text PRIMARY KEY,
  version     integer NOT NULL,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS save_history (
  id          bigserial PRIMARY KEY,
  slot        text NOT NULL,
  version     integer NOT NULL,
  data        jsonb NOT NULL,
  saved_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS save_history_slot_id ON save_history (slot, id DESC);
`;

export function pgStore(pool: pg.Pool): SaveStore & { migrate(): Promise<void> } {
  return {
    async migrate() {
      await pool.query(SCHEMA);
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    async get(): Promise<StoredSave | null> {
      const r = await pool.query('SELECT data, updated_at FROM saves WHERE slot = $1', [SLOT]);
      if (!r.rowCount) return null;
      return { save: r.rows[0].data, updatedAt: (r.rows[0].updated_at as Date).toISOString() };
    },
    async put(save): Promise<StoredSave> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // L'ancienne version part dans l'historique avant d'être remplacée.
        await client.query(
          `INSERT INTO save_history (slot, version, data, saved_at)
           SELECT slot, version, data, updated_at FROM saves WHERE slot = $1`,
          [SLOT],
        );
        await client.query(
          `DELETE FROM save_history WHERE slot = $1 AND id NOT IN
             (SELECT id FROM save_history WHERE slot = $1 ORDER BY id DESC LIMIT ${HISTORY_KEEP})`,
          [SLOT],
        );
        const r = await client.query(
          `INSERT INTO saves (slot, version, data, updated_at) VALUES ($1, $2, $3, now())
           ON CONFLICT (slot) DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data, updated_at = now()
           RETURNING updated_at`,
          [SLOT, save.version, JSON.stringify(save)],
        );
        await client.query('COMMIT');
        return { save, updatedAt: (r.rows[0].updated_at as Date).toISOString() };
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
