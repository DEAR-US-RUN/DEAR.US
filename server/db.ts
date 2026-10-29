import { Pool, type PoolClient } from 'pg';
let pool: Pool | undefined;
export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000, statement_timeout: 15_000 });
    pool.on('error', () => console.error(JSON.stringify({level:'error', event:'database_pool_error'})));
  }
  return pool;
}
export async function query<T extends import('pg').QueryResultRow = any>(sql: string, values: unknown[] = []) { return getPool().query<T>(sql, values); }
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
export async function closePool() { if (pool) { const p = pool; pool = undefined; await p.end(); } }
