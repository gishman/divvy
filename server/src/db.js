import pg from 'pg';
import { config } from './config.js';

// Return BIGINT/NUMERIC as JS numbers (all our values are well within range).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
// Keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

pool.on('error', (err) => console.error('[db] idle client error', err.message));

export const query = (text, params) => pool.query(text, params);

/** Run `fn(client)` inside a transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
