import pg from 'pg';
import { createApp } from './app.ts';
import { pgStore } from './db.ts';

const port = Number(process.env.PORT ?? 3000);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
pool.on('error', (e) => console.error('PostgreSQL :', e.message));
const store = pgStore(pool);

// La base peut démarrer après l'API : on réessaie la création des tables.
for (let attempt = 1; ; attempt++) {
  try {
    await store.migrate();
    break;
  } catch (e) {
    if (attempt >= 30) throw e;
    console.log(`Base pas encore prête (${(e as Error).message}), nouvel essai…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const server = createApp(store).listen(port, () => console.log(`API de sauvegarde sur le port ${port}`));
const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
