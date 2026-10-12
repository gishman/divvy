/**
 * OPTIONAL dev convenience: runs a throwaway PostgreSQL locally via the
 * `embedded-postgres` package (no install needed). Use this only if you don't
 * have PostgreSQL running; otherwise point DATABASE_URL at your own server.
 *
 *   npm run db:local
 *   → DATABASE_URL=postgres://postgres:postgres@localhost:54329/divvy
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.LOCAL_PG_PORT || 54329);

const pg = new EmbeddedPostgres({
  databaseDir: path.join(root, '.pgdata'),
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
});

const fs = await import('node:fs');
if (!fs.existsSync(path.join(root, '.pgdata', 'PG_VERSION'))) await pg.initialise();
await pg.start();
try { await pg.createDatabase('divvy'); } catch { /* already exists */ }
console.log(`[db:local] PostgreSQL running → postgres://postgres:postgres@localhost:${port}/divvy  (Ctrl+C to stop)`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
