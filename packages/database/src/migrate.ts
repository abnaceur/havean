import pg from 'pg';
import fs from 'node:fs';
const pool=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL});
const c=await pool.connect();
try{await c.query('SELECT pg_advisory_lock(902106)');const exists=await c.query("SELECT to_regclass('public.schema_migrations') AS name");for(const name of fs.readdirSync('packages/database/migrations').sort()){if(exists.rows[0].name && (await c.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount)continue;await c.query('BEGIN');try{await c.query(fs.readFileSync('packages/database/migrations/'+name,'utf8'));await c.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);await c.query('COMMIT');console.log('Applied '+name);}catch(e){await c.query('ROLLBACK');throw e;}}
 await c.query('GRANT USAGE ON SCHEMA public TO haven_app');await c.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO haven_app');await c.query('REVOKE DELETE ON audit_events,charges,payments,deposits FROM haven_app');await c.query('REVOKE UPDATE ON audit_events,deposits FROM haven_app');
}finally{await c.query('SELECT pg_advisory_unlock(902106)');c.release();await pool.end();}
