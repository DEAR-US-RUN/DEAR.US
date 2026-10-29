import process from 'node:process';
try { process.loadEnvFile('.env.local'); } catch { /* injected environment is also supported */ }
import { Pool } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('Set MIGRATION_DATABASE_URL to a migration-owner connection (not the runtime role).');
const pool = new Pool({ connectionString: url, max: 1 });
const db = await pool.connect();
try {
  await db.query('SELECT pg_advisory_lock(927431011)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile(`migrations/${name}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await db.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration ${name} was modified; add a new migration instead.`);
      console.log(`Already applied: ${name}`); continue;
    }
    await db.query('BEGIN');
    try { await db.query(sql); await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name,checksum]); await db.query('COMMIT'); console.log(`Applied: ${name}`); }
    catch (error) { await db.query('ROLLBACK'); throw error; }
  }
} finally { await db.query('SELECT pg_advisory_unlock(927431011)').catch(() => {}); db.release(); await pool.end(); }
