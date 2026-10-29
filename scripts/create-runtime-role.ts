import process from 'node:process';
try { process.loadEnvFile('.env.local'); } catch { /* injected environment is also supported */ }
import { Pool } from 'pg';
// Run manually as the migration owner. Set RUNTIME_ROLE_NAME and RUNTIME_ROLE_PASSWORD.
// Credentials remain in the environment; do not put command lines containing secrets in shell history.
const { MIGRATION_DATABASE_URL, RUNTIME_ROLE_NAME, RUNTIME_ROLE_PASSWORD } = process.env;
if (!MIGRATION_DATABASE_URL || !RUNTIME_ROLE_NAME || !RUNTIME_ROLE_PASSWORD) throw new Error('Set MIGRATION_DATABASE_URL, RUNTIME_ROLE_NAME, and RUNTIME_ROLE_PASSWORD.');
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(RUNTIME_ROLE_NAME)) throw new Error('Invalid PostgreSQL role name.');
const pool = new Pool({ connectionString: MIGRATION_DATABASE_URL, max: 1 });
const db = await pool.connect();
const name = '"' + RUNTIME_ROLE_NAME + '"';
// pg cannot parameterize role DDL; escape a secret as a SQL literal and never log it.
const password = "'" + RUNTIME_ROLE_PASSWORD.replace(/'/g, "''") + "'";
try {
  await db.query('BEGIN');
  const found = await db.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[RUNTIME_ROLE_NAME]);
  if (!found.rowCount) await db.query(`CREATE ROLE ${name} LOGIN PASSWORD ${password} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  else {
    const role=found.rows[0];
    if(role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolbypassrls) throw new Error('Existing runtime role has elevated privileges; choose a restricted role.');
  }
  const inherited=await db.query('SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1 LIMIT 1',[RUNTIME_ROLE_NAME]);
  const owns=await db.query(`SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
    WHERE r.rolname=$1 AND c.relnamespace='public'::regnamespace
    UNION ALL SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE r.rolname=$1 AND d.datname=current_database() LIMIT 1`,[RUNTIME_ROLE_NAME]);
  if(inherited.rowCount||owns.rowCount)throw new Error('Runtime role must not inherit any role or own the application database/tables. Create a fresh SQL role.');
  if(found.rowCount)await db.query(`ALTER ROLE ${name} WITH LOGIN PASSWORD ${password}`);
  // This is a dedicated application database. Remove default/public schema DDL access and
  // prior explicit table grants before assigning the precise application permissions.
  await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await db.query(`REVOKE CREATE ON SCHEMA public FROM ${name}`);
  await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${name}`);
  await db.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${name}`);
  const currentDb=(await db.query('SELECT current_database() AS name')).rows[0].name as string;
  await db.query(`GRANT CONNECT ON DATABASE "${currentDb.replace(/"/g,'""')}" TO ${name}`);
  await db.query(`GRANT USAGE ON SCHEMA public TO ${name}`);
  await db.query(`GRANT SELECT, INSERT, UPDATE ON users, diaries, diary_invitations, feelings_vault, connection_state, media_uploads, support_requests, rate_limits TO ${name}`);
  await db.query(`GRANT SELECT, INSERT ON diary_members, diary_key_envelopes, vault_approvals, published_entries, entry_attachments, streak_events, owner_access_requests, audit_logs, draft_save_operations TO ${name}`);
  await db.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON drafts TO ${name}`);
  await db.query(`GRANT DELETE ON media_uploads, rate_limits, draft_save_operations TO ${name}`);
  await db.query(`GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO ${name}`);
  const broad=await db.query(`SELECT has_schema_privilege($1,'public','CREATE') AS schema_create,
    has_table_privilege($1,'public.published_entries','UPDATE,DELETE,TRUNCATE,TRIGGER') AS entry_mutation`,[RUNTIME_ROLE_NAME]);
  if(broad.rows[0].schema_create||broad.rows[0].entry_mutation)throw new Error('Runtime inherited unexpected public privileges. Revoke PUBLIC grants in the dedicated database and re-run.');
  await db.query('COMMIT');
  console.log('Runtime role created/updated with application grants. Use its own pooled URL for DATABASE_URL.');
} catch(error) { await db.query('ROLLBACK').catch(()=>{});throw error; }
finally { db.release();await pool.end(); }
